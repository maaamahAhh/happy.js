# happy.js

Optimizes object shapes, DOM access patterns, event listeners, and long task scheduling. Optional WebGL renderer for dense lists.

## Install

```bash
npm install happy.js
```

## Usage

```javascript
import 'happy.js/runtime'
```

### Babel

```javascript
module.exports = {
  plugins: [['happy.js/babel', { aggression: 'balanced' }]]
}
```

### Vite

```javascript
import happy from 'happy.js/vite'

export default {
  plugins: [happy()]
}
```

## API

```javascript
import { happy } from 'happy.js'

happy.analyze(sourceCode)
happy.transform(sourceCode)
happy.patch()
happy.unpatch()
```

## Options

```javascript
import { createHappy } from 'happy.js'

const happy = createHappy({
  aggression: 'balanced',
  strategies: {
    shapeStabilization: true,
    layoutOptimization: true,
    reactAutoMemo: true,
    domWriteCoalescing: true,
  },
  renderer: 'auto',
})
```
