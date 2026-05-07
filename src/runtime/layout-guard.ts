let originalRAF: ((callback: FrameRequestCallback) => number) | null = null

function patchRequestAnimationFrame(): void {
  originalRAF = window.requestAnimationFrame.bind(window)

  window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
    return originalRAF!((timestamp) => {
      try {
        callback(timestamp)
      } catch { /* prevent one failed callback from breaking the rAF chain */ }
    })
  }
}

export function patchLayoutGuard(): void {
  patchRequestAnimationFrame()
}

export function unpatchLayoutGuard(): void {
  if (originalRAF) {
    window.requestAnimationFrame = originalRAF
    originalRAF = null
  }
}
