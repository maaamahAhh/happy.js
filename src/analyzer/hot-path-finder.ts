import { parseToAst, isLoopNode } from './shared.js'
import traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export interface HotPath {
  functionName: string
  line: number
  complexity: number
  bottleneck: string
  hasNestedLoops: boolean
  hasDomAccess: boolean
}

const COMPLEXITY_MODERATE_THRESHOLD = 10
const COMPLEXITY_HIGH_THRESHOLD = 20
const NESTED_LOOP_WEIGHT = 5
const DEEP_CONDITIONAL_WEIGHT = 3
const DOM_ACCESS_WEIGHT = 2

function countBranches(node: t.Node): number {
  let count = 0
  if (t.isIfStatement(node)) count++
  if (t.isConditionalExpression(node)) count++
  if (t.isSwitchCase(node)) count++
  if (isLoopNode(node)) count++
  if (t.isLogicalExpression(node)) count++
  if (t.isCatchClause(node)) count++
  return count
}

function countDomAccesses(node: t.Node): number {
  if (!t.isMemberExpression(node) || !t.isIdentifier(node.property)) return 0
  const name = node.property.name
  if (name.startsWith('offset') || name.startsWith('client') || name.startsWith('scroll')) return 1
  if (name === 'style' || name === 'innerHTML' || name === 'textContent') return 1
  return 0
}

function hasNestedLoops(body: t.BlockStatement): boolean {
  for (const stmt of body.body) {
    if (!isLoopNode(stmt)) continue
    const loopBody = stmt.body
    if (t.isBlockStatement(loopBody) && loopBody.body.some(isLoopNode)) return true
  }
  return false
}

function measureComplexity(body: t.BlockStatement): { score: number; hasNestedLoops: boolean; hasDomAccess: boolean } {
  let branchCount = 0
  let domCount = 0

  for (const stmt of body.body) {
    branchCount += countBranches(stmt)
    domCount += countDomAccesses(stmt)
  }

  const nestedLoops = hasNestedLoops(body)
  const score = branchCount * DEEP_CONDITIONAL_WEIGHT
    + (nestedLoops ? NESTED_LOOP_WEIGHT : 0)
    + domCount * DOM_ACCESS_WEIGHT
    + body.body.length

  return { score, hasNestedLoops: nestedLoops, hasDomAccess: domCount > 0 }
}

function getFunctionName(path: NodePath): string {
  const node = path.node as any
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parentPath
    if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name
    if (parent?.isAssignmentExpression() && t.isIdentifier(parent.node.left)) return parent.node.left.name
    if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) return parent.node.key.name
  }
  return '<anonymous>'
}

function collectHotPath(path: NodePath, hotPaths: HotPath[]): void {
  const node = path.node as any
  if (!t.isBlockStatement(node.body)) return
  const result = measureComplexity(node.body)
  if (result.score <= COMPLEXITY_MODERATE_THRESHOLD) return

  hotPaths.push({
    functionName: getFunctionName(path),
    line: node.loc?.start.line ?? 0,
    complexity: result.score,
    bottleneck: result.score > COMPLEXITY_HIGH_THRESHOLD ? 'high-complexity' : 'moderate-complexity',
    hasNestedLoops: result.hasNestedLoops,
    hasDomAccess: result.hasDomAccess,
  })
}

export function analyzeHotPaths(code: string): HotPath[] {
  const ast = parseToAst(code)
  if (!ast) return []

  const hotPaths: HotPath[] = []

  traverse(ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) { collectHotPath(path, hotPaths) },
    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) { collectHotPath(path, hotPaths) },
    FunctionExpression(path: NodePath<t.FunctionExpression>) { collectHotPath(path, hotPaths) },
  })

  return hotPaths
}
