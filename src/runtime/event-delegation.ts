const PASSIVE_EVENTS = new Set(['scroll', 'touchstart', 'touchmove', 'wheel'])
const THROTTLED_EVENTS = new Set(['scroll', 'resize'])
const DEBOUNCED_EVENTS = new Set(['input', 'keyup'])

const THROTTLE_INTERVAL_MS = 16
const DEBOUNCE_INTERVAL_MS = 150

const THROTTLE_TIMERS = new Map<string, number | undefined>()
const DEBOUNCE_TIMERS = new Map<string, number | undefined>()

const delegatedHandlers = new Map<string, Map<string, EventListener>>()

function throttle(type: string, listener: EventListener): EventListener {
  return (event: Event) => {
    const key = `${type}-${(event.target as Element)?.tagName}`
    if (THROTTLE_TIMERS.has(key)) return

    THROTTLE_TIMERS.set(key, window.setTimeout(() => {
      THROTTLE_TIMERS.delete(key)
    }, THROTTLE_INTERVAL_MS))

    listener(event)
  }
}

function debounce(type: string, listener: EventListener): EventListener {
  return (event: Event) => {
    const key = `${type}-${(event.target as Element)?.tagName}`
    const existing = DEBOUNCE_TIMERS.get(key)
    if (existing) clearTimeout(existing)

    DEBOUNCE_TIMERS.set(key, window.setTimeout(() => {
      DEBOUNCE_TIMERS.delete(key)
      listener(event)
    }, DEBOUNCE_INTERVAL_MS))
  }
}

function wrapListener(type: string, listener: EventListener): EventListener {
  if (THROTTLED_EVENTS.has(type)) return throttle(type, listener)
  if (DEBOUNCED_EVENTS.has(type)) return debounce(type, listener)
  return listener
}

function patchAddEventListener(): void {
  const original = EventTarget.prototype.addEventListener

  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!listener) return original.call(this, type, listener, options)

    const normalizedOptions = typeof options === 'boolean' ? { capture: options } : { ...options }

    if (PASSIVE_EVENTS.has(type) && !normalizedOptions.capture) {
      normalizedOptions.passive = true
    }

    const wrappedListener = typeof listener === 'function'
      ? wrapListener(type, listener)
      : listener

    return original.call(this, type, wrappedListener, normalizedOptions)
  }
}

function setupGlobalDelegation(root: Element | Document = document): void {
  const CLICK_EVENTS = ['click', 'submit', 'change']
  const handlerMap = new Map<string, EventListener>()

  CLICK_EVENTS.forEach(type => {
    const handler: EventListener = (event: Event) => {
      const target = event.target as Element
      if (!target) return

      const action = target.getAttribute(`data-happy-${type}`)
      if (!action) return

      const customEvent = new CustomEvent(`happy:${type}`, {
        detail: { action, target },
        bubbles: true,
      })
      target.dispatchEvent(customEvent)
    }

    root.addEventListener(type, handler, true)
    handlerMap.set(type, handler)
  })

  delegatedHandlers.set('root', handlerMap)
}

export function patchEventSystem(): void {
  patchAddEventListener()
}

export function enableDelegation(root?: Element | Document): void {
  setupGlobalDelegation(root)
}

export function unpatchEventSystem(): void {
  delegatedHandlers.clear()
  THROTTLE_TIMERS.clear()
  DEBOUNCE_TIMERS.clear()
}
