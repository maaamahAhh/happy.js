import { scheduler } from './scheduler.js'
import { analyzer } from './analyzer.js'
import type { AnalysisReport } from './analyzer.js'
import { transformer } from './transformer.js'
import type { TransformOptions } from './transformer.js'
import { runtime } from './runtime.js'

export interface HappyConfig {
  mode?: 'auto' | 'runtime' | 'compile'
  aggression?: 'conservative' | 'balanced' | 'aggressive'
  strategies?: TransformOptions
  renderer?: 'dom' | 'canvas' | 'webgl' | 'auto'
  debug?: boolean
}

export interface HappyAPI {
  analyze: (code: string) => AnalysisReport
  transform: (code: string, options?: TransformOptions) => string
  patch: () => void
  unpatch: () => void
  scheduler: typeof scheduler
  version: string
}

const defaultConfig: Required<HappyConfig> = {
  mode: 'auto',
  aggression: 'balanced',
  strategies: {
    shapeStabilization: true,
    layoutOptimization: true,
    reactAutoMemo: true,
    domWriteCoalescing: true,
  },
  renderer: 'auto',
  debug: false,
}

function createHappy(config: HappyConfig = {}): HappyAPI {
  const merged = { ...defaultConfig, ...config }

  return {
    analyze: analyzer.analyze,
    transform: (code, options) => transformer.transform(code, options),
    patch: () => {
      runtime.patchDOM()
      runtime.patchAddEventListener()
      runtime.patchRequestAnimationFrame()
    },
    unpatch: runtime.unpatch,
    scheduler,
    version: '0.1.0',
  }
}

const happy = createHappy()

export { happy, createHappy }
export { scheduler, analyzer, transformer, runtime }
export type { TransformOptions } from './transformer.js'
export type { AnalysisReport } from './analyzer.js'
export default happy
