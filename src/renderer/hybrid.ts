import { createWebGLRenderer, renderElements, type RenderableElement, type WebGLRendererResult } from './webgl.js'
import { createDomRenderer } from './dom.js'

export interface HybridRendererOptions {
  container: HTMLElement
  webglThreshold?: number
  itemHeight?: number
}

const DEFAULT_WEBGL_THRESHOLD = 500
const DEFAULT_ITEM_HEIGHT = 40
const FPS_HISTORY_SIZE = 5
const FPS_DEGRADATION_THRESHOLD = 30
const DOM_FALLBACK_THRESHOLD_RATIO = 0.5

enum RendererMode {
  DOM = 'dom',
  WebGL = 'webgl',
}

export function createHybridRenderer(options: HybridRendererOptions) {
  const { container, webglThreshold = DEFAULT_WEBGL_THRESHOLD, itemHeight = DEFAULT_ITEM_HEIGHT } = options

  let currentMode: RendererMode = RendererMode.DOM
  let itemCount = 0
  let fpsHistory: number[] = []

  const domRenderer = createDomRenderer({ container, useVirtualScroll: true, itemHeight })
  const webglResult: WebGLRendererResult | null = createWebGLRenderer()

  function measureFPS(): number {
    let frames = 0
    let lastTime = performance.now()

    function countFrame(): void {
      frames++
      const now = performance.now()
      if (now - lastTime >= 1000) {
        fpsHistory.push(frames)
        if (fpsHistory.length > FPS_HISTORY_SIZE) fpsHistory.shift()
        frames = 0
        lastTime = now
      }
      requestAnimationFrame(countFrame)
    }

    requestAnimationFrame(countFrame)
    return 60
  }

  function getAverageFPS(): number {
    if (fpsHistory.length === 0) return 60
    const sum = fpsHistory.reduce((acc, fps) => acc + fps, 0)
    return sum / fpsHistory.length
  }

  function decideMode(count: number): RendererMode {
    const avgFPS = getAverageFPS()

    if (count >= webglThreshold) return RendererMode.WebGL
    if (avgFPS < FPS_DEGRADATION_THRESHOLD) return RendererMode.WebGL
    if (count < webglThreshold * DOM_FALLBACK_THRESHOLD_RATIO) return RendererMode.DOM

    return currentMode
  }

  function renderDOM(items: HTMLElement[]): void {
    domRenderer.render(items)
  }

  function renderWebGL(elements: RenderableElement[]): void {
    if (!webglResult) {
      renderDOM(elements.map(createFallbackElement))
      return
    }

    renderElements(elements)
  }

  function createFallbackElement(element: RenderableElement): HTMLElement {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = `${element.x}px`
    el.style.top = `${element.y}px`
    el.style.width = `${element.width}px`
    el.style.height = `${element.height}px`
    el.style.backgroundColor = element.style.backgroundColor || '#fff'
    return el
  }

  function render(items: HTMLElement[] | RenderableElement[]): void {
    itemCount = items.length
    const newMode = decideMode(itemCount)

    if (newMode !== currentMode) {
      switchMode(newMode)
    }

    if (currentMode === RendererMode.DOM) {
      renderDOM(items as HTMLElement[])
    } else {
      renderWebGL(items as RenderableElement[])
    }
  }

  function switchMode(mode: RendererMode): void {
    currentMode = mode

    if (mode === RendererMode.WebGL && webglResult) {
      container.appendChild(webglResult.canvas)
    }

    domRenderer.clear()
  }

  function clear(): void {
    domRenderer.clear()
    itemCount = 0
  }

  measureFPS()

  return {
    render,
    clear,
    getMode: () => currentMode,
    getItemCount: () => itemCount,
  }
}

export const hybrid = {
  create: createHybridRenderer,
}
