import { SdfAtlas } from './sdf-atlas.js'
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

export interface RenderRect {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  color: [number, number, number, number]
}

export interface RenderText {
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  content: string
  color?: [number, number, number, number]
  fontSize?: number
}

export type RenderItem = RenderRect | RenderText

const RECT_VS = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1, -1), 0, 1);
}`

const RECT_FS = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}`

const SDF_VS = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
varying vec2 v_texCoord;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1, -1), 0, 1);
  v_texCoord = a_texCoord;
}`

const SDF_FS = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_atlas;
uniform vec4 u_color;
uniform float u_smoothing;
void main() {
  float dist = texture2D(u_atlas, v_texCoord).a;
  float alpha = smoothstep(0.5 - u_smoothing, 0.5 + u_smoothing, dist);
  gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
}`

function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER)
  const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

export class WebGLRenderer {
  private gl: WebGLRenderingContext
  private atlas: SdfAtlas
  private font: string
  private atlasTexture: WebGLTexture | null = null
  private rectProgram: WebGLProgram | null = null
  private sdfProgram: WebGLProgram | null = null
  private rectBuffer: WebGLBuffer | null = null
  private sdfPosBuffer: WebGLBuffer | null = null
  private sdfUvBuffer: WebGLBuffer | null = null
  private hitBoxes: Array<{ x: number; y: number; width: number; height: number; item: RenderItem }> = []
  private canvasWidth = 0
  private canvasHeight = 0

  constructor(canvas: HTMLCanvasElement, font: string, chars?: string[]) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL not available')
    this.gl = gl
    this.font = font

    this.atlas = new SdfAtlas(font, chars)
    this.canvasWidth = canvas.width
    this.canvasHeight = canvas.height
    this.initGL()
  }

  private initGL(): void {
    const gl = this.gl

    this.rectProgram = createProgram(gl, RECT_VS, RECT_FS)
    this.sdfProgram = createProgram(gl, SDF_VS, SDF_FS)

    this.rectBuffer = gl.createBuffer()
    this.sdfPosBuffer = gl.createBuffer()
    this.sdfUvBuffer = gl.createBuffer()

    this.atlasTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.getAtlasCanvas())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width
    this.canvasHeight = height
    this.gl.viewport(0, 0, width, height)
  }

  clear(): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.hitBoxes = []
  }

  renderItems(items: RenderItem[]): void {
    this.clear()
    const rects = items.filter((i): i is RenderRect => i.type === 'rect')
    const texts = items.filter((i): i is RenderText => i.type === 'text')
    this.renderRects(rects)
    this.renderTexts(texts)
    this.buildHitBoxes(items)
  }

  private renderRects(rects: RenderRect[]): void {
    if (rects.length === 0 || !this.rectProgram || !this.rectBuffer) return
    const gl = this.gl

    const vertices: number[] = []
    const colors: number[] = []

    for (const r of rects) {
      const { x, y, width: w, height: h, color } = r
      vertices.push(x, y, x + w, y, x, y + h, x, y + h, x + w, y, x + w, y + h)
      for (let i = 0; i < 6; i++) colors.push(...color)
    }

    gl.useProgram(this.rectProgram)
    const resolutionLoc = gl.getUniformLocation(this.rectProgram, 'u_resolution')
    gl.uniform2f(resolutionLoc, this.canvasWidth, this.canvasHeight)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW)

    const posLoc = gl.getAttribLocation(this.rectProgram, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const colorLoc = gl.getUniformLocation(this.rectProgram, 'u_color')

    let offset = 0
    for (const r of rects) {
      gl.uniform4f(colorLoc, r.color[0], r.color[1], r.color[2], r.color[3])
      gl.drawArrays(gl.TRIANGLES, offset, 6)
      offset += 6
    }
  }

  private renderTexts(texts: RenderText[]): void {
    if (texts.length === 0 || !this.sdfProgram || !this.sdfPosBuffer || !this.sdfUvBuffer || !this.atlasTexture) return
    const gl = this.gl

    const positions: number[] = []
    const uvs: number[] = []

    for (const t of texts) {
      this.appendGlyphQuads(t, positions, uvs)
    }

    if (positions.length === 0) return

    gl.useProgram(this.sdfProgram)

    const resolutionLoc = gl.getUniformLocation(this.sdfProgram, 'u_resolution')
    gl.uniform2f(resolutionLoc, this.canvasWidth, this.canvasHeight)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    const atlasLoc = gl.getUniformLocation(this.sdfProgram, 'u_atlas')
    gl.uniform1i(atlasLoc, 0)

    const smoothingLoc = gl.getUniformLocation(this.sdfProgram, 'u_smoothing')
    gl.uniform1f(smoothingLoc, 0.25)

    const colorLoc = gl.getUniformLocation(this.sdfProgram, 'u_color')
    gl.uniform4f(colorLoc, 0, 0, 0, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sdfPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW)
    const posLoc = gl.getAttribLocation(this.sdfProgram, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sdfUvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW)
    const uvLoc = gl.getAttribLocation(this.sdfProgram, 'a_texCoord')
    gl.enableVertexAttribArray(uvLoc)
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2)
  }

  private appendGlyphQuads(item: RenderText, positions: number[], uvs: number[]): void {
    const prepared = prepareWithSegments(item.content, this.font)
    const lineHeight = item.fontSize ?? 16
    const { lines } = layoutWithLines(prepared, item.width, lineHeight)

    let lineY = item.y
    for (const line of lines) {
      let charX = item.x
      for (const char of line.text) {
        const glyph = this.atlas.getGlyph(char)
        if (!glyph) {
          charX += 8
          continue
        }

        const gx = charX - glyph.bearingX
        const gy = lineY - glyph.bearingY
        const gw = glyph.width
        const gh = glyph.height

        positions.push(gx, gy, gx + gw, gy, gx, gy + gh, gx, gy + gh, gx + gw, gy, gx + gw, gy + gh)
        uvs.push(glyph.u0, glyph.v0, glyph.u1, glyph.v0, glyph.u0, glyph.v1, glyph.u0, glyph.v1, glyph.u1, glyph.v0, glyph.u1, glyph.v1)

        charX += glyph.advance
      }
      lineY += lineHeight
    }
  }

  private buildHitBoxes(items: RenderItem[]): void {
    this.hitBoxes = items.map(item => ({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      item,
    }))
  }

  hitTest(x: number, y: number): RenderItem | null {
    for (let i = this.hitBoxes.length - 1; i >= 0; i--) {
      const box = this.hitBoxes[i]
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        return box.item
      }
    }
    return null
  }

  destroy(): void {
    const gl = this.gl
    if (this.rectProgram) gl.deleteProgram(this.rectProgram)
    if (this.sdfProgram) gl.deleteProgram(this.sdfProgram)
    if (this.rectBuffer) gl.deleteBuffer(this.rectBuffer)
    if (this.sdfPosBuffer) gl.deleteBuffer(this.sdfPosBuffer)
    if (this.sdfUvBuffer) gl.deleteBuffer(this.sdfUvBuffer)
    if (this.atlasTexture) gl.deleteTexture(this.atlasTexture)
  }
}
