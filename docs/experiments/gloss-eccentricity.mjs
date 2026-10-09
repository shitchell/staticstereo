import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const R = '/home/guy/code/git/github.com/shitchell/staticstereo/'
const { createCanvas } = require(R + 'node_modules/@napi-rs/canvas')
const { noiseAt } = await import(R + 'dist/core/rng.js')
const fs = require('node:fs')

const W = 800, H = 400, SEP_FAR = 110, SEP_NEAR = 92, NS = 2, SEED = 7
const CX = 400, CY = 200, RAD = 140
const RIM = 14              // correlated rim kept at the disc's edge, always

const inDisc = (x, y, r = RAD) => (x - CX) ** 2 + (y - CY) ** 2 <= r * r

/** depth: the disc is at 1.0 everywhere. Correlation is the ONLY variable. */
function depth() {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inDisc(x, y)) d[y * W + x] = 1
  return d
}

/** Which pixels get a complemented partner. Always clipped inside the rim. */
const PATCH_R = 45          // held CONSTANT across variants

/** Eccentricity as a fraction of the disc radius. Size is fixed. */
function antiMask(ecc) {
  const m = new Uint8Array(W * H)
  if (ecc === null) return m
  const hx = CX + ecc * RAD * Math.SQRT1_2
  const hy = CY - ecc * RAD * Math.SQRT1_2
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inDisc(x, y, RAD - RIM)) continue          // the rim stays correlated
    if ((x - hx) ** 2 + (y - hy) ** 2 <= PATCH_R ** 2) m[y * W + x] = 1
  }
  return m
}

function encode(d, anti) {
  const out = new Uint8Array(W * H)
  const range = SEP_FAR - SEP_NEAR
  for (let y = 0; y < H; y++) {
    const base = y * W
    for (let x = 0; x < W; x++) {
      const sep = Math.round(SEP_FAR - d[base + x] * range)
      const src = x - sep
      if (src < 0) { out[base + x] = noiseAt(SEED, x, y) < 0.5 ? 0 : 255; continue }
      const v = out[base + src]
      out[base + x] = anti[base + x] ? 255 - v : v
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

function agree(buf, pred, lag) {
  let m = 0, n = 0
  for (let y = 0; y < H; y++) for (let x = lag; x < W; x++) {
    if (!pred(x, y)) continue
    n++; if (buf[y * W + x] === buf[y * W + x - lag]) m++
  }
  return n ? { f: +(m / n).toFixed(3), n } : { f: NaN, n: 0 }
}

const d = depth()
const out = process.env.T
for (const [name, kind] of [['ecc-00','0'], ['ecc-25','0.25'], ['ecc-50','0.5'], ['ecc-70','0.7']]) {
  const anti = antiMask(kind === 'none' ? null : parseFloat(kind))
  const img = encode(d, anti)
  write(img, `${out}/gloss-${name}.png`)
  const inAnti = (x,y) => anti[y*W+x] === 1
  const discNotAnti = (x,y) => inDisc(x,y) && anti[y*W+x] === 0
  const a = agree(img, inAnti, SEP_NEAR), c = agree(img, discNotAnti, SEP_NEAR)
  console.log(`gloss-${name.padEnd(12)} patch agreement ${String(a.f).padEnd(6)}(n=${String(a.n).padEnd(6)})  rest-of-disc ${c.f} (n=${c.n})`)
}
console.log('\n0.000 = complementary partners (luster), 1.000 = identical (normal depth)')
