// One-off experiment, deliberately NOT in the repo. Reimplements the shift
// encoder in 15 lines so the inversion is visible and nothing in core changes.
import { createCanvas } from '/home/guy/code/git/github.com/shitchell/staticstereo/node_modules/@napi-rs/canvas/index.js'
const { noiseAt } = await import('/home/guy/code/git/github.com/shitchell/staticstereo/dist/core/rng.js')

const W = 800, H = 400, SEP_FAR = 110, SEP_NEAR = 92, NS = 2, SEED = 7

// A single big raised slab: the question is about the PLANE, not legibility.
function depth() {
  const d = new Float32Array(W * H)
  for (let y = 100; y < 300; y++) for (let x = 250; x < 550; x++) d[y * W + x] = 1
  return d
}

/**
 * @param invert  when true, a pixel on the RAISED plane is the complement of
 *                its partner instead of a copy. So the left-eye piece reads
 *                [0,1,0,...] where the right-eye piece reads [1,0,1,...].
 */
function encode(d, invert) {
  const out = new Uint8Array(W * H)
  const range = SEP_FAR - SEP_NEAR
  for (let y = 0; y < H; y++) {
    const base = y * W
    for (let x = 0; x < W; x++) {
      const z = d[base + x]
      const sep = Math.round(SEP_FAR - z * range)
      const src = x - sep
      if (src < 0) { out[base + x] = noiseAt(SEED, x, y) < 0.5 ? 0 : 255; continue }
      const v = out[base + src]
      // Invert only where the pair belongs to the raised plane.
      out[base + x] = (invert && z > 0.5) ? (255 - v) : v
    }
  }
  return out
}

function write(buf, path) {
  const cv = createCanvas(W * NS, H * NS), ctx = cv.getContext('2d')
  const img = ctx.createImageData(W * NS, H * NS)
  for (let y = 0; y < H * NS; y++) for (let x = 0; x < W * NS; x++) {
    const v = buf[Math.floor(y / NS) * W + Math.floor(x / NS)]
    const i = (y * W * NS + x) * 4
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  require('node:fs').writeFileSync(path, cv.toBuffer('image/png'))
}
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const d = depth()
const normal = encode(d, false)
const anti = encode(d, true)

// Sanity: on the raised plane, how often does a pixel EQUAL its partner?
function agree(buf, x0, x1, y0, y1, lag) {
  let m = 0, n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x - lag < 0) continue
    n++; if (buf[y * W + x] === buf[y * W + x - lag]) m++
  }
  return (m / n).toFixed(3)
}
console.log('on the raised slab (x 250-550, y 100-300), agreement at lag sepNear=92:')
console.log('  normal        :', agree(normal, 250, 550, 100, 300, SEP_NEAR), '(1.000 = identical partners)')
console.log('  anticorrelated:', agree(anti, 250, 550, 100, 300, SEP_NEAR), '(0.000 = complementary partners)')
console.log('background, lag sepFar=110:')
console.log('  normal        :', agree(normal, 600, 800, 20, 80, SEP_FAR))
console.log('  anticorrelated:', agree(anti, 600, 800, 20, 80, SEP_FAR))

const order = process.argv[2] === 'swap' ? [['a', anti], ['b', normal]] : [['a', normal], ['b', anti]]
for (const [label, buf] of order) write(buf, `${process.env.T}/invtest-${label}.png`)
console.log('\nwrote invtest-a.png and invtest-b.png')
