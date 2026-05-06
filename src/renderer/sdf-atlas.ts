export interface GlyphMetrics {
  char: string
  advance: number
  bearingX: number
  bearingY: number
  width: number
  height: number
  atlasX: number
  atlasY: number
  u0: number
  v0: number
  u1: number
  v1: number
}

interface GlyphRenderInfo {
  width: number
  height: number
  bearingX: number
  bearingY: number
  advance: number
}

const SDF_SPREAD = 8
const ATLAS_SIZE = 2048
const ALPHA_THRESHOLD = 128
const ASCII_RANGE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))

interface GridPoint {
  dx: number
  dy: number
}

const INF_POINT: GridPoint = { dx: 1e10, dy: 1e10 }
const ZERO_POINT: GridPoint = { dx: 0, dy: 0 }

function squaredDist(p: GridPoint): number {
  return p.dx * p.dx + p.dy * p.dy
}

function addPoints(a: GridPoint, b: GridPoint): GridPoint {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy }
}

function runEDT(grid: GridPoint[], width: number, height: number): void {
  const forward: Array<{ dx: number; dy: number }> = [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 },
  ]
  const backward: Array<{ dx: number; dy: number }> = [
    { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 0 },
  ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      for (const n of forward) {
        const nx = x + n.dx
        const ny = y + n.dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const candidate = addPoints(grid[ny * width + nx], n)
        if (squaredDist(candidate) < squaredDist(grid[i])) grid[i] = candidate
      }
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      for (const n of backward) {
        const nx = x + n.dx
        const ny = y + n.dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const candidate = addPoints(grid[ny * width + nx], n)
        if (squaredDist(candidate) < squaredDist(grid[i])) grid[i] = candidate
      }
    }
  }
}

function computeSDF(alphaData: Uint8ClampedArray, width: number, height: number): Float32Array {
  const size = width * height
  const outside: GridPoint[] = new Array(size)
  const inside: GridPoint[] = new Array(size)

  for (let i = 0; i < size; i++) {
    const a = alphaData[i * 4 + 3]
    outside[i] = a < ALPHA_THRESHOLD ? ZERO_POINT : INF_POINT
    inside[i] = a >= ALPHA_THRESHOLD ? ZERO_POINT : INF_POINT
  }

  runEDT(outside, width, height)
  runEDT(inside, width, height)

  const result = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const d = Math.sqrt(squaredDist(outside[i])) - Math.sqrt(squaredDist(inside[i]))
    result[i] = d / SDF_SPREAD
  }

  return result
}

function renderGlyphToCanvas(char: string, font: string, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): GlyphRenderInfo {
  ctx.font = font
  const metrics = ctx.measureText(char)
  const bearingX = metrics.actualBoundingBoxLeft ?? 0
  const bearingY = metrics.actualBoundingBoxAscent ?? 0
  const glyphWidth = Math.ceil(bearingX + (metrics.actualBoundingBoxRight ?? 0))
  const glyphHeight = Math.ceil(bearingY + (metrics.actualBoundingBoxDescent ?? 0))

  const paddedWidth = glyphWidth + SDF_SPREAD * 2
  const paddedHeight = glyphHeight + SDF_SPREAD * 2

  canvas.width = paddedWidth
  canvas.height = paddedHeight

  ctx.font = font
  ctx.fillStyle = 'white'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(char, SDF_SPREAD + bearingX, SDF_SPREAD + bearingY)

  return { width: paddedWidth, height: paddedHeight, bearingX, bearingY, advance: metrics.width }
}

function encodeSDFToImageData(sdf: Float32Array, width: number, height: number, ctx: CanvasRenderingContext2D): ImageData {
  const imageData = ctx.createImageData(width, height)
  for (let i = 0; i < sdf.length; i++) {
    const normalized = Math.max(0, Math.min(255, (sdf[i] + 0.5) * 255))
    const offset = i * 4
    imageData.data[offset] = 255
    imageData.data[offset + 1] = 255
    imageData.data[offset + 2] = 255
    imageData.data[offset + 3] = normalized
  }
  return imageData
}

export class SdfAtlas {
  private glyphs = new Map<string, GlyphMetrics>()
  private atlasCanvas: HTMLCanvasElement
  private atlasHeight = 0

  constructor(font: string, chars?: string[]) {
    const charset = chars ?? ASCII_RANGE
    this.atlasCanvas = document.createElement('canvas')
    this.atlasCanvas.width = ATLAS_SIZE
    this.atlasCanvas.height = ATLAS_SIZE

    const glyphCanvas = document.createElement('canvas')
    const glyphCtx = glyphCanvas.getContext('2d', { willReadFrequently: true })!
    const atlasCtx = this.atlasCanvas.getContext('2d')!

    let cursorX = 0
    let cursorY = 0
    let rowHeight = 0

    for (const char of charset) {
      const info = renderGlyphToCanvas(char, font, glyphCanvas, glyphCtx)
      const alphaData = glyphCtx.getImageData(0, 0, info.width, info.height)
      const sdf = computeSDF(alphaData.data, info.width, info.height)
      const sdfImageData = encodeSDFToImageData(sdf, info.width, info.height, atlasCtx)

      if (cursorX + info.width > ATLAS_SIZE) {
        cursorX = 0
        cursorY += rowHeight
        rowHeight = 0
      }

      atlasCtx.putImageData(sdfImageData, cursorX, cursorY)

      this.glyphs.set(char, {
        char,
        advance: info.advance,
        bearingX: info.bearingX,
        bearingY: info.bearingY,
        width: info.width,
        height: info.height,
        atlasX: cursorX,
        atlasY: cursorY,
        u0: cursorX / ATLAS_SIZE,
        v0: cursorY / ATLAS_SIZE,
        u1: (cursorX + info.width) / ATLAS_SIZE,
        v1: (cursorY + info.height) / ATLAS_SIZE,
      })

      cursorX += info.width
      rowHeight = Math.max(rowHeight, info.height)
    }

    this.atlasHeight = cursorY + rowHeight
  }

  getGlyph(char: string): GlyphMetrics | undefined {
    return this.glyphs.get(char)
  }

  getAtlasCanvas(): HTMLCanvasElement {
    return this.atlasCanvas
  }

  getAtlasSize(): { width: number; height: number } {
    return { width: ATLAS_SIZE, height: this.atlasHeight }
  }
}
