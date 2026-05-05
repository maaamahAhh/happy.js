export interface ShapeAnalysis {
  objectName: string
  properties: string[]
  instanceCount: number
  isStable: boolean
}

export interface LayoutRisk {
  fileName: string
  line: number
  pattern: LayoutRiskPattern
  severity: 'low' | 'medium' | 'high'
}

export enum LayoutRiskPattern {
  ReadWriteInterleave = 'read-write-interleave',
  ForcedReflow = 'forced-reflow',
  LayoutThrashing = 'layout-thrashing',
}

export interface HotPath {
  functionName: string
  callCount: number
  avgExecutionTimeMs: number
  bottleneck: string
}

export interface AnalysisReport {
  shapes: ShapeAnalysis[]
  layoutRisks: LayoutRisk[]
  hotPaths: HotPath[]
  optimizationScore: number
}

const MAX_STABLE_PROPERTIES = 5

const LAYOUT_RISK_WEIGHT = 10
const HOT_PATH_WEIGHT = 5
const UNSTABLE_SHAPE_WEIGHT = 3

const COMPLEXITY_MODERATE_THRESHOLD = 10
const COMPLEXITY_HIGH_THRESHOLD = 20

const READ_WINDOW_LINES = 2

const NESTED_LOOP_WEIGHT = 5
const DEEP_CONDITIONAL_WEIGHT = 3
const DOM_ACCESS_WEIGHT = 2

const JAVASCRIPT_RESERVED_WORDS = new Set([
  'if', 'for', 'while', 'return', 'function',
  'const', 'let', 'var', 'class', 'import',
  'export', 'default', 'true', 'false',
  'null', 'undefined',
])

const LAYOUT_READ_PROPERTIES = [
  'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
  'clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight',
  'getBoundingClientRect',
]

const LAYOUT_WRITE_PROPERTIES = [
  'style.width', 'style.height', 'style.top', 'style.left',
  'style.margin', 'style.padding', 'innerHTML', 'textContent',
]

export function analyzeShapes(code: string): ShapeAnalysis[] {
  const shapeMap = new Map<string, Set<string>>()
  const objectLiteralRegex = /\{([^}]+)\}/g
  let match: RegExpExecArray | null

  while ((match = objectLiteralRegex.exec(code)) !== null) {
    const properties = extractPropertyNames(match[1])
    if (properties.length === 0) continue

    const name = inferObjectName(match[0])
    if (!shapeMap.has(name)) {
      shapeMap.set(name, new Set(properties))
    } else {
      const existing = shapeMap.get(name)!
      properties.forEach((p) => existing.add(p))
    }
  }

  return Array.from(shapeMap.entries()).map(([name, properties]) => ({
    objectName: name,
    properties: Array.from(properties),
    instanceCount: 1,
    isStable: properties.size <= MAX_STABLE_PROPERTIES,
  }))
}

function extractPropertyNames(objectBody: string): string[] {
  const propRegex = /(\w+)\s*[:=,]/g
  const properties: string[] = []
  let match: RegExpExecArray | null

  while ((match = propRegex.exec(objectBody)) !== null) {
    if (!isReservedWord(match[1])) {
      properties.push(match[1])
    }
  }

  return properties
}

function inferObjectName(code: string): string {
  const assignRegex = /(\w+)\s*[=:]\s*\{/
  const match = assignRegex.exec(code)
  return match ? match[1] : 'AnonymousObject'
}

function isReservedWord(word: string): boolean {
  return JAVASCRIPT_RESERVED_WORDS.has(word)
}

export function analyzeLayoutRisks(code: string): LayoutRisk[] {
  const risks: LayoutRisk[] = []
  const lines = code.split('\n')

  let lastWriteLine = -1
  let lastReadLine = -1

  lines.forEach((line, index) => {
    const hasWrite = LAYOUT_WRITE_PROPERTIES.some((p) => line.includes(p))
    const hasRead = LAYOUT_READ_PROPERTIES.some((p) => line.includes(p))

    if (hasWrite) {
      lastWriteLine = index
      if (lastReadLine >= index - READ_WINDOW_LINES) {
        risks.push({
          fileName: 'unknown',
          line: index + 1,
          pattern: LayoutRiskPattern.ReadWriteInterleave,
          severity: 'high',
        })
      }
    }

    if (hasRead) {
      lastReadLine = index
      if (lastWriteLine >= index - READ_WINDOW_LINES) {
        risks.push({
          fileName: 'unknown',
          line: index + 1,
          pattern: LayoutRiskPattern.ForcedReflow,
          severity: 'high',
        })
      }
    }
  })

  return risks
}

export function analyzeHotPaths(code: string): HotPath[] {
  const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{([^}]*)\}/g
  const hotPaths: HotPath[] = []
  let match: RegExpExecArray | null

  while ((match = functionRegex.exec(code)) !== null) {
    const body = match[2]
    const complexity = measureComplexity(body)

    if (complexity > COMPLEXITY_MODERATE_THRESHOLD) {
      const bottleneck = complexity > COMPLEXITY_HIGH_THRESHOLD
        ? 'high-complexity'
        : 'moderate-complexity'

      hotPaths.push({
        functionName: match[1],
        callCount: 0,
        avgExecutionTimeMs: 0,
        bottleneck,
      })
    }
  }

  return hotPaths
}

function measureComplexity(body: string): number {
  let score = 0

  const nestedLoops = (body.match(/for\s*\([^)]*\)\s*\{[^}]*for\s*\(/g) || []).length
  score += nestedLoops * NESTED_LOOP_WEIGHT

  const deepConditionals = (body.match(/if\s*\([^)]*\)\s*\{[^}]*if\s*\(/g) || []).length
  score += deepConditionals * DEEP_CONDITIONAL_WEIGHT

  const domAccess = (body.match(/\.(offset|client|scroll|style)/g) || []).length
  score += domAccess * DOM_ACCESS_WEIGHT

  score += body.split('\n').length

  return score
}

export function analyze(code: string): AnalysisReport {
  const shapes = analyzeShapes(code)
  const layoutRisks = analyzeLayoutRisks(code)
  const hotPaths = analyzeHotPaths(code)

  const riskScore =
    layoutRisks.length * LAYOUT_RISK_WEIGHT +
    hotPaths.length * HOT_PATH_WEIGHT +
    shapes.filter((s) => !s.isStable).length * UNSTABLE_SHAPE_WEIGHT

  const optimizationScore = Math.max(0, 100 - riskScore)

  return {
    shapes,
    layoutRisks,
    hotPaths,
    optimizationScore,
  }
}

export const analyzer = {
  analyze,
  analyzeShapes,
  analyzeLayoutRisks,
  analyzeHotPaths,
}
