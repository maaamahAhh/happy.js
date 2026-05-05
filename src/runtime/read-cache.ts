interface CacheEntry {
  value: unknown
  frame: number
}

let cache = new Map<string, CacheEntry>()
let currentFrame = 0
let isInvalidating = false
let idCounter = 0

function getFrame(): number {
  return currentFrame
}

function advanceFrame(): void {
  currentFrame++
  if (!isInvalidating) {
    isInvalidating = true
    requestAnimationFrame(() => {
      cache.clear()
      isInvalidating = false
      advanceFrame()
    })
  }
}

advanceFrame()

const elementIds = new WeakMap<Element, string>()

function makeCacheKey(element: Element, property: string): string {
  let id = elementIds.get(element)
  if (!id) {
    id = element.id || `h${idCounter++}`
    elementIds.set(element, id)
  }
  return `${id}-${property}`
}

function patchLayoutPropertyGetter(prototype: any, prop: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, prop)
  if (!descriptor || !descriptor.get) return

  const originalGet = descriptor.get

  descriptor.get = function (this: any) {
    const key = makeCacheKey(this, prop)
    const entry = cache.get(key)

    if (entry && entry.frame === getFrame()) return entry.value

    const value = originalGet.call(this)
    cache.set(key, { value, frame: getFrame() })
    return value
  }

  Object.defineProperty(prototype, prop, descriptor)
}

function patchGetBoundingClientRect(): void {
  const original = Element.prototype.getBoundingClientRect

  Element.prototype.getBoundingClientRect = function (this: Element) {
    const key = makeCacheKey(this, 'getBoundingClientRect')
    const entry = cache.get(key)

    if (entry && entry.frame === getFrame()) return entry.value as DOMRect

    const value = original.call(this)
    cache.set(key, { value, frame: getFrame() })
    return value
  }
}

export function patchReadCache(): void {
  const layoutProps = [
    'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
    'clientWidth', 'clientHeight', 'clientTop', 'clientLeft',
    'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft',
  ]

  layoutProps.forEach(prop => patchLayoutPropertyGetter(HTMLElement.prototype, prop))

  patchGetBoundingClientRect()
}

export function invalidateReadCache(): void {
  cache.clear()
}

export function unpatchReadCache(): void {
  cache = new Map()
}
