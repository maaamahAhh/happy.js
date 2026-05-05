export interface VirtualListOptions {
  container: HTMLElement
  itemCount: number
  itemHeight: number
  renderItem: (index: number) => HTMLElement
  overscan?: number
}

export interface VirtualList {
  update: (itemCount?: number) => void
  destroy: () => void
  scrollTo: (index: number) => void
}

const DEFAULT_OVERSCAN = 5

export function createVirtualList(options: VirtualListOptions): VirtualList {
  const { container, itemHeight, renderItem } = options
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  let itemCount = options.itemCount
  let scrollTop = 0
  let pool: Map<number, HTMLElement> = new Map()
  let activeIndices = new Set<number>()
  let isDestroyed = false

  container.style.position = 'relative'
  container.style.overflow = 'auto'
  container.style.contain = 'strict'

  const totalHeightEl = document.createElement('div')
  totalHeightEl.style.cssText = 'position:absolute;width:1px;pointer-events:none;visibility:hidden'
  totalHeightEl.style.height = `${itemCount * itemHeight}px`
  container.appendChild(totalHeightEl)

  function getVisibleRange(): { start: number; end: number } {
    const containerHeight = container.clientHeight
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const end = Math.min(itemCount - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan)
    return { start, end }
  }

  function update(newItemCount?: number): void {
    if (isDestroyed) return
    if (newItemCount !== undefined) {
      itemCount = newItemCount
      totalHeightEl.style.height = `${itemCount * itemHeight}px`
    }

    const { start, end } = getVisibleRange()
    const newActive = new Set<number>()

    for (let i = start; i <= end; i++) {
      newActive.add(i)
      if (activeIndices.has(i)) continue

      let el = pool.get(i)
      if (!el) {
        el = renderItem(i)
        pool.set(i, el)
      }

      el.style.position = 'absolute'
      el.style.left = '0'
      el.style.right = '0'
      el.style.top = `${i * itemHeight}px`
      el.style.height = `${itemHeight}px`
      container.appendChild(el)
    }

    for (const idx of activeIndices) {
      if (newActive.has(idx)) continue
      const el = pool.get(idx)
      if (el?.parentNode) el.parentNode.removeChild(el)
    }

    activeIndices = newActive
  }

  function scrollTo(index: number): void {
    container.scrollTop = index * itemHeight
    scrollTop = container.scrollTop
    update()
  }

  function destroy(): void {
    isDestroyed = true
    for (const [, el] of pool) {
      if (el.parentNode) el.parentNode.removeChild(el)
    }
    pool.clear()
    activeIndices.clear()
    if (totalHeightEl.parentNode) totalHeightEl.parentNode.removeChild(totalHeightEl)
  }

  const onScroll = () => {
    scrollTop = container.scrollTop
    update()
  }
  container.addEventListener('scroll', onScroll, { passive: true })

  update()

  return { update, destroy, scrollTo }
}
