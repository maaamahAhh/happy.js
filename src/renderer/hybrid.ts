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

export function createHybridRenderer(options: HybridRendererOptions): HybridRenderer {
  const { container, itemCount, itemHeight, renderItem } = options
  const font = options.font ?? '16px sans-serif'
  const webglThreshold = options.webglThreshold ?? DEFAULT_WEBGL_THRESHOLD
  const overscan = options.overscan ?? 5

  let currentItemCount = itemCount
  let webglRenderer: WebGLRenderer | null = null
  let accessibilityLayer: AccessibilityLayer | null = null
  let canvas: HTMLCanvasElement | null = null
  let domList: VirtualList | null = null
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
    renderWebGL()
    return true
  }

  function collectAccessibleItems(items: RenderItem[]): AccessibleTextItem[] {
    return items
      .filter((i): i is RenderItem & { type: 'text' } => i.type === 'text')
      .map(i => ({ x: i.x, y: i.y, width: i.width, height: i.height, content: i.content }))
  }

  function renderWebGL(): void {
    if (!webglRenderer || !options.renderWebGLItem) return

    const items: RenderItem[] = []
    for (let i = 0; i < currentItemCount; i++) {
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
    else if (canvas) container.scrollTop = index * itemHeight
  }

  function destroy(): void {
    if (domList) domList.destroy()
    if (webglRenderer) webglRenderer.destroy()
    if (accessibilityLayer) accessibilityLayer.destroy()
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas)
  }

  return {
    update,
    destroy,
    scrollTo,
    isWebGL: () => webglRenderer !== null,
  }
}
