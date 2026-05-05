import { scheduler } from './scheduler.js'
import { analyzer } from './analyzer/index.js'
import type { AnalysisReport } from './analyzer/index.js'
import { transformer } from './transforms/index.js'
import type { TransformStrategies } from './config.js'
import { getStrategyOptions, type AggressionLevel } from './config.js'
import { runtime } from './runtime/index.js'

export type { TransformStrategies } from './config.js'
export type { AggressionLevel } from './config.js'
export type { AnalysisReport } from './analyzer/index.js'
export type { ShapeAnalysis } from './analyzer/shape-analyzer.js'
export type { LayoutRisk, LayoutRiskPattern } from './analyzer/layout-detector.js'
export type { HotPath } from './analyzer/hot-path-finder.js'
export type { ReactComponentAnalysis } from './analyzer/react-inspector.js'
export type { Task, TaskPriority } from './scheduler.js'
export type { VirtualList, VirtualListOptions } from './renderer/dom.js'
export { createVirtualList } from './renderer/dom.js'

export interface HappyConfig {
  mode?: 'auto' | 'runtime' | 'compile'
  aggression?: AggressionLevel
  strategies?: Partial<TransformStrategies>
  debug?: boolean
}

export interface HappyAPI {
  analyze: (code: string) => AnalysisReport
  transform: (code: string, options?: Partial<TransformStrategies>) => string
  patch: () => void
  unpatch: () => void
  scheduler: typeof scheduler
  version: string
}

function createHappy(config: HappyConfig = {}): HappyAPI {
  const strategies = {
    ...getStrategyOptions(config.aggression ?? 'balanced'),
    ...config.strategies,
  }

  return {
    analyze: analyzer.analyze,
    transform: (code, options) => transformer.transform(code, { ...strategies, ...options }),
    patch: runtime.patch,
    unpatch: runtime.unpatch,
    scheduler,
    version: '0.2.0',
  }
}

const happy = createHappy()

export { happy, createHappy }
export { scheduler, analyzer, transformer, runtime }
export default happy
