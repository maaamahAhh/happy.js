import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformStrategies } from '../config.js'
import { BRIDGE_IDENTIFIER } from '../config.js'
import type { VisitorFn, VisitorMap } from './types.js'
import { isLoopNode } from '../analyzer/shared.js'

const MIN_STATEMENTS_FOR_SPLIT = 5

function createBridgeCall(method: string, args: t.Expression[] = []): t.CallExpression {
  return t.callExpression(t.memberExpression(t.identifier(BRIDGE_IDENTIFIER), t.identifier(method)), args)
}

function isAsyncFunction(node: t.Node): boolean {
  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    return !!node.async
  }
  return false
}

function injectYieldIntoLoop(loop: t.ForStatement | t.ForInStatement | t.ForOfStatement | t.WhileStatement): void {
  const yieldCheck = t.ifStatement(
    createBridgeCall('shouldYield'),
    t.blockStatement([t.expressionStatement(t.awaitExpression(createBridgeCall('yield')))]),
  )

  if (t.isBlockStatement(loop.body)) {
    loop.body.body.unshift(yieldCheck)
  } else if (t.isExpression(loop.body)) {
    loop.body = t.blockStatement([yieldCheck, t.expressionStatement(loop.body)])
  } else if (t.isStatement(loop.body)) {
    loop.body = t.blockStatement([yieldCheck, loop.body as t.Statement])
  }
}

function wrapLongFunctionWithYield(path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>): void {
  const node = path.node as any
  if (!isAsyncFunction(node)) return

  const body = node.body
  if (!t.isBlockStatement(body) || body.body.length < MIN_STATEMENTS_FOR_SPLIT) return

  const loops = body.body.filter(isLoopNode)
  if (loops.length === 0) return

  for (const loop of loops) {
    injectYieldIntoLoop(loop as any)
  }
}

export function createDomOptimizerVisitors(strategies: TransformStrategies): VisitorMap {
  const visitors: VisitorMap = {}

  if (strategies.longTaskSplitting) {
    visitors.FunctionDeclaration = wrapLongFunctionWithYield as VisitorFn
    visitors.ArrowFunctionExpression = wrapLongFunctionWithYield as VisitorFn
    visitors.FunctionExpression = wrapLongFunctionWithYield as VisitorFn
  }

  return visitors
}
