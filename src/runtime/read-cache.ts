interface CacheEntry {
  value: unknown
  frame: number
}

let cache = new Map<string, CacheEntry>()
let currentFrame = 0
let isInvalidating = false
let idCounter = 0
let isPatched = false

const originalGetters = new Map<string, (this: any) => any>()
let originalGetBoundingClientRect: ((this: Element) => DOMRect) | null = null

const elementIds = new WeakMap<Element, string>()

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
  originalGetters.set(prop, originalGet)

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

function unpatchLayoutPropertyGetter(prototype: any, prop: string): void {
  const originalGet = originalGetters.get(prop)
  if (!originalGet) return

  const descriptor = Object.getOwnPropertyDescriptor(prototype, prop)
  if (!descriptor) return

  descriptor.get = originalGet
  Object.defineProperty(prototype, prop, descriptor)
  originalGetters.delete(prop)
}

function patchGetBoundingClientRect(): void {
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

  Element.prototype.getBoundingClientRect = function (this: Element) {
    const key = makeCacheKey(this, 'getBoundingClientRect')
    const entry = cache.get(key)

    if (entry && entry.frame === getFrame()) return entry.value as DOMRect

    const value = originalGetBoundingClientRect!.call(this)
    cache.set(key, { value, frame: getFrame() })
    return value
  }
}

function unpatchGetBoundingClientRect(): void {
  if (originalGetBoundingClientRect) {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    originalGetBoundingClientRect = null
  }
}

const LAYOUT_PROPS = [
  'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
  'clientWidth', 'clientHeight', 'clientTop', 'clientLeft',
  'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft',
]

export function patchReadCache(): void {
  if (isPatched) return
  isPatched = true

  LAYOUT_PROPS.forEach(prop => patchLayoutPropertyGetter(HTMLElement.prototype, prop))
  patchGetBoundingClientRect()
  advanceFrame()
}

export function invalidateReadCache(): void {
  cache.clear()
}

export function unpatchReadCache(): void {
  if (!isPatched) return
  isPatched = false

  LAYOUT_PROPS.forEach(prop => unpatchLayoutPropertyGetter(HTMLElement.prototype, prop))
  unpatchGetBoundingClientRect()
  cache = new Map()
}
