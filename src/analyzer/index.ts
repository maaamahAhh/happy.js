import { analyzeShapes, type ShapeAnalysis } from './shape-analyzer.js'
import { analyzeLayoutRisks, type LayoutRisk, LayoutRiskPattern } from './layout-detector.js'
import { analyzeHotPaths, type HotPath } from './hot-path-finder.js'
import { analyzeReactComponents, type ReactComponentAnalysis } from './react-inspector.js'

export type { ShapeAnalysis } from './shape-analyzer.js'
export type { LayoutRisk, LayoutRiskPattern } from './layout-detector.js'
export type { HotPath } from './hot-path-finder.js'
export type { ReactComponentAnalysis } from './react-inspector.js'

export interface AnalysisReport {
  shapes: ShapeAnalysis[]
  layoutRisks: LayoutRisk[]
  hotPaths: HotPath[]
  reactComponents: ReactComponentAnalysis[]
  optimizationScore: number
}

const LAYOUT_RISK_WEIGHT = 10
const HOT_PATH_WEIGHT = 5
const UNSTABLE_SHAPE_WEIGHT = 3
const UNOPTIMIZED_REACT_WEIGHT = 4

function calculateOptimizationScore(
  layoutRisks: LayoutRisk[],
  hotPaths: HotPath[],
  shapes: ShapeAnalysis[],
  reactComponents: ReactComponentAnalysis[],
): number {
  const riskScore =
    layoutRisks.length * LAYOUT_RISK_WEIGHT +
    hotPaths.length * HOT_PATH_WEIGHT +
    shapes.filter(s => !s.isStable).length * UNSTABLE_SHAPE_WEIGHT +
    reactComponents.filter(c => !c.hasMemo && c.needsUseCallback).length * UNOPTIMIZED_REACT_WEIGHT

  return Math.max(0, 100 - riskScore)
}

export function analyze(code: string): AnalysisReport {
  const shapes = analyzeShapes(code)
  const layoutRisks = analyzeLayoutRisks(code)
  const hotPaths = analyzeHotPaths(code)
  const reactComponents = analyzeReactComponents(code)

  return {
    shapes,
    layoutRisks,
    hotPaths,
    reactComponents,
    optimizationScore: calculateOptimizationScore(layoutRisks, hotPaths, shapes, reactComponents),
  }
}

export const analyzer = {
  analyze,
  analyzeShapes,
  analyzeLayoutRisks,
  analyzeHotPaths,
  analyzeReactComponents,
}
