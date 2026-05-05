function patchRequestAnimationFrame(): void {
  const original = window.requestAnimationFrame

  window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
    return original.call(window, (timestamp) => {
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
}
