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

function wrapLongFunctionWithYield(path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>): void {
  const body = path.node.body
  if (!t.isBlockStatement(body) || body.body.length < MIN_STATEMENTS_FOR_SPLIT) return
  if (!body.body.some(isLoopNode)) return

  const loopIndex = body.body.findIndex(isLoopNode)
  const loop = body.body[loopIndex]
  if (!isLoopNode(loop)) return

  const yieldCheck = t.ifStatement(
    createBridgeCall('shouldYield'),
    t.blockStatement([t.expressionStatement(createBridgeCall('yield'))]),
  )

  if (t.isBlockStatement(loop.body)) {
    loop.body.body.unshift(yieldCheck)
  } else if (t.isExpression(loop.body)) {
    loop.body = t.blockStatement([yieldCheck, t.expressionStatement(loop.body)])
  } else if (t.isStatement(loop.body)) {
    loop.body = t.blockStatement([yieldCheck, loop.body as t.Statement])
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
