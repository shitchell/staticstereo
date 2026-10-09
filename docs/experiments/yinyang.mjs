import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const R_ = '/home/guy/code/git/github.com/shitchell/staticstereo/'
const { createCanvas } = require(R_ + 'node_modules/@napi-rs/canvas')
const { noiseAt } = await import(R_ + 'dist/core/rng.js')
const fs = require('node:fs')

const W = 800, H = 400, NS = 2, SEED = 7
// Wider depth budget than the shipped default (110/92 = 18px) so the symbol's
// two halves read as DISTINCT planes rather than near-identical ones. In a
// stereogram there is no luminance channel for the viewer, so a yin-yang has to
// be expressed entirely as depth: the two halves must differ in depth or the
// S-curve is simply invisible.
const SEP_FAR = 120, SEP_NEAR = 60
const CX = 400, CY = 200, R = 150

const d2 = (x, y, ax, ay) => (x - ax) ** 2 + (y - ay) ** 2
const inBig = (x, y) => d2(x, y, CX, CY) <= R * R
// Top lobe and bottom lobe, radius R/2, centred half a radius off.
const inTop = (x, y) => d2(x, y, CX, CY - R / 2) <= (R / 2) ** 2
const inBot = (x, y) => d2(x, y, CX, CY + R / 2) <= (R / 2) ** 2
/** Canonical yin-yang partition: which half is "yang". */
const isYang = (x, y) => inTop(x, y) || (x >= CX && !inBot(x, y))
// The two eyes of the symbol, each sitting in the opposite half.
const DOT_R = R / 7
const inDotA = (x, y) => d2(x, y, CX, CY - R / 2) <= DOT_R * DOT_R
const inDotB = (x, y) => d2(x, y, CX, CY + R / 2) <= DOT_R * DOT_R

function build() {
  const depth = new Float32Array(W * H)
  const anti = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inBig(x, y)) continue
    const i = y * W + x
    depth[i] = isYang(x, y) ? 1.0 : 0.45          // two distinct planes
    if (inDotA(x, y) || inDotB(x, y)) anti[i] = 1  // the dots are phantom
  }
  return { depth, anti }
}

function encode({ depth, anti }, withAnti) {
  const out = new Uint8Array(W * H)
  const range = SEP_FAR - SEP_NEAR
  for (let y = 0; y < H; y++) {
    const base = y * W
    for (let x = 0; x < W; x++) {
      const sep = Math.round(SEP_FAR - depth[base + x] * range)
      const src = x - sep
      if (src < 0) { out[base + x] = noiseAt(SEED, x, y) < 0.5 ? 0 : 255; continue }
      const v = out[base + src]
      out[base + x] = (withAnti && anti[base + x]) ? 255 - v : v
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

const s = build()
let yang = 0, yin = 0, dots = 0
for (let i = 0; i < W * H; i++) {
  if (s.anti[i]) dots++
  else if (s.depth[i] === 1) yang++
  else if (s.depth[i] > 0) yin++
}
console.log(`depth map: yang ${yang}px @1.00  yin ${yin}px @0.45  dots ${dots}px (anticorrelated)`)
console.log(`separations: background ${SEP_FAR}  yin ${Math.round(SEP_FAR - 0.45 * (SEP_FAR - SEP_NEAR))}  yang ${SEP_NEAR}`)

for (const [name, withAnti] of [['yy-plain', false], ['yy-phantom', true]]) {
  const img = encode(s, withAnti)
  write(img, `${process.env.T}/${name}.png`)
  // confirm the dots' correspondence
  let m = 0, n = 0
  for (let y = 0; y < H; y++) for (let x = SEP_NEAR; x < W; x++) {
    if (!s.anti[y * W + x]) continue
    n++; if (img[y * W + x] === img[y * W + x - SEP_NEAR]) m++
  }
  console.log(`${name.padEnd(11)} dot agreement ${(m / n).toFixed(3)} (n=${n})`)
}
// also dump the depth map so the intended shape is checkable
const dm = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) dm[i] = Math.round(s.depth[i] * 255)
write(dm, `${process.env.T}/yy-depthmap.png`)
