# happy.js

Stabilizes object shapes, separates DOM layout reads from writes, auto-memos React components, batches DOM mutations, splits long tasks, and renders dense lists via WebGL with SDF text.

## Install

```bash
npm install @maaamahahh/happy.js
```

## Usage

```javascript
import '@maaamahahh/happy.js/runtime'
```

### Babel

```javascript
module.exports = {
  plugins: [['@maaamahahh/happy.js/babel', { aggression: 'balanced' }]]
}
```

### Vite

```javascript
import happy from '@maaamahahh/happy.js/vite'

export default {
  plugins: [happy()]
}
```

## API

```javascript
import { happy } from '@maaamahahh/happy.js'

happy.analyze(sourceCode)
happy.transform(sourceCode)
happy.patch()
happy.unpatch()
```

## Options

```javascript
import { createHappy } from '@maaamahahh/happy.js'

const happy = createHappy({
  aggression: 'aggressive',
  strategies: {
    propertyOrdering: true,
    deleteDefense: true,
    readWriteSeparation: true,
    domWriteCoalescing: true,
    reactAutoMemo: true,
    reactUseCallback: true,
    reactUseMemo: true,
    reactUseTransition: true,
    longTaskSplitting: true,
  },
})
```

## Virtual List

```javascript
import { createVirtualList } from '@maaamahahh/happy.js'

const list = createVirtualList({
  container: document.getElementById('list'),
  itemCount: 10000,
  itemHeight: 40,
  renderItem: (i) => {
    const el = document.createElement('div')
    el.textContent = `Item ${i}`
    return el
  },
})

list.update(20000)
list.scrollTo(500)
list.destroy()
```

## Hybrid Renderer

Renders via DOM below a threshold, switches to WebGL with SDF text above it. Text remains selectable and copyable.

```javascript
import { createHybridRenderer } from '@maaamahahh/happy.js'

const renderer = createHybridRenderer({
  container: document.getElementById('list'),
  itemCount: 1000,
  itemHeight: 40,
  renderItem: (i) => {
    const el = document.createElement('div')
    el.textContent = `Item ${i}`
    return el
  },
  renderWebGLItem: (i) => [
    { type: 'rect', x: 0, y: i * 40, width: 300, height: 38, color: [0.9, 0.9, 0.9, 1] },
    { type: 'text', x: 10, y: i * 40 + 4, width: 280, height: 30, content: `Item ${i}` },
  ],
  font: '16px sans-serif',
  webglThreshold: 500,
})

renderer.update(2000)
renderer.isWebGL()
renderer.destroy()
```
