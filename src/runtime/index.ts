import { patchDOMWrites, flushDOMWrites, unpatchDOMWrites } from './dom-patch.js'
import { patchReadCache, invalidateReadCache, unpatchReadCache } from './read-cache.js'
import { patchLayoutGuard, unpatchLayoutGuard } from './layout-guard.js'
import { patchEventSystem, enableDelegation, unpatchEventSystem } from './event-delegation.js'
import { installBridge, uninstallBridge, getBridge, type HappyBridgeAPI } from './bridge.js'

export { flushDOMWrites } from './dom-patch.js'
export { invalidateReadCache } from './read-cache.js'
export { enableDelegation } from './event-delegation.js'
export { getBridge, type HappyBridgeAPI } from './bridge.js'

export interface RuntimeConfig {
  domWriteCoalescing?: boolean
  readCaching?: boolean
  layoutGuard?: boolean
  eventPassive?: boolean
  eventDelegation?: boolean
}

const DEFAULT_RUNTIME_CONFIG: Required<RuntimeConfig> = {
  domWriteCoalescing: true,
  readCaching: true,
  layoutGuard: true,
  eventPassive: true,
  eventDelegation: false,
}

let isPatched = false
let activeConfig: Required<RuntimeConfig> = { ...DEFAULT_RUNTIME_CONFIG }

export function patch(config: RuntimeConfig = {}): void {
  if (isPatched) return

  activeConfig = { ...DEFAULT_RUNTIME_CONFIG, ...config }

  installBridge()

  if (activeConfig.domWriteCoalescing) patchDOMWrites()
  if (activeConfig.readCaching) patchReadCache()
  if (activeConfig.layoutGuard) patchLayoutGuard()
  if (activeConfig.eventPassive) patchEventSystem()

  isPatched = true
}

export function unpatch(): void {
  if (!isPatched) return

  unpatchDOMWrites()
  unpatchReadCache()
  unpatchLayoutGuard()
  unpatchEventSystem()
  uninstallBridge()

  isPatched = false
}

export const runtime = {
  patch,
  unpatch,
  flushDOMWrites,
  invalidateReadCache,
  enableDelegation,
  getBridge,
}
