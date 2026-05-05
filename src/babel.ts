import type { PluginObj, PluginPass } from '@babel/core'
import type { TransformStrategies } from './config.js'
import { getStrategyOptions, type AggressionLevel } from './config.js'
import { createAllVisitors } from './transforms/index.js'

export interface BabelPluginOptions {
  aggression?: AggressionLevel
  strategies?: Partial<TransformStrategies>
  debug?: boolean
}

const DEFAULT_STRATEGIES: TransformStrategies = getStrategyOptions('balanced')

export default function happyBabelPlugin(_context: PluginPass, options: BabelPluginOptions = {}): PluginObj {
  const baseStrategies = getStrategyOptions(options.aggression ?? 'balanced')
  const strategies: TransformStrategies = {
    ...baseStrategies,
    ...options.strategies,
  }

  const visitors = createAllVisitors(strategies)

  return {
    name: 'happy-js',
    visitor: visitors as any,
  }
}
