import { parseToAst, isReactComponentName, EXPENSIVE_ARRAY_METHODS } from './shared.js'
import traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export interface ReactComponentAnalysis {
  componentName: string
  line: number
  hasMemo: boolean
  inlineFunctionCount: number
  expensiveComputationCount: number
  setStateCount: number
  needsUseCallback: boolean
  needsUseMemo: boolean
  needsUseTransition: boolean
}

const SET_STATE_THRESHOLD = 2

function isWrappedWithMemo(path: NodePath): boolean {
  const parent = path.parentPath
  if (!parent) return false

  if (parent.isCallExpression()) {
    const callee = parent.node.callee
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'React' }) && t.isIdentifier(callee.property, { name: 'memo' })) return true
    if (t.isIdentifier(callee) && callee.name === 'memo') return true
  }

  if (parent.isVariableDeclarator()) {
    const init = parent.node.init
    if (t.isCallExpression(init)) {
      const callee = init.callee
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'React' }) && t.isIdentifier(callee.property, { name: 'memo' })) return true
    }
  }

  return false
}

function traverseNodeTree(node: t.Node, visitor: (node: t.Node) => void): void {
  const queue: t.Node[] = [node]
  while (queue.length > 0) {
    const current = queue.pop()!
    visitor(current)
    for (const key of Object.keys(current)) {
      const child = (current as any)[key]
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) queue.push(...child.filter((c: any) => c && typeof c === 'object' && c.type))
        else if (child.type) queue.push(child)
      }
    }
  }
}

function countInlineFunctions(body: t.BlockStatement): number {
  let count = 0
  for (const stmt of body.body) {
    if (!t.isReturnStatement(stmt)) continue
    const arg = stmt.argument
    if (!arg || (!t.isJSXElement(arg) && !t.isJSXFragment(arg))) continue
    traverseNodeTree(arg, (node) => {
      if (t.isJSXAttribute(node) && t.isJSXExpressionContainer(node.value)) {
        const expr = node.value.expression
        if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) count++
      }
    })
  }
  return count
}

function countExpensiveComputations(body: t.BlockStatement): number {
  let count = 0
  for (const stmt of body.body) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (!decl.init || !t.isCallExpression(decl.init) || !t.isMemberExpression(decl.init.callee)) continue
      const method = decl.init.callee.property
      if (t.isIdentifier(method) && EXPENSIVE_ARRAY_METHODS.has(method.name)) count++
    }
  }
  return count
}

function countSetStateCalls(body: t.BlockStatement): number {
  let count = 0
  for (const stmt of body.body) {
    traverseNodeTree(stmt, (node) => {
      if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
        const name = node.callee.name
        if (name.startsWith('set') && name.length > 3) count++
      }
    })
  }
  return count
}

function getComponentName(path: NodePath): string {
  const node = path.node as any
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parentPath
    if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name
    if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) return parent.node.key.name
  }
  return ''
}

function analyzeFunctionComponent(path: NodePath): ReactComponentAnalysis | null {
  const name = getComponentName(path)
  if (!isReactComponentName(name)) return null

  const node = path.node as any
  const body = t.isBlockStatement(node.body) ? node.body : null
  if (!body) return null

  const hasMemo = isWrappedWithMemo(path)
  const inlineFunctionCount = countInlineFunctions(body)
  const expensiveComputationCount = countExpensiveComputations(body)
  const setStateCount = countSetStateCalls(body)

  return {
    componentName: name,
    line: node.loc?.start.line ?? 0,
    hasMemo,
    inlineFunctionCount,
    expensiveComputationCount,
    setStateCount,
    needsUseCallback: inlineFunctionCount > 0 && !hasMemo,
    needsUseMemo: expensiveComputationCount > 0,
    needsUseTransition: setStateCount > SET_STATE_THRESHOLD,
  }
}

export function analyzeReactComponents(code: string): ReactComponentAnalysis[] {
  const ast = parseToAst(code)
  if (!ast) return []

  const components: ReactComponentAnalysis[] = []

  traverse(ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      const analysis = analyzeFunctionComponent(path)
      if (analysis) components.push(analysis)
    },
    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      const analysis = analyzeFunctionComponent(path)
      if (analysis) components.push(analysis)
    },
    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      const analysis = analyzeFunctionComponent(path)
      if (analysis) components.push(analysis)
    },
  })

  return components
}
