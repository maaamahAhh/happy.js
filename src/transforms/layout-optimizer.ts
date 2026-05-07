import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformStrategies } from '../config.js'
import { BRIDGE_IDENTIFIER } from '../config.js'
import type { VisitorFn, VisitorMap } from './types.js'
import { LAYOUT_READ_PROPERTIES, LAYOUT_READ_METHODS, DOM_WRITE_PROPERTIES, DOM_WRITE_METHODS } from '../analyzer/shared.js'

const LAYOUT_WRITE_STYLE_PROPERTIES = new Set([
  'width', 'height', 'top', 'left', 'right', 'bottom',
  'margin', 'padding', 'display', 'position',
  'overflow', 'transform', 'opacity',
])

function isLayoutRead(node: t.Node): boolean {
  if (t.isMemberExpression(node) && t.isIdentifier(node.property) && LAYOUT_READ_PROPERTIES.has(node.property.name)) return true
  if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) return LAYOUT_READ_METHODS.has(node.callee.property.name)
  return false
}

function isLayoutWrite(node: t.Node): boolean {
  if (t.isAssignmentExpression(node) && t.isMemberExpression(node.left)) {
    const left = node.left
    if (t.isIdentifier(left.property) && DOM_WRITE_PROPERTIES.has(left.property.name)) return true
    if (t.isMemberExpression(left.object) && t.isIdentifier(left.object.property) && left.object.property.name === 'style') return LAYOUT_WRITE_STYLE_PROPERTIES.has((left.property as t.Identifier).name)
  }
  if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) return DOM_WRITE_METHODS.has(node.callee.property.name)
  return false
}

function wrapWriteWithBatch(stmt: t.Statement): t.Statement {
  const expr = t.isExpressionStatement(stmt)
    ? stmt.expression
    : t.callExpression(t.identifier('void'), [t.arrowFunctionExpression([], t.booleanLiteral(true))])
  return t.expressionStatement(t.callExpression(t.memberExpression(t.identifier(BRIDGE_IDENTIFIER), t.identifier('batchWrite')), [t.arrowFunctionExpression([], expr)]))
}

function separateReadWriteInFunction(path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>): void {
  const body = path.node.body
  if (!t.isBlockStatement(body)) return

  const reads: t.Statement[] = []
  const writes: t.Statement[] = []
  const others: t.Statement[] = []

  for (const stmt of body.body) {
    if (isLayoutWrite(stmt)) writes.push(wrapWriteWithBatch(stmt))
    else if (isLayoutRead(stmt)) reads.push(stmt)
    else others.push(stmt)
  }

  if (reads.length === 0 && writes.length === 0) return
  body.body = [...others, ...writes, ...reads]
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
    visitors.FunctionDeclaration = separateReadWriteInFunction as VisitorFn
    visitors.ArrowFunctionExpression = separateReadWriteInFunction as VisitorFn
    visitors.FunctionExpression = separateReadWriteInFunction as VisitorFn
  }

  if (strategies.containmentInjection) visitors.ReturnStatement = injectContainment

  return visitors
}
