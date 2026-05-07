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

const BATCHED_RECT_VS = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1, -1), 0, 1);
  v_color = a_color;
}`

const BATCHED_RECT_FS = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}`

const SDF_VS = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec2 v_texCoord;
varying vec4 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1, -1), 0, 1);
  v_texCoord = a_texCoord;
  v_color = a_color;
}`

const SDF_FS = `
precision mediump float;
varying vec2 v_texCoord;
varying vec4 v_color;
uniform sampler2D u_atlas;
uniform float u_smoothing;
void main() {
  float dist = texture2D(u_atlas, v_texCoord).a;
  float alpha = smoothstep(0.5 - u_smoothing, 0.5 + u_smoothing, dist);
  gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
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

interface RectLocations {
  position: number
  color: number
  resolution: WebGLUniformLocation | null
}

interface SdfLocations {
  position: number
  texCoord: number
  color: number
  resolution: WebGLUniformLocation | null
  atlas: WebGLUniformLocation | null
  smoothing: WebGLUniformLocation | null
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
  private sdfColorBuffer: WebGLBuffer | null = null
  private rectLocations: RectLocations | null = null
  private sdfLocations: SdfLocations | null = null
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

    this.rectProgram = createProgram(gl, BATCHED_RECT_VS, BATCHED_RECT_FS)
    this.sdfProgram = createProgram(gl, SDF_VS, SDF_FS)

    if (this.rectProgram) {
      this.rectLocations = {
        position: gl.getAttribLocation(this.rectProgram, 'a_position'),
        color: gl.getAttribLocation(this.rectProgram, 'a_color'),
        resolution: gl.getUniformLocation(this.rectProgram, 'u_resolution'),
      }
    }

    if (this.sdfProgram) {
      this.sdfLocations = {
        position: gl.getAttribLocation(this.sdfProgram, 'a_position'),
        texCoord: gl.getAttribLocation(this.sdfProgram, 'a_texCoord'),
        color: gl.getAttribLocation(this.sdfProgram, 'a_color'),
        resolution: gl.getUniformLocation(this.sdfProgram, 'u_resolution'),
        atlas: gl.getUniformLocation(this.sdfProgram, 'u_atlas'),
        smoothing: gl.getUniformLocation(this.sdfProgram, 'u_smoothing'),
      }
    }

    this.rectBuffer = gl.createBuffer()
    this.sdfPosBuffer = gl.createBuffer()
    this.sdfUvBuffer = gl.createBuffer()
    this.sdfColorBuffer = gl.createBuffer()

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
    if (rects.length === 0 || !this.rectProgram || !this.rectBuffer || !this.rectLocations) return
    const gl = this.gl

    const vertexData = new Float32Array(rects.length * 6 * 6)

    let offset = 0
    for (const r of rects) {
      const { x, y, width: w, height: h, color } = r
      const vertices = [x, y, x + w, y, x, y + h, x, y + h, x + w, y, x + w, y + h]
      for (let i = 0; i < 6; i++) {
        vertexData[offset++] = vertices[i * 2]
        vertexData[offset++] = vertices[i * 2 + 1]
        vertexData[offset++] = color[0]
        vertexData[offset++] = color[1]
        vertexData[offset++] = color[2]
        vertexData[offset++] = color[3]
      }
    }

    gl.useProgram(this.rectProgram)
    gl.uniform2f(this.rectLocations.resolution, this.canvasWidth, this.canvasHeight)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW)

    const STRIDE = 6 * 4
    gl.enableVertexAttribArray(this.rectLocations.position)
    gl.vertexAttribPointer(this.rectLocations.position, 2, gl.FLOAT, false, STRIDE, 0)
    gl.enableVertexAttribArray(this.rectLocations.color)
    gl.vertexAttribPointer(this.rectLocations.color, 4, gl.FLOAT, false, STRIDE, 2 * 4)

    gl.drawArrays(gl.TRIANGLES, 0, rects.length * 6)
  }

  private renderTexts(texts: RenderText[]): void {
    if (texts.length === 0 || !this.sdfProgram || !this.sdfPosBuffer || !this.sdfUvBuffer || !this.sdfColorBuffer || !this.atlasTexture || !this.sdfLocations) return
    const gl = this.gl

    const positions: number[] = []
    const uvs: number[] = []
    const colors: number[] = []

    for (const t of texts) {
      this.appendGlyphQuads(t, positions, uvs, colors)
    }

    if (positions.length === 0) return

    gl.useProgram(this.sdfProgram)
    gl.uniform2f(this.sdfLocations.resolution, this.canvasWidth, this.canvasHeight)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.uniform1i(this.sdfLocations.atlas, 0)
    gl.uniform1f(this.sdfLocations.smoothing, 0.25)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sdfPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.sdfLocations.position)
    gl.vertexAttribPointer(this.sdfLocations.position, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sdfUvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.sdfLocations.texCoord)
    gl.vertexAttribPointer(this.sdfLocations.texCoord, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sdfColorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.sdfLocations.color)
    gl.vertexAttribPointer(this.sdfLocations.color, 4, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2)
  }

  private appendGlyphQuads(item: RenderText, positions: number[], uvs: number[], colors: number[]): void {
    const prepared = prepareWithSegments(item.content, this.font)
    const lineHeight = item.fontSize ?? 16
    const { lines } = layoutWithLines(prepared, item.width, lineHeight)
    const color = item.color ?? [0, 0, 0, 1]

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
        for (let i = 0; i < 6; i++) colors.push(...color)

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
    if (this.sdfColorBuffer) gl.deleteBuffer(this.sdfColorBuffer)
    if (this.atlasTexture) gl.deleteTexture(this.atlasTexture)
  }
}
