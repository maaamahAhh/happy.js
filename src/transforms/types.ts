import type { NodePath } from '@babel/traverse'

export type VisitorFn = (path: NodePath<any>) => void
export interface VisitorMap { [nodeType: string]: VisitorFn }
