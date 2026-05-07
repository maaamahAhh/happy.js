import { createVirtualList, type VirtualList } from './dom.js'
import { WebGLRenderer, type RenderItem } from './webgl.js'
import { AccessibilityLayer, type AccessibleTextItem } from './accessibility.js'

export interface HybridRendererOptions {
  container: HTMLElement
  itemCount: number
  itemHeight: number
  renderItem: (index: number) => HTMLElement
  renderWebGLItem?: (index: number) => RenderItem[]
  font?: string
  webglThreshold?: number
  overscan?: number
}

export interface HybridRenderer {
  update: (itemCount?: number) => void
  destroy: () => void
  scrollTo: (index: number) => void
  isWebGL: () => boolean
}

const DEFAULT_WEBGL_THRESHOLD = 500
const DEFAULT_OVERSCAN = 5

export function createHybridRenderer(options: HybridRendererOptions): HybridRenderer {
  const { container, itemCount, itemHeight, renderItem } = options
  const font = options.font ?? '16px sans-serif'
  const webglThreshold = options.webglThreshold ?? DEFAULT_WEBGL_THRESHOLD
  const overscan = options.overscan ?? DEFAULT_OVERSCAN

  let currentItemCount = itemCount
  let webglRenderer: WebGLRenderer | null = null
  let accessibilityLayer: AccessibilityLayer | null = null
  let canvas: HTMLCanvasElement | null = null
  let domList: VirtualList | null = null
  let scrollTop = 0
  let resizeObserver: ResizeObserver | null = null
  const useWebGL = itemCount >= webglThreshold && !!options.renderWebGLItem

  if (useWebGL) {
    if (!initWebGL()) initDOM()
  } else {
    initDOM()
  }

  function initDOM(): void {
    domList = createVirtualList({ container, itemCount: currentItemCount, itemHeight, renderItem, overscan })
  }

  function initWebGL(): boolean {
    canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%'
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    container.appendChild(canvas)

    try {
      webglRenderer = new WebGLRenderer(canvas, font)
    } catch {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      canvas = null
      return false
    }

    accessibilityLayer = new AccessibilityLayer(container)
    setupResizeObserver()
    renderWebGL()
    return true
  }

  function setupResizeObserver(): void {
    if (!container || !webglRenderer) return

    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (canvas && width > 0 && height > 0) {
          canvas.width = width
          canvas.height = height
          webglRenderer?.resize(width, height)
          renderWebGL()
        }
      }
    })
    resizeObserver.observe(container)
  }

  function collectAccessibleItems(items: RenderItem[]): AccessibleTextItem[] {
    return items
      .filter((i): i is RenderItem & { type: 'text' } => i.type === 'text')
      .map(i => ({ x: i.x, y: i.y, width: i.width, height: i.height, content: i.content }))
  }

  function renderWebGL(): void {
    if (!webglRenderer || !options.renderWebGLItem) return

    const containerHeight = container.clientHeight
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const end = Math.min(currentItemCount - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan)

    const items: RenderItem[] = []
    for (let i = start; i <= end; i++) {
      items.push(...options.renderWebGLItem(i))
    }

    webglRenderer.renderItems(items)
    accessibilityLayer?.syncItems(collectAccessibleItems(items))
  }

  function update(newItemCount?: number): void {
    if (newItemCount !== undefined) currentItemCount = newItemCount

    if (domList) domList.update(newItemCount)
    else if (webglRenderer) renderWebGL()
  }

  function scrollTo(index: number): void {
    if (domList) domList.scrollTo(index)
    else {
      container.scrollTop = index * itemHeight
      scrollTop = container.scrollTop
      renderWebGL()
    }
  }

  function destroy(): void {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (domList) domList.destroy()
    if (webglRenderer) webglRenderer.destroy()
    if (accessibilityLayer) accessibilityLayer.destroy()
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas)
  }

  if (useWebGL && webglRenderer) {
    container.addEventListener('scroll', () => {
      scrollTop = container.scrollTop
      renderWebGL()
    }, { passive: true })
  }

  return {
    update,
    destroy,
    scrollTo,
    isWebGL: () => webglRenderer !== null,
  }
}
