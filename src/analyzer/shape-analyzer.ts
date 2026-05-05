import { parseToAst, LAYOUT_READ_PROPERTIES } from './shared.js'
import traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export interface ShapeAnalysis {
  objectName: string
  properties: string[]
  instanceCount: number
  isStable: boolean
  hasDelete: boolean
  missingSlots: string[]
}

const MAX_STABLE_PROPERTIES = 5

interface ShapeData {
  properties: Set<string>
  count: number
  hasDelete: boolean
}

function extractObjectPropertyName(prop: t.ObjectProperty | t.SpreadElement | t.ObjectMethod): string | null {
  if (t.isSpreadElement(prop)) return null
  if (t.isObjectMethod(prop)) return t.isIdentifier(prop.key) ? prop.key.name : null
  if (t.isIdentifier(prop.key)) return prop.key.name
  if (t.isStringLiteral(prop.key)) return prop.key.value
  return null
}

function collectObjectProperties(node: t.ObjectExpression): string[] {
  const names: string[] = []
  for (const prop of node.properties) {
    const name = extractObjectPropertyName(prop as t.ObjectProperty | t.SpreadElement | t.ObjectMethod)
    if (name) names.push(name)
  }
  return names
}

function inferNameFromParent(path: NodePath<t.ObjectExpression>): string {
  const parent = path.parentPath
  if (!parent) return 'AnonymousObject'

  if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name
  if (parent.isAssignmentExpression() && t.isIdentifier(parent.node.left)) return parent.node.left.name
  if (parent.isReturnStatement()) {
    const func = parent.getFunctionParent()
    if (func && 'id' in func.node && t.isIdentifier((func.node as any).id)) return (func.node as any).id.name
  }
  if (parent.isCallExpression()) {
    const callee = parent.node.callee
    if (t.isIdentifier(callee) && callee.name.match(/^[a-z]/)) return callee.name
  }

  return 'AnonymousObject'
}

function collectClassProperties(node: t.ClassDeclaration | t.ClassExpression): string[] {
  const names: string[] = []
  for (const member of node.body.body) {
    if (t.isClassProperty(member) && !member.static && t.isIdentifier(member.key)) names.push(member.key.name)
  }
  return names
}

function collectConstructorProperties(node: t.ClassDeclaration | t.ClassExpression): string[] {
  const names: string[] = []
  for (const member of node.body.body) {
    if (!t.isClassMethod(member) || member.kind !== 'constructor') continue
    for (const stmt of member.body.body) {
      if (!t.isExpressionStatement(stmt) || !t.isAssignmentExpression(stmt.expression)) continue
      const left = stmt.expression.left
      if (!t.isMemberExpression(left) || !t.isThisExpression(left.object)) continue
      if (t.isIdentifier(left.property)) names.push(left.property.name)
    }
  }
  return names
}

export function analyzeShapes(code: string): ShapeAnalysis[] {
  const ast = parseToAst(code)
  if (!ast) return []

  const shapeMap = new Map<string, ShapeData>()
  const deleteTargets = new Set<string>()

  traverse(ast, {
    ObjectExpression(path: NodePath<t.ObjectExpression>) {
      const props = collectObjectProperties(path.node)
      if (props.length === 0) return

      const name = inferNameFromParent(path)
      const existing = shapeMap.get(name)
      if (existing) {
        props.forEach(p => existing.properties.add(p))
        existing.count++
      } else {
        shapeMap.set(name, { properties: new Set(props), count: 1, hasDelete: false })
      }
    },

    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (!path.node.id) return
      const name = path.node.id.name
      const classProps = collectClassProperties(path.node)
      const ctorProps = collectConstructorProperties(path.node)
      const allProps = [...new Set([...classProps, ...ctorProps])]
      if (allProps.length === 0) return

      const existing = shapeMap.get(name)
      if (existing) {
        allProps.forEach(p => existing.properties.add(p))
        existing.count++
      } else {
        shapeMap.set(name, { properties: new Set(allProps), count: 1, hasDelete: false })
      }
    },

    UnaryExpression(path: NodePath<t.UnaryExpression>) {
      if (path.node.operator !== 'delete') return
      const argument = path.node.argument
      if (!t.isMemberExpression(argument) || !t.isIdentifier(argument.property)) return
      deleteTargets.add(argument.property.name)
    },
  })

  return Array.from(shapeMap.entries()).map(([name, data]) => ({
    objectName: name,
    properties: Array.from(data.properties),
    instanceCount: data.count,
    isStable: data.properties.size <= MAX_STABLE_PROPERTIES,
    hasDelete: data.properties.size > 0 && Array.from(data.properties).some(p => deleteTargets.has(p)),
    missingSlots: [],
  }))
}
