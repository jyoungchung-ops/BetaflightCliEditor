// 앱 아이콘을 코드로 그려 build/icon.ico (16~256px) 와 build/icon.png 를 만든다.
// 외부 이미지 도구 없이 Node 내장 zlib으로 PNG를 인코딩하고 ICO에 PNG 그대로 담는다.
// 디자인: 어두운 둥근 사각형 + 노란 고리 + 가운데 점 (앱 상단 바의 마크와 같음). Betaflight 로고는 쓰지 않는다.
//
//   node scripts/make-icon.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SS = 4 // 가장자리 부드럽게: 픽셀당 4×4 샘플

const BG = [0x1b, 0x1b, 0x1b]
const BORDER = [0x3a, 0x3a, 0x3a]
const ACCENT = [0xff, 0xbb, 0x00]

/** 좌표(0~1)의 색과 불투명도 */
function sample(x, y) {
  // 둥근 사각형 바탕
  const r = 0.2
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0)
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0)
  const corner = Math.hypot(dx, dy)
  if (corner > r) return null
  const edge = r - corner < 0.025 ? BORDER : BG

  const d = Math.hypot(x - 0.5, y - 0.5)
  if (d >= 0.24 && d <= 0.34) return ACCENT // 고리
  if (d <= 0.12) return ACCENT // 가운데 점
  return edge
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
          if (!c) continue
          r += c[0]; g += c[1]; b += c[2]; a++
        }
      }
      const i = (y * size + x) * 4
      if (a > 0) {
        px[i] = Math.round(r / a)
        px[i + 1] = Math.round(g / a)
        px[i + 2] = Math.round(b / a)
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return px
}

// ── PNG 인코딩 ─────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 비트 깊이
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ── ICO (PNG 항목) ─────────────────────────────
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 아이콘
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // 색 평면
    e.writeUInt16LE(32, 6) // 비트 수
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

mkdirSync(OUT, { recursive: true })
const images = SIZES.map((size) => ({ size, data: png(size, render(size)) }))
writeFileSync(join(OUT, 'icon.ico'), ico(images))
writeFileSync(join(OUT, 'icon.png'), images.at(-1).data)
console.log(`build/icon.ico (${SIZES.join(', ')}px), build/icon.png (256px)`)
