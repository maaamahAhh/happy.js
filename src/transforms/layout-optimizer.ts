import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformStrategies } from '../config.js'
import { BRIDGE_IDENTIFIER } from '../config.js'
import type { VisitorFn, VisitorMap } from './types.js'
import { isLayoutRead, isLayoutWrite } from '../analyzer/shared.js'

function wrapWriteWithBatch(stmt: t.Statement): t.Statement {
  const expr = t.isExpressionStatement(stmt)
    ? stmt.expression
    : t.callExpression(t.identifier('void'), [t.arrowFunctionExpression([], t.booleanLiteral(true))])
  return t.expressionStatement(t.callExpression(t.memberExpression(t.identifier(BRIDGE_IDENTIFIER), t.identifier('batchWrite')), [t.arrowFunctionExpression([], expr)]))
}

function batchWritesInFunction(path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>): void {
  const body = path.node.body
  if (!t.isBlockStatement(body)) return

  let hasWrite = false
  const newBody = body.body.map(stmt => {
    if (isLayoutWrite(stmt)) {
      hasWrite = true
      return wrapWriteWithBatch(stmt)
    }
    return stmt
  })

  if (!hasWrite) return
  body.body = newBody
}

function injectContainment(path: NodePath<t.ReturnStatement>): void {
  const argument = path.node.argument
  if (!argument || !t.isJSXElement(argument)) return

  const openingElement = argument.openingElement
  if (!t.isJSXIdentifier(openingElement.name) || openingElement.name.name.match(/^[a-z]/)) return
  if (openingElement.attributes.some(attr => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'style')) return

  openingElement.attributes.push(
    t.jsxAttribute(
      t.jsxIdentifier('style'),
      t.jsxExpressionContainer(t.objectExpression([t.objectProperty(t.identifier('contain'), t.stringLiteral('layout style paint'))])),
    ),
  )
}

export function createLayoutOptimizerVisitors(strategies: TransformStrategies): VisitorMap {
  const visitors: VisitorMap = {}

  if (strategies.readWriteSeparation) {
    visitors.FunctionDeclaration = batchWritesInFunction as VisitorFn
    visitors.ArrowFunctionExpression = batchWritesInFunction as VisitorFn
    visitors.FunctionExpression = batchWritesInFunction as VisitorFn
  }

  if (strategies.containmentInjection) visitors.ReturnStatement = injectContainment

  return visitors
}
