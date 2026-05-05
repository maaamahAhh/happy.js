interface PatchContext {
  writeQueue: Array<() => void>
  readCache: Map<string, unknown>
  isFlushing: boolean
}

let context: PatchContext | null = null

function getContext(): PatchContext {
  if (!context) {
    context = {
      writeQueue: [],
      readCache: new Map(),
      isFlushing: false,
    }
  }
  return context
}

function scheduleFlush(): void {
  const ctx = getContext()
  if (ctx.isFlushing || ctx.writeQueue.length === 0) return

  ctx.isFlushing = true
  requestAnimationFrame(() => {
    const batch = ctx.writeQueue.splice(0)
    batch.forEach((fn) => {
      try {
        fn()
      } catch {
        // Skip failed write to prevent blocking other operations
      }
    })
    ctx.readCache.clear()
    ctx.isFlushing = false
  })
}

export function patchDOM(): void {
  patchPropertySet()
  patchPropertyGet()
}

function patchPropertySet(): void {
  const layoutProps = ['innerHTML', 'textContent']

  layoutProps.forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, prop)
    if (!descriptor) return

    const originalSet = descriptor.set
    if (!originalSet) return

    descriptor.set = function (this: Element, value: unknown) {
      const ctx = getContext()
      ctx.writeQueue.push(() => {
        originalSet.call(this, value)
      })
      scheduleFlush()
    }

    Object.defineProperty(Element.prototype, prop, descriptor)
  })
}

function patchPropertyGet(): void {
  const layoutProps = ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight']

  layoutProps.forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
    if (!descriptor) return

    const originalGet = descriptor.get
    if (!originalGet) return

    descriptor.get = function (this: HTMLElement) {
      const cacheKey = `${this.id || 'no-id'}-${prop}`
      const ctx = getContext()
      const cached = ctx.readCache.get(cacheKey)

      if (cached !== undefined) return cached

      const value = originalGet.call(this)
      ctx.readCache.set(cacheKey, value)
      return value
    }

    Object.defineProperty(HTMLElement.prototype, prop, descriptor)
  })
}

export function patchAddEventListener(): void {
  const original = EventTarget.prototype.addEventListener

  const passiveEvents = ['scroll', 'touchstart', 'touchmove', 'wheel']

  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    const normalizedOptions = typeof options === 'boolean' ? { capture: options } : { ...options }

    if (passiveEvents.includes(type) && !normalizedOptions.capture) {
      normalizedOptions.passive = true
    }

    original.call(this, type, listener, normalizedOptions)
  }
}

export function patchRequestAnimationFrame(): void {
  const original = window.requestAnimationFrame

  window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
    return original.call(window, (timestamp) => {
      try {
        callback(timestamp)
      } catch {
        // Prevent one failed callback from breaking the rAF chain
      }
    })
  }
}

export function unpatch(): void {
  context = null
}

export const runtime = {
  patchDOM,
  patchAddEventListener,
  patchRequestAnimationFrame,
  unpatch,
}

// Auto-apply all patches on import
patchDOM()
patchAddEventListener()
patchRequestAnimationFrame()
