export interface TransformOptions {
  shapeStabilization?: boolean
  layoutOptimization?: boolean
  reactAutoMemo?: boolean
  domWriteCoalescing?: boolean
}

const DEFAULT_OPTIONS: Required<TransformOptions> = {
  shapeStabilization: true,
  layoutOptimization: true,
  reactAutoMemo: false,
  domWriteCoalescing: true,
}

const LAYOUT_READ_PROPS = [
  'offsetWidth',
  'offsetHeight',
  'clientWidth',
  'clientHeight',
  'getBoundingClientRect',
]

const STYLE_WRITE_PATTERN = /\.style\.\w+\s*=/g

export function transform(code: string, options: TransformOptions = {}): string {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  let result = code

  if (merged.shapeStabilization) {
    result = stabilizeShapes(result)
  }

  if (merged.layoutOptimization) {
    result = separateReadWrite(result)
  }

  if (merged.domWriteCoalescing) {
    result = injectDomBatching(result)
  }

  return result
}

function stabilizeShapes(code: string): string {
  const objectRegex = /const\s+(\w+)\s*=\s*\{([^}]*)\}/g

  return code.replace(objectRegex, (_match, name, body) => {
    const properties = parseProperties(body)
    if (properties.length === 0) return _match

    const sorted = sortProperties(properties)
    return formatProperties(name, sorted)
  })
}

interface Property {
  key: string
  value: string
}

function parseProperties(body: string): Property[] {
  return body
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((prop) => {
      const colonIndex = prop.indexOf(':')
      if (colonIndex === -1) return { key: prop, value: prop }
      return { key: prop.slice(0, colonIndex).trim(), value: prop.slice(colonIndex + 1).trim() }
    })
}

function sortProperties(properties: Property[]): Property[] {
  return [...properties].sort((a, b) => a.key.localeCompare(b.key))
}

function formatProperties(name: string, properties: Property[]): string {
  const props = properties.map((p) => `  ${p.key}: ${p.value}`).join(',\n')
  return `const ${name} = {\n${props}\n}`
}

function separateReadWrite(code: string): string {
  const lines = code.split('\n')
  const reads: string[] = []
  const writes: string[] = []
  const others: string[] = []

  lines.forEach((line) => {
    const isRead = LAYOUT_READ_PROPS.some((p) => line.includes(p))
    const isWrite = STYLE_WRITE_PATTERN.test(line)
    STYLE_WRITE_PATTERN.lastIndex = 0

    if (isRead) reads.push(line)
    else if (isWrite) writes.push(line)
    else others.push(line)
  })

  if (reads.length === 0 && writes.length === 0) return code

  return buildOptimizedCode(others, reads, writes)
}

function buildOptimizedCode(others: string[], reads: string[], writes: string[]): string {
  const result = [...others]

  if (writes.length > 0) {
    result.push('happyBatchWrites([')
    writes.forEach((w) => result.push(`  () => { ${w.trim()} },`))
    result.push('])')
  }

  if (reads.length > 0) {
    reads.forEach((r) => {
      const wrapped = r.replace(/const\s+(\w+)\s*=\s*(.+)/, 'const $1 = happyCacheRead(() => $2)')
      result.push(wrapped)
    })
  }

  return result.join('\n')
}

function injectDomBatching(code: string): string {
  const hasDomWrite = /\.(innerHTML|textContent)\s*=/.test(code)
  if (!hasDomWrite) return code

  return `// happy.js: DOM write batching enabled\n${code}`
}

export const transformer = {
  transform,
}
