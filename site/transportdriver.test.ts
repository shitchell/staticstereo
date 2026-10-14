import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runTransport } from './transportdriver.js'
import { frameTimesOf, initialTransport, play, timeAt, timeOfFrame } from './transport.js'
import { sceneFps, stillTime } from '../src/core/index.js'
import type { Scene } from '../src/core/types.js'

const ANIM: Scene = { size: [64, 32], fps: 12, duration: 2, layers: [{ type: 'text', text: 'A' }] }
const STILL: Scene = { size: [64, 32], layers: [{ type: 'text', text: 'A' }] }
const INTERVAL = 1000 / sceneFps(ANIM)

const SOURCE = readFileSync(new URL('./transportdriver.ts', import.meta.url), 'utf8')

/**
 * A clock and a scheduler the test owns outright.
 *
 * Nothing here is a timer. `advance` is the only thing that moves time and
 * `run` is the only thing that fires a callback, so a test states a whole
 * playback session as a sequence of values rather than waiting for one. The
 * test environment is plain node with no DOM and no fake-timer plugin, which
 * is the other reason the driver takes its scheduler as an argument.
 */
function fakeClock() {
  const live = new Map<number, { fn: () => void; due: number }>()
  const api = {
    /** Milliseconds the driver renders a frame in, charged inside `onFrame`. */
    cost: 0,
    ms: 0,
    nextId: 1,
    /** Every delay the driver has asked for, in order. */
    delays: [] as number[],
    /** Every scene time the driver has emitted, in seconds, in order. */
    frames: [] as number[],
    /** The clock reading at each emission. */
    stamps: [] as number[],
    now: (): number => api.ms,
    advance: (by: number): void => { api.ms += by },
    schedule: (fn: () => void, delay: number): number => {
      api.delays.push(delay)
      const id = api.nextId++
      live.set(id, { fn, due: api.ms + delay })
      return id
    },
    cancel: (id: number): void => { live.delete(id) },
    onFrame: (seconds: number): void => {
      api.frames.push(seconds)
      api.stamps.push(api.ms)
      api.ms += api.cost
    },
    pending: (): number => live.size,
    /** Fire the earliest outstanding callback, moving the clock to its due time. */
    run: (count = 1): void => {
      for (let i = 0; i < count; i++) {
        const next = [...live.entries()].sort((a, b) => a[1].due - b[1].due)[0]
        if (!next) return
        live.delete(next[0])
        api.ms = Math.max(api.ms, next[1].due)
        next[1].fn()
      }
    },
  }
  return api
}

const driverFor = (clock: ReturnType<typeof fakeClock>, scene: Scene = ANIM) =>
  runTransport({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onFrame: clock.onFrame,
    scene,
  })

describe('runTransport', () => {
  it('schedules exactly one tick when play starts, and emits no frame yet', () => {
    // The frame on screen is already the frame the playhead is on; emitting it
    // again on play would re-render it for nothing.
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    expect(c.pending()).toBe(1)
    expect(c.frames).toEqual([])
    expect(c.delays).toEqual([INTERVAL])
    expect(d.playing()).toBe(true)
  })

  it('emits the time timeAt gives for the clock reading at that tick', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    c.run(5)
    // Built independently of the driver, from the state machine alone.
    const expected = play(initialTransport(ANIM), 0)
    expect(c.frames).toHaveLength(5)
    c.frames.forEach((seconds, i) => {
      expect(seconds, `tick ${i}`).toBe(timeAt(expected, c.stamps[i]!, ANIM))
      expect(seconds, `tick ${i}`).toBe(timeOfFrame(ANIM, i + 1))
    })
  })

  it('wraps rather than stopping, so a loop keeps running', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    const count = frameTimesOf(ANIM).length
    c.run(count + 2)
    expect(c.frames[count - 1]).toBe(timeOfFrame(ANIM, 0))
    expect(c.frames[count]).toBe(timeOfFrame(ANIM, 1))
    expect(c.pending()).toBe(1)
  })

  it('cancels the pending tick on pause, and emits nothing afterwards', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    c.run(3)
    const emitted = c.frames.length
    expect(emitted).toBe(3)
    d.pause()
    expect(c.pending()).toBe(0)
    expect(d.playing()).toBe(false)
    // Drive the scheduler to exhaustion and run the clock well past several
    // frame intervals: a cancelled handle that was still live would fire here.
    c.run(10)
    c.advance(10_000)
    c.run(10)
    expect(c.frames).toHaveLength(emitted)
  })

  it('does not start a second loop when play is called again', () => {
    // Two concurrent loops double the render rate and fight over the anchor;
    // a button that can be clicked twice is the normal way to get there.
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    d.play()
    d.play()
    expect(c.pending()).toBe(1)
    for (let k = 1; k <= 4; k++) {
      c.run(1)
      expect(c.pending(), `after tick ${k}`).toBe(1)
      expect(c.frames, `after tick ${k}`).toHaveLength(k)
      expect(c.frames[k - 1]).toBe(timeOfFrame(ANIM, k))
    }
  })

  it('asks for the frame interval minus the time the frame took, never negative', () => {
    // Inherited from today's playLoop: a render slower than the interval must
    // not compound into drift, and must not ask for a negative delay either.
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    for (const cost of [0, 30, 500]) {
      c.cost = cost
      const before = c.delays.length
      c.run(1)
      expect(c.delays, `cost ${cost}`).toHaveLength(before + 1)
      expect(c.delays[before], `cost ${cost}`).toBeCloseTo(Math.max(0, INTERVAL - cost), 6)
      expect(c.delays[before], `cost ${cost}`).toBeGreaterThanOrEqual(0)
    }
    // A fast frame and a slow one were both exercised, and the slow one really
    // was slower than the interval.
    expect(500).toBeGreaterThan(INTERVAL)
  })

  it('stops idempotently, and stays stopped', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    c.run(2)
    const emitted = c.frames.length
    d.stop()
    d.stop()
    d.stop()
    expect(c.pending()).toBe(0)
    d.play()
    d.toggle()
    expect(c.pending()).toBe(0)
    c.run(5)
    expect(c.frames).toHaveLength(emitted)
    expect(d.playing()).toBe(false)
  })

  it('toggles between running and not', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.toggle()
    expect(d.playing()).toBe(true)
    expect(c.pending()).toBe(1)
    c.run(2)
    d.toggle()
    expect(d.playing()).toBe(false)
    expect(c.pending()).toBe(0)
  })

  it('emits the sought frame on a seek, and re-arms only while playing', () => {
    const c = fakeClock()
    const d = driverFor(c)
    d.play()
    c.run(2)
    d.seek(1.5)
    expect(c.frames[c.frames.length - 1]).toBe(timeOfFrame(ANIM, 18))
    expect(c.pending()).toBe(1)
    expect(c.delays[c.delays.length - 1]).toBeCloseTo(INTERVAL, 6)
    expect(d.time()).toBe(timeOfFrame(ANIM, 18))

    d.pause()
    const emitted = c.frames.length
    d.seek(0.25)
    expect(c.frames).toHaveLength(emitted + 1)
    expect(c.frames[emitted]).toBe(timeOfFrame(ANIM, 3))
    expect(c.pending()).toBe(0)
  })

  it('refuses to loop a still, exactly as the player it replaces does', () => {
    // playLoop breaks out on `times.length <= 1`. Re-encoding one unchanging
    // stereogram twelve times a second is pure waste, and the state machine
    // already guarantees the time would never change.
    const c = fakeClock()
    const d = driverFor(c, STILL)
    d.play()
    expect(c.pending()).toBe(0)
    expect(c.frames).toEqual([])
    expect(d.playing()).toBe(false)
    d.seek(9)
    expect(c.frames).toEqual([stillTime(STILL)])
  })

  it('reads time only through the injected clock', () => {
    // The same fake readings twice, with real wall time passing in between.
    // Anything reading a real clock would diverge across the two runs.
    const session = (): number[] => {
      const c = fakeClock()
      const d = driverFor(c)
      d.play()
      c.cost = 20
      c.run(4)
      d.seek(1.75)
      c.run(3)
      d.pause()
      c.run(2)
      return [...c.frames, ...c.delays]
    }
    const first = session()
    const started = Date.now()
    while (Date.now() - started < 15) { /* burn real wall time, deliberately */ }
    expect(session()).toEqual(first)
    expect(first.length).toBeGreaterThan(8)
  })

  it('never reaches for a clock, a timer or the page itself', () => {
    for (const forbidden of [
      /\bDate\s*\.\s*now\s*\(/, /\bperformance\s*\./, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/,
      /\brequestAnimationFrame\s*\(/, /\bdocument\b/, /\bwindow\b/, /addEventListener/,
    ]) {
      expect(SOURCE, String(forbidden)).not.toMatch(forbidden)
    }
    // Module-level `let`/`var`: the loop's mutable state belongs to one driver,
    // not to the module, or two players on one page would share a playhead.
    expect(SOURCE).not.toMatch(/^(let|var)\s/m)
    expect(SOURCE).not.toMatch(/from\s+'\.\/(controls|main|examples|legibility|diagnostics|depthmap|stageguide)/)
    // The cadence decision has to be recorded, not just implemented.
    expect(SOURCE).toMatch(/requestAnimationFrame/)
    // Vacuity floor.
    expect(SOURCE).toContain('export function runTransport')
    expect(SOURCE.length).toBeGreaterThan(2_000)
  })
})
