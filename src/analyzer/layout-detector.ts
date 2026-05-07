import { parseToAst, isLayoutRead, isLayoutWrite } from './shared.js'
import traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export interface LayoutRisk {
  fileName: string
  line: number
  pattern: LayoutRiskPattern
  severity: 'low' | 'medium' | 'high'
  context: string
}

export enum LayoutRiskPattern {
  ReadWriteInterleave = 'read-write-interleave',
  ForcedReflow = 'forced-reflow',
  LayoutThrashing = 'layout-thrashing',
  LoopLayoutAccess = 'loop-layout-access',
}

function getNodeLine(node: t.Node): number {
  return node.loc?.start.line ?? 0
}

function getNodeSource(node: t.Node, code: string): string {
  if (!node.loc) return ''
  const lines = code.split('\n')
  return lines[node.loc.start.line - 1]?.trim() ?? ''
}

function detectForcedReflow(body: t.BlockStatement, code: string): LayoutRisk[] {
  const risks: LayoutRisk[] = []
  let lastWriteIndex = -1
  let lastReadIndex = -1

  for (let i = 0; i < body.body.length; i++) {
    const stmt = body.body[i]
    if (isLayoutWrite(stmt)) {
      lastWriteIndex = i
      if (lastReadIndex >= 0 && lastReadIndex >= i - 2) {
        risks.push({ fileName: 'unknown', line: getNodeLine(stmt), pattern: LayoutRiskPattern.ForcedReflow, severity: 'high', context: getNodeSource(stmt, code) })
      }
    }
    if (isLayoutRead(stmt)) {
      lastReadIndex = i
      if (lastWriteIndex >= 0 && lastWriteIndex >= i - 2) {
        risks.push({ fileName: 'unknown', line: getNodeLine(stmt), pattern: LayoutRiskPattern.ReadWriteInterleave, severity: 'high', context: getNodeSource(stmt, code) })
      }
    }
  }

  return risks
}

function detectLoopLayoutAccess(path: NodePath<t.ForStatement | t.ForInStatement | t.ForOfStatement | t.WhileStatement>, code: string): LayoutRisk[] {
  const body = path.node.body
  if (!t.isBlockStatement(body)) return []

  let hasRead = false
  let hasWrite = false
  for (const stmt of body.body) {
    if (isLayoutRead(stmt)) hasRead = true
    if (isLayoutWrite(stmt)) hasWrite = true
  }

  if (!hasRead || !hasWrite) return []

  return [{ fileName: 'unknown', line: getNodeLine(path.node), pattern: LayoutRiskPattern.LoopLayoutAccess, severity: 'high', context: getNodeSource(path.node, code) }]
}

export function analyzeLayoutRisks(code: string): LayoutRisk[] {
  const ast = parseToAst(code)
  if (!ast) return []

  const risks: LayoutRisk[] = []

  traverse(ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (path.node.body) risks.push(...detectForcedReflow(path.node.body, code))
    },
    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      if (path.node.body) risks.push(...detectForcedReflow(path.node.body, code))
    },
    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      if (t.isBlockStatement(path.node.body)) risks.push(...detectForcedReflow(path.node.body, code))
    },
    ForStatement(path: NodePath<t.ForStatement>) { risks.push(...detectLoopLayoutAccess(path, code)) },
    ForInStatement(path: NodePath<t.ForInStatement>) { risks.push(...detectLoopLayoutAccess(path, code)) },
    ForOfStatement(path: NodePath<t.ForOfStatement>) { risks.push(...detectLoopLayoutAccess(path, code)) },
    WhileStatement(path: NodePath<t.WhileStatement>) { risks.push(...detectLoopLayoutAccess(path, code)) },
  })

  return risks
}
