import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformStrategies } from '../config.js'
import type { VisitorFn, VisitorMap } from './types.js'

const SLOT_NAMES = ['_slot1', '_slot2', '_slot3']

function sortObjectProperties(path: NodePath<t.ObjectExpression>): void {
  const objectProps: Array<{ index: number; prop: t.ObjectProperty }> = []
  for (let i = 0; i < path.node.properties.length; i++) {
    const p = path.node.properties[i]
    if (t.isObjectProperty(p)) objectProps.push({ index: i, prop: p })
  }
  if (objectProps.length < 2) return

  objectProps.sort((a, b) => {
    const keyA = t.isIdentifier(a.prop.key) ? a.prop.key.name : t.isStringLiteral(a.prop.key) ? a.prop.key.value : ''
    const keyB = t.isIdentifier(b.prop.key) ? b.prop.key.name : t.isStringLiteral(b.prop.key) ? b.prop.key.value : ''
    return keyA.localeCompare(keyB)
  })

  const sortedProps = objectProps.map(e => e.prop)
  let sortIndex = 0
  for (let i = 0; i < path.node.properties.length; i++) {
    if (t.isObjectProperty(path.node.properties[i])) {
      path.node.properties[i] = sortedProps[sortIndex++]
    }
  }
}

function replaceDeleteWithUndefined(path: NodePath<t.UnaryExpression>): void {
  if (path.node.operator !== 'delete') return
  if (!t.isMemberExpression(path.node.argument)) return

  const undefinedAssignment = t.assignmentExpression('=', path.node.argument, t.identifier('undefined'))

  if (path.parentPath.isExpressionStatement()) {
    path.parentPath.replaceWith(t.expressionStatement(undefinedAssignment))
  } else {
    path.replaceWith(t.sequenceExpression([undefinedAssignment, t.booleanLiteral(true)]))
  }
}

function findConstructor(body: t.ClassBody['body']): t.ClassMethod | undefined {
  return body.find((member): member is t.ClassMethod => t.isClassMethod(member) && member.kind === 'constructor')
}

function injectShapeMarker(path: NodePath<t.ClassDeclaration>): void {
  if (!path.node.id || path.node.id.name.startsWith('_')) return
  const constructorMethod = findConstructor(path.node.body.body)
  if (!constructorMethod) return

  constructorMethod.body.body.unshift(
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.thisExpression(), t.identifier('$$shape')),
        t.stringLiteral(`${path.node.id.name}_v1`),
      ),
    ),
  )
}

function injectSlotReservations(path: NodePath<t.ClassDeclaration>): void {
  if (!path.node.id) return
  const constructorMethod = findConstructor(path.node.body.body)
  if (!constructorMethod) return

  const existingProps = new Set<string>()
  for (const stmt of constructorMethod.body.body) {
    if (!t.isExpressionStatement(stmt) || !t.isAssignmentExpression(stmt.expression)) continue
    const left = stmt.expression.left
    if (!t.isMemberExpression(left) || !t.isThisExpression(left.object) || !t.isIdentifier(left.property)) continue
    existingProps.add(left.property.name)
  }

  const slotAssignments = SLOT_NAMES
    .filter(name => !existingProps.has(name))
    .map(name => t.expressionStatement(t.assignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(name)), t.identifier('undefined'))))

  constructorMethod.body.body.push(...slotAssignments)
}

export function createShapeStabilizerVisitors(strategies: TransformStrategies): VisitorMap {
  const visitors: VisitorMap = {}

  if (strategies.propertyOrdering) visitors.ObjectExpression = sortObjectProperties
  if (strategies.deleteDefense) visitors.UnaryExpression = replaceDeleteWithUndefined

  if (strategies.shapeMarking || strategies.slotReservation) {
    const originalClassVisitor = visitors.ClassDeclaration
    visitors.ClassDeclaration = (path: NodePath<t.ClassDeclaration>) => {
      if (originalClassVisitor) originalClassVisitor(path)
      if (strategies.shapeMarking) injectShapeMarker(path)
      if (strategies.slotReservation) injectSlotReservations(path)
    }
  }

  return visitors
}
