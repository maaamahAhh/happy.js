import type { PluginObj, NodePath, PluginPass } from '@babel/core'
import type { NodePath as TraverserPath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformOptions } from './transformer.js'
import { getStrategyOptions, type AggressionLevel } from './config.js'

export interface BabelPluginOptions {
  aggression?: AggressionLevel
  strategies?: TransformOptions
  debug?: boolean
}

const DEFAULT_OPTIONS: Required<BabelPluginOptions> = {
  aggression: 'balanced',
  strategies: {
    shapeStabilization: true,
    layoutOptimization: true,
    reactAutoMemo: true,
    domWriteCoalescing: true,
  },
  debug: false,
}

function wrapWithMemo(path: TraverserPath<t.FunctionDeclaration>): void {
  const funcName = path.node.id?.name
  if (!funcName || !funcName.match(/^[A-Z]/)) return

  const hasReturn = path.node.body.body.some((stmt: t.Statement) => t.isReturnStatement(stmt))
  if (!hasReturn) return

  const funcExpr = t.functionExpression(
    path.node.id || null,
    path.node.params,
    path.node.body,
    path.node.generator,
    path.node.async,
  )

  const memoCall = t.callExpression(
    t.memberExpression(t.identifier('React'), t.identifier('memo')),
    [funcExpr],
  )

  const variableDecl = t.variableDeclaration('const', [
    t.variableDeclarator(t.identifier(funcName), memoCall),
  ])

  path.replaceWith(variableDecl)
}

export default function happyBabelPlugin(_context: PluginPass, options: BabelPluginOptions = {}): PluginObj {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const strategyConfig = { ...getStrategyOptions(config.aggression), ...config.strategies }

  return {
    name: 'happy-js',
    visitor: {
      Program: {
        enter(_path: NodePath<t.Program>) {
          if (config.debug) {
            console.log('[happy.js] Analyzing file for optimization opportunities...')
          }
        },
        exit(_path: NodePath<t.Program>) {
          if (config.debug) {
            console.log('[happy.js] Optimization complete')
          }
        },
      },

      FunctionDeclaration(path: TraverserPath<t.FunctionDeclaration>) {
        if (strategyConfig.reactAutoMemo) {
          wrapWithMemo(path)
        }
      },

      ObjectExpression(path: TraverserPath<t.ObjectExpression>) {
        if (strategyConfig.shapeStabilization) {
          const props = path.node.properties.filter(
            (p: t.ObjectProperty | t.SpreadElement | t.ObjectMethod): p is t.ObjectProperty => t.isObjectProperty(p),
          )

          if (props.length < 2) return

          props.sort((a: t.ObjectProperty, b: t.ObjectProperty) => {
            const keyA = t.isIdentifier(a.key) ? a.key.name : ''
            const keyB = t.isIdentifier(b.key) ? b.key.name : ''
            return keyA.localeCompare(keyB)
          })

          path.node.properties = props
        }
      },
    },
  }
}
