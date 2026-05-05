export interface RenderableElement {
  type: 'text' | 'rect' | 'image' | 'list-item'
  x: number
  y: number
  width: number
  height: number
  content: string | HTMLImageElement
  style: Record<string, string>
}

export interface WebGLRendererOptions {
  antialias?: boolean
  preserveDrawingBuffer?: boolean
}

export interface WebGLRendererResult {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement
}

const MAX_COLOR_VALUE = 255

let gl: WebGLRenderingContext | null = null
let canvasEl: HTMLCanvasElement | null = null
let shaderProgram: WebGLProgram | null = null

export function createWebGLRenderer(options: WebGLRendererOptions = {}): WebGLRendererResult | null {
  canvasEl = document.createElement('canvas')
  canvasEl.style.position = 'absolute'
  canvasEl.style.top = '0'
  canvasEl.style.left = '0'
  canvasEl.style.width = '100%'
  canvasEl.style.height = '100%'

  const context = canvasEl.getContext('webgl', {
    antialias: options.antialias ?? true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  })

  if (!context) return null

  gl = context
  initShaders(gl)

  return { gl, canvas: canvasEl }
}

function initShaders(context: WebGLRenderingContext): void {
  const vertexSource = `
    attribute vec2 aPosition;
    attribute vec4 aColor;
    uniform vec2 uResolution;
    varying vec4 vColor;
    void main() {
      vec2 clipSpace = (aPosition / uResolution) * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      vColor = aColor;
    }
  `

  const fragmentSource = `
    precision mediump float;
    varying vec4 vColor;
    void main() {
      gl_FragColor = vColor;
    }
  `

  const vertexShader = loadShader(context, context.VERTEX_SHADER, vertexSource)
  const fragmentShader = loadShader(context, context.FRAGMENT_SHADER, fragmentSource)

  if (!vertexShader || !fragmentShader) return

  shaderProgram = context.createProgram()
  if (!shaderProgram) return

  context.attachShader(shaderProgram, vertexShader)
  context.attachShader(shaderProgram, fragmentShader)
  context.linkProgram(shaderProgram)

  context.useProgram(shaderProgram)
}

function loadShader(context: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = context.createShader(type)
  if (!shader) return null

  context.shaderSource(shader, source)
  context.compileShader(shader)

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader)
    return null
  }

  return shader
}

export function renderElements(elements: RenderableElement[]): void {
  if (!gl || !shaderProgram) return

  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  elements.forEach((element) => {
    renderElement(element)
  })
}

function renderElement(element: RenderableElement): void {
  if (!gl || !shaderProgram) return

  const { x, y, width, height, style } = element

  const vertices = new Float32Array([
    x, y,
    x + width, y,
    x, y + height,
    x + width, y + height,
  ])

  const color = hexToRGBA(style.backgroundColor || '#ffffff')
  const colors = new Float32Array([
    ...color, ...color,
    ...color, ...color,
  ])

  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(shaderProgram, 'aPosition')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  const colorBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)

  const colorLocation = gl.getAttribLocation(shaderProgram, 'aColor')
  gl.enableVertexAttribArray(colorLocation)
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  gl.deleteBuffer(positionBuffer)
  gl.deleteBuffer(colorBuffer)
}

function hexToRGBA(hex: string): [number, number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  const r = ((value >> 16) & MAX_COLOR_VALUE) / MAX_COLOR_VALUE
  const g = ((value >> 8) & MAX_COLOR_VALUE) / MAX_COLOR_VALUE
  const b = (value & MAX_COLOR_VALUE) / MAX_COLOR_VALUE
  return [r, g, b, 1]
}

export function cleanup(): void {
  if (canvasEl && canvasEl.parentNode) {
    canvasEl.parentNode.removeChild(canvasEl)
  }
  gl = null
  canvasEl = null
  shaderProgram = null
}

export const webgl = {
  create: createWebGLRenderer,
  render: renderElements,
  cleanup,
}
