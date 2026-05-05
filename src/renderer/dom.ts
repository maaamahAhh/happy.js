export interface DomRenderOptions {
  container: HTMLElement
  useVirtualScroll?: boolean
  itemHeight?: number
}

export function createDomRenderer(options: DomRenderOptions) {
  const { container, useVirtualScroll = false, itemHeight = 40 } = options

  let renderedItems: HTMLElement[] = []
  let scrollTop = 0

  function render(items: HTMLElement[]): void {
    clear()

    const fragment = document.createDocumentFragment()

    items.forEach((item) => {
      fragment.appendChild(item)
    })

    container.appendChild(fragment)
    renderedItems = items
  }

  function clear(): void {
    renderedItems.forEach((item) => {
      if (item.parentNode) {
        item.parentNode.removeChild(item)
      }
    })
    renderedItems = []
  }

  function getVisibleRange(): { start: number; end: number } {
    if (!useVirtualScroll) {
      return { start: 0, end: Infinity }
    }

    const containerHeight = container.clientHeight
    const start = Math.floor(scrollTop / itemHeight)
    const end = Math.ceil((scrollTop + containerHeight) / itemHeight)

    return { start, end }
  }

  container.addEventListener('scroll', () => {
    scrollTop = container.scrollTop
  })

  return {
    render,
    clear,
    getVisibleRange,
  }
}

export const dom = {
  create: createDomRenderer,
}
