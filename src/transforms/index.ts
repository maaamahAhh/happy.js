import { transformSync } from '@babel/core'
import type { TransformStrategies } from '../config.js'
import { getStrategyOptions, type AggressionLevel } from '../config.js'
import { createShapeStabilizerVisitors } from './shape-stabilizer.js'
import { createLayoutOptimizerVisitors } from './layout-optimizer.js'
import { createReactOptimizerVisitors } from './react-optimizer.js'
import { createDomOptimizerVisitors } from './dom-optimizer.js'
import type { VisitorFn, VisitorMap } from './types.js'

export type { TransformStrategies } from '../config.js'
export type { VisitorFn, VisitorMap } from './types.js'

function mergeVisitors(...visitorSets: VisitorMap[]): VisitorMap {
  const merged: VisitorMap = {}

  for (const visitors of visitorSets) {
    for (const [nodeType, visitor] of Object.entries(visitors)) {
      if (merged[nodeType]) {
        const existing = merged[nodeType]
        merged[nodeType] = (path: any) => {
          existing(path)
          visitor(path)
        }
      } else {
        merged[nodeType] = visitor
      }
    }
  }

  return merged
}

export function createAllVisitors(strategies: TransformStrategies): VisitorMap {
  return mergeVisitors(
    createShapeStabilizerVisitors(strategies),
    createLayoutOptimizerVisitors(strategies),
    createReactOptimizerVisitors(strategies),
    createDomOptimizerVisitors(strategies),
  )
}

export function transform(code: string, options: TransformStrategies = getStrategyOptions('balanced')): string {
  const visitors = createAllVisitors(options)

  try {
    const result = transformSync(code, {
      sourceType: 'unambiguous',
      plugins: [
        ['@babel/plugin-syntax-jsx'],
        { name: 'happy-js-transforms', visitor: visitors as any },
      ],
      parserOpts: { plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'] },
      configFile: false,
      babelrc: false,
    })

    return result?.code ?? code
  } catch {
    return code
  }
}

export const transformer = { transform, createAllVisitors }
