import type { Plugin } from 'vite'
import { transform } from './transforms/index.js'
import type { TransformStrategies } from './config.js'
import { getStrategyOptions, type AggressionLevel } from './config.js'

export interface VitePluginOptions {
  aggression?: AggressionLevel
  strategies?: Partial<TransformStrategies>
  include?: RegExp[]
  exclude?: RegExp[]
  debug?: boolean
}

const DEFAULT_INCLUDE = [/\.(js|jsx|ts|tsx)$/]
const DEFAULT_EXCLUDE = [/node_modules/, /vendor/]

function shouldTransform(id: string, include: RegExp[], exclude: RegExp[]): boolean {
  if (exclude.some(pattern => pattern.test(id))) return false
  return include.some(pattern => pattern.test(id))
}

export default function vitePluginHappy(options: VitePluginOptions = {}): Plugin {
  const baseStrategies = getStrategyOptions(options.aggression ?? 'balanced')
  const strategies: TransformStrategies = {
    ...baseStrategies,
    ...options.strategies,
  }
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE

  return {
    name: 'happy-js',
    enforce: 'pre',

    transform(code, id) {
      if (!shouldTransform(id, include, exclude)) return null

      const result = transform(code, strategies)

      if (result === code) return null

      if (options.debug) {
        console.log(`[happy.js] Optimized: ${id}`)
      }

      return { code: result, map: null }
    },
  }
}
