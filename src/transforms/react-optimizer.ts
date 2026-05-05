import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import type { TransformStrategies } from '../config.js'
import type { VisitorFn, VisitorMap } from './types.js'
import { isReactComponentName, EXPENSIVE_ARRAY_METHODS } from '../analyzer/shared.js'

function isAlreadyMemoed(path: NodePath): boolean {
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
      if (t.isIdentifier(callee) && callee.name === 'memo') return true
    }
  }

  return false
}

function wrapWithMemo(path: NodePath<t.FunctionDeclaration>): void {
  const funcName = path.node.id?.name
  if (!funcName || !isReactComponentName(funcName)) return
  if (!t.isBlockStatement(path.node.body)) return
  if (!path.node.body.body.some(stmt => t.isReturnStatement(stmt))) return
  if (isAlreadyMemoed(path)) return

  const funcExpr = t.functionExpression(path.node.id, path.node.params, path.node.body, path.node.generator, path.node.async)
  const memoCall = t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('memo')), [funcExpr])

  path.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(funcName), memoCall)]))
}

function extractUseCallback(path: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>): void {
  if (!t.isJSXExpressionContainer(path.parent) || !t.isJSXAttribute(path.parentPath?.parentPath?.node)) return

  const funcParent = path.getFunctionParent()
  if (!funcParent) return

  const hookName = path.scope.generateUidIdentifier('callback')
  const useCallbackCall = t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('useCallback')), [path.node, t.arrayExpression([])])
  const hookDeclaration = t.variableDeclaration('const', [t.variableDeclarator(hookName, useCallbackCall)])

  const body = funcParent.node.body
  if (t.isBlockStatement(body)) body.body.unshift(hookDeclaration)

  path.replaceWith(hookName)
}

function wrapWithUseMemo(path: NodePath<t.CallExpression>): void {
  if (!t.isMemberExpression(path.node.callee) || !t.isIdentifier(path.node.callee.property)) return
  if (!EXPENSIVE_ARRAY_METHODS.has(path.node.callee.property.name)) return
  if (!path.getFunctionParent()) return

  path.replaceWith(
    t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('useMemo')), [
      t.arrowFunctionExpression([], path.node),
      t.arrayExpression([path.node.callee.object]),
    ]),
  )
}

function isInsideEventHandler(path: NodePath): boolean {
  let current: NodePath | null = path
  while (current) {
    if (current.isArrowFunctionExpression() || current.isFunctionExpression()) {
      const parent = current.parentPath
      if (parent?.isJSXAttribute()) return true
      if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) {
        const key = parent.node.key.name
        if (key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()) return true
      }
    }
    current = current.parentPath
  }
  return false
}

function wrapSetStateWithTransition(path: NodePath<t.CallExpression>): void {
  if (!t.isIdentifier(path.node.callee)) return
  const name = path.node.callee.name
  if (!name.startsWith('set') || name.length <= 3) return
  if (!isInsideEventHandler(path)) return

  path.replaceWith(
    t.callExpression(t.memberExpression(t.identifier('React'), t.identifier('startTransition')), [
      t.arrowFunctionExpression([], path.node),
    ]),
  )
}

export function createReactOptimizerVisitors(strategies: TransformStrategies): VisitorMap {
  const visitors: VisitorMap = {}

  if (strategies.reactAutoMemo) visitors.FunctionDeclaration = wrapWithMemo as VisitorFn

  if (strategies.reactUseCallback) {
    visitors.ArrowFunctionExpression = (path: NodePath<t.ArrowFunctionExpression>) => {
      if (path.parentPath?.isJSXExpressionContainer()) extractUseCallback(path)
    }
  }

  if (strategies.reactUseMemo || strategies.reactUseTransition) {
    const existingCall = visitors.CallExpression
    visitors.CallExpression = (path: NodePath<t.CallExpression>) => {
      if (existingCall) existingCall(path)
      if (strategies.reactUseMemo) wrapWithUseMemo(path)
      if (strategies.reactUseTransition) wrapSetStateWithTransition(path)
    }
  }

  return visitors
}
