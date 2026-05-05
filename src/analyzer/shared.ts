import { parse } from '@babel/parser'
import * as t from '@babel/types'

export function parseToAst(code: string): t.File | null {
  try {
    return parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    })
  } catch {
    return null
  }
}

export const LAYOUT_READ_PROPERTIES = new Set([
  'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
  'clientWidth', 'clientHeight', 'clientTop', 'clientLeft',
  'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft',
])

export const LAYOUT_READ_METHODS = new Set([
  'getBoundingClientRect', 'getClientRects',
])

export const DOM_WRITE_PROPERTIES = new Set([
  'innerHTML', 'textContent', 'innerText', 'outerHTML', 'className',
])

export const DOM_WRITE_METHODS = new Set([
  'appendChild', 'insertBefore', 'removeChild', 'replaceChild',
  'setAttribute', 'removeAttribute',
])

export const EXPENSIVE_ARRAY_METHODS = new Set(['map', 'filter', 'reduce', 'sort', 'flatMap', 'find', 'some', 'every'])

export function isReactComponentName(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase()
}

export type LoopNode = t.ForStatement | t.ForInStatement | t.ForOfStatement | t.WhileStatement

export function isLoopNode(node: t.Node): node is LoopNode {
  return t.isForStatement(node) || t.isForInStatement(node) || t.isForOfStatement(node) || t.isWhileStatement(node)
}
