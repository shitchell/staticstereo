import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const R = '/home/guy/code/git/github.com/shitchell/staticstereo/'
const { createCanvas } = require(R + 'node_modules/@napi-rs/canvas')
const { noiseAt } = await import(R + 'dist/core/rng.js')
const fs = require('node:fs')

const W = 800, H = 400, SEP_FAR = 110, SEP_NEAR = 92, NS = 2, SEED = 7
const CX = 400, CY = 200, RAD = 140, RIM = 14
const inDisc = (x, y, r = RAD) => (x - CX) ** 2 + (y - CY) ** 2 <= r * r

// Highlight centre at 75% of the radius toward top-right, as before.
const HX = CX + 0.75 * RAD * Math.SQRT1_2
const HY = CY - 0.75 * RAD * Math.SQRT1_2

/**
 * Per-pixel inversion PROBABILITY, not a binary mask.
 *
 * Anticorrelation is binary per pixel, but the inverted FRACTION is
 * continuous — so partner agreement runs smoothly 1.000 (none inverted)
 * through 0.500 (half: no correlation at all) to 0.000 (all inverted).
 * That gives a real gradient of binocular correspondence, which is the
 * continuous thing a specular falloff would need.
 */
function strength(x, y, sigma) {
  if (!inDisc(x, y, RAD - RIM)) return 0        // rim stays fully correlated
  const d = Math.hypot(x - HX, y - HY)
  return Math.exp(-(d * d) / (2 * sigma * sigma))   // gaussian falloff
}

function encode(sigma) {
  const out = new Uint8Array(W * H)
  const range = SEP_FAR - SEP_NEAR
  for (let y = 0; y < H; y++) {
    const base = y * W
    for (let x = 0; x < W; x++) {
      const z = inDisc(x, y) ? 1 : 0
      const sep = Math.round(SEP_FAR - z * range)
      const src = x - sep
      if (src < 0) { out[base + x] = noiseAt(SEED, x, y) < 0.5 ? 0 : 255; continue }
      const v = out[base + src]
      // A second, independent positional hash decides THIS pixel's flip, so
      // the gradient is deterministic and does not shimmer frame to frame.
      const flip = noiseAt(SEED + 1013, x, y) < strength(x, y, sigma)
      out[base + x] = flip ? 255 - v : v
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
    img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255
  }
  ctx.putImageData(img, 0, 0)
  fs.writeFileSync(path, cv.toBuffer('image/png'))
}

// Confirm the gradient is actually in the image: agreement by distance ring.
function profile(buf) {
  const rings = [0, 15, 30, 45, 60, 80, 110]
  const out = []
  for (let i = 0; i < rings.length - 1; i++) {
    let m = 0, n = 0
    for (let y = 0; y < H; y++) for (let x = SEP_NEAR; x < W; x++) {
      if (!inDisc(x, y)) continue
      const d = Math.hypot(x - HX, y - HY)
      if (d < rings[i] || d >= rings[i + 1]) continue
      n++; if (buf[y * W + x] === buf[y * W + x - SEP_NEAR]) m++
    }
    out.push(`${rings[i]}-${rings[i+1]}px:${n ? (m / n).toFixed(2) : ' n/a'}`)
  }
  return out.join('  ')
}

for (const [name, sigma] of [['tight', 28], ['mid', 48], ['broad', 75]]) {
  const img = encode(sigma)
  write(img, `${process.env.T}/grad-${name}.png`)
  console.log(`grad-${name.padEnd(6)} sigma=${String(sigma).padEnd(3)} agreement by ring from the highlight centre:`)
  console.log('   ' + profile(img))
}
console.log('\n0.00 = fully anticorrelated, 0.50 = uncorrelated, 1.00 = normal')
