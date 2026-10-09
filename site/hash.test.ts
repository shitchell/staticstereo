import { describe, expect, it } from 'vitest'
import {
  HASH_VERSION,
  base64UrlToBytes,
  bytesToBase64Url,
  encodeSceneHash,
  parseSceneHash,
} from './hash.js'
import type { Scene } from '../src/core/types.js'

const SCENE: Scene = {
  size: [320, 180],
  fps: 12,
  duration: 2,
  freezeNoise: false,
  stereo: { sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7 },
  layers: [{ type: 'text', text: 'HELLO', size: 60, depth: 0.6, anim: { kind: 'marquee', speed: 60 } }],
}

describe('base64url', () => {
  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    expect([...base64UrlToBytes(bytesToBase64Url(bytes))]).toEqual([...bytes])
  })

  it('emits only characters that survive a URL fragment unescaped', () => {
    // A hash is copied, pasted and re-parsed by browsers. '+' and '/' from
    // standard base64 are the trap: '+' is legal in a fragment but becomes a
    // space the moment anything treats the fragment as a query string, and '='
    // padding is noise. The unreserved set is the only safe one.
    const bytes = new Uint8Array(512)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 0xff
    const encoded = bytesToBase64Url(bytes)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round-trips every input length modulo 3, which is where padding differs', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i++) bytes[i] = 200 + i
      expect([...base64UrlToBytes(bytesToBase64Url(bytes))], `length ${n}`).toEqual([...bytes])
    }
  })
})

describe('encodeSceneHash / parseSceneHash', () => {
  it('round-trips a scene', () => {
    expect(parseSceneHash(encodeSceneHash(SCENE))).toEqual(SCENE)
  })

  it('carries a version prefix', () => {
    expect(encodeSceneHash(SCENE).startsWith(`${HASH_VERSION}.`)).toBe(true)
  })

  it('accepts the hash with or without its leading #', () => {
    const h = encodeSceneHash(SCENE)
    expect(parseSceneHash(`#${h}`)).toEqual(SCENE)
    expect(parseSceneHash(h)).toEqual(SCENE)
  })

  it('reports no scene for an absent or bare hash', () => {
    expect(parseSceneHash('')).toBeUndefined()
    expect(parseSceneHash('#')).toBeUndefined()
    expect(parseSceneHash('   ')).toBeUndefined()
  })

  it('survives non-ASCII and astral-plane text', () => {
    // The reason this test exists: `btoa(String.fromCharCode(...))` over a
    // JavaScript string throws on any code unit above 0xff, so the obvious
    // one-line encoder breaks on the first accented character and the
    // *slightly* less obvious one mangles surrogate pairs. Text layers are the
    // single most likely place for either.
    const scene: Scene = {
      ...SCENE,
      layers: [{ type: 'text', text: 'héllo wörld \u{1F4FA}\u{1F3B5}' }],
    }
    const back = parseSceneHash(encodeSceneHash(scene)) as Scene
    expect(back).toEqual(scene)
    expect((back.layers[0] as { text: string }).text).toBe('héllo wörld \u{1F4FA}\u{1F3B5}')
  })

  it('names the version it does not understand', () => {
    expect(() => parseSceneHash('v9.abcd')).toThrowError(/v9/)
  })

  it('rejects a hash with no version separator rather than guessing', () => {
    expect(() => parseSceneHash('eyJhIjoxfQ')).toThrowError(/version/i)
  })

  it('explains a corrupt payload instead of throwing a decoder error', () => {
    expect(() => parseSceneHash(`${HASH_VERSION}.!!!!`)).toThrowError(/could not be decoded/i)
  })

  it('explains a payload that decodes but is not JSON', () => {
    const notJson = bytesToBase64Url(new TextEncoder().encode('{nope'))
    expect(() => parseSceneHash(`${HASH_VERSION}.${notJson}`)).toThrowError(/JSON/)
  })

  it('is stable: re-encoding a parsed scene gives the same hash', () => {
    const once = encodeSceneHash(SCENE)
    const twice = encodeSceneHash(parseSceneHash(once) as Scene)
    expect(twice).toBe(once)
  })
})
