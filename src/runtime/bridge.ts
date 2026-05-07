import { yieldToMain as schedulerYieldToMain } from '../scheduler.js'
import { BRIDGE_IDENTIFIER } from '../config.js'

export interface HappyBridgeAPI {
  shouldYield: () => boolean
  yield: () => Promise<void>
  batchWrite: (fn: () => void) => void
  getFrameBudget: () => number
}

let originalDescriptor: PropertyDescriptor | undefined

function createBridgeAPI(): HappyBridgeAPI {
  return {
    shouldYield: () => performance.now() % 16.67 >= 12.67,
    yield: schedulerYieldToMain,
    batchWrite: (fn: () => void) => {
      requestAnimationFrame(() => {
        try { fn() } catch { /* skip failed write */ }
      })
    },
    getFrameBudget: () => Math.max(0, 12.67 - (performance.now() % 16.67)),
  }
}

export function installBridge(): void {
  if (typeof window === 'undefined') return

  const existing = (window as any)[BRIDGE_IDENTIFIER]
  if (existing) return

  originalDescriptor = Object.getOwnPropertyDescriptor(window, BRIDGE_IDENTIFIER)

  const api = createBridgeAPI()
  Object.defineProperty(window, BRIDGE_IDENTIFIER, {
    value: api,
    writable: false,
    enumerable: false,
    configurable: true,
  })
}

export function uninstallBridge(): void {
  if (typeof window === 'undefined') return

  if (originalDescriptor) {
    Object.defineProperty(window, BRIDGE_IDENTIFIER, originalDescriptor)
  } else {
    delete (window as any)[BRIDGE_IDENTIFIER]
  }
}

export function getBridge(): HappyBridgeAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any)[BRIDGE_IDENTIFIER]
}
