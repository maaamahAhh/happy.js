import type { Plugin } from 'vite'
import { transform } from './transformer.js'
import type { TransformOptions } from './transformer.js'
import { getStrategyOptions, type AggressionLevel } from './config.js'

export interface VitePluginOptions {
  aggression?: AggressionLevel
  strategies?: TransformOptions
  include?: RegExp[]
  exclude?: RegExp[]
  debug?: boolean
}

const DEFAULT_OPTIONS: Required<VitePluginOptions> = {
  aggression: 'balanced',
  strategies: {
    shapeStabilization: true,
    layoutOptimization: true,
    reactAutoMemo: true,
    domWriteCoalescing: true,
  },
  include: [/\.(js|jsx|ts|tsx)$/],
  exclude: [/node_modules/, /vendor/],
  debug: false,
}

function shouldTransform(id: string, include: RegExp[], exclude: RegExp[]): boolean {
  if (exclude.some((pattern) => pattern.test(id))) return false
  return include.some((pattern) => pattern.test(id))
}

export default function vitePluginHappy(options: VitePluginOptions = {}): Plugin {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const strategies = { ...getStrategyOptions(config.aggression), ...config.strategies }

  return {
    name: 'happy-js',

    enforce: 'pre',

    config(userConfig) {
      return {
        esbuild: {
          ...userConfig.esbuild,
        },
        build: {
          ...userConfig.build,
          rollupOptions: {
            ...userConfig.build?.rollupOptions,
            output: {
              ...userConfig.build?.rollupOptions?.output,
            },
          },
        },
      }
    },

    transform(code, id) {
      if (!shouldTransform(id, config.include, config.exclude)) return null

      const result = transform(code, strategies)

      if (result === code) return null

      if (config.debug) {
        console.log(`[happy.js] Optimized: ${id}`)
      }

      return { code: result, map: null }
    },
  }
}
