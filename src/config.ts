import type { TransformOptions } from './transformer'

export type AggressionLevel = 'conservative' | 'balanced' | 'aggressive'

export function getStrategyOptions(aggression: AggressionLevel): TransformOptions {
  switch (aggression) {
    case 'conservative':
      return {
        shapeStabilization: true,
        layoutOptimization: false,
        reactAutoMemo: false,
        domWriteCoalescing: false,
      }
    case 'aggressive':
      return {
        shapeStabilization: true,
        layoutOptimization: true,
        reactAutoMemo: true,
        domWriteCoalescing: true,
      }
    default:
      return {
        shapeStabilization: true,
        layoutOptimization: true,
        reactAutoMemo: true,
        domWriteCoalescing: false,
      }
  }
}
