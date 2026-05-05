interface WriteQueue {
  writes: Array<() => void>
  isFlushing: boolean
}

let queue: WriteQueue | null = null

function getQueue(): WriteQueue {
  if (!queue) {
    queue = { writes: [], isFlushing: false }
  }
  return queue
}

function scheduleFlush(): void {
  const q = getQueue()
  if (q.isFlushing || q.writes.length === 0) return

  q.isFlushing = true
  requestAnimationFrame(() => {
    const batch = q.writes.splice(0)
    batch.forEach(fn => {
      try { fn() } catch { /* skip failed write */ }
    })
    q.isFlushing = false
  })
}

function patchPropertySetter(prototype: any, prop: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, prop)
  if (!descriptor || !descriptor.set) return

  const originalSet = descriptor.set

  descriptor.set = function (this: any, value: unknown) {
    getQueue().writes.push(() => {
      originalSet.call(this, value)
    })
    scheduleFlush()
  }

  Object.defineProperty(prototype, prop, descriptor)
}

export function patchDOMWrites(): void {
  patchPropertySetter(Element.prototype, 'innerHTML')
  patchPropertySetter(Element.prototype, 'textContent')
}

export function flushDOMWrites(): void {
  const q = getQueue()
  if (q.writes.length === 0) return

  const batch = q.writes.splice(0)
  batch.forEach(fn => {
    try { fn() } catch { /* skip failed write */ }
  })
}

export function unpatchDOMWrites(): void {
  queue = null
}
