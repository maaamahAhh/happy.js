export interface AccessibleTextItem {
  x: number
  y: number
  width: number
  height: number
  content: string
}

export class AccessibilityLayer {
  private container: HTMLDivElement
  private spans: HTMLSpanElement[] = []

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.setAttribute('role', 'region')
    this.container.setAttribute('aria-label', 'Content')
    this.container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;overflow:hidden'
    parent.style.position = 'relative'
    parent.appendChild(this.container)
  }

  syncItems(items: AccessibleTextItem[]): void {
    for (const span of this.spans) {
      if (span.parentNode) span.parentNode.removeChild(span)
    }
    this.spans = []

    for (const item of items) {
      const span = document.createElement('span')
      span.textContent = item.content
      span.style.cssText = `position:absolute;left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px;opacity:0;color:transparent;font-size:0;line-height:1;white-space:nowrap;user-select:text`
      span.setAttribute('aria-hidden', 'false')
      this.container.appendChild(span)
      this.spans.push(span)
    }
  }

  destroy(): void {
    for (const span of this.spans) {
      if (span.parentNode) span.parentNode.removeChild(span)
    }
    this.spans = []
    if (this.container.parentNode) this.container.parentNode.removeChild(this.container)
  }
}
