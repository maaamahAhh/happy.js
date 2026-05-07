export interface Task {
  id: string
  execute: () => void | Promise<void>
  priority: TaskPriority
  deadline?: number
}

export enum TaskPriority {
  Urgent = 0,
  High = 1,
  Normal = 2,
  Low = 3,
  Idle = 4,
}

const FRAME_BUDGET_MS = 16.67
const FRAME_SAFETY_MARGIN_MS = 4
const USABLE_FRAME_MS = FRAME_BUDGET_MS - FRAME_SAFETY_MARGIN_MS

const taskQueue: Task[] = []
let isRunning = false
let frameStartTime = 0

function compareTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  if (a.deadline && b.deadline) return a.deadline - b.deadline
  if (a.deadline) return -1
  if (b.deadline) return 1
  return 0
}

function enqueueTask(task: Task): void {
  taskQueue.push(task)
  taskQueue.sort(compareTasks)
}

function markFrameStart(): void {
  frameStartTime = performance.now()
}

function getElapsedMs(): number {
  return performance.now() - frameStartTime
}

export function shouldYield(): boolean {
  return getElapsedMs() >= USABLE_FRAME_MS
}

export function getRemainingFrameBudget(): number {
  return Math.max(0, USABLE_FRAME_MS - getElapsedMs())
}

export async function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if ('scheduler' in globalThis && typeof (globalThis as any).scheduler.postTask === 'function') {
      ;(globalThis as any).scheduler.postTask(resolve, { priority: 'background' })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

async function flushQueue(): Promise<void> {
  if (isRunning) return
  isRunning = true

  while (taskQueue.length > 0) {
    markFrameStart()

    while (taskQueue.length > 0 && !shouldYield()) {
      const task = taskQueue.shift()
      if (!task) break

      try {
        await task.execute()
      } catch { /* task failed silently */ }

      if (shouldYield()) break
    }

    if (taskQueue.length > 0) {
      await yieldToMain()
    }
  }

  isRunning = false
}

export function scheduleTask(task: Omit<Task, 'id'>): string {
  const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
  enqueueTask({ ...task, id })

  if (!isRunning) {
    void flushQueue()
  }

  return id
}

export function scheduleWork(execute: () => void | Promise<void>, priority: TaskPriority = TaskPriority.Normal): string {
  return scheduleTask({ execute, priority })
}

export function cancelTask(taskId: string): boolean {
  const index = taskQueue.findIndex(t => t.id === taskId)
  if (index === -1) return false
  taskQueue.splice(index, 1)
  return true
}

export function getQueueLength(): number {
  return taskQueue.length
}

export function getFrameBudget(): number {
  return getRemainingFrameBudget()
}

export function splitGenerator<T>(gen: Generator<T>, onChunk?: (results: T[]) => void): string {
  return scheduleTask({
    priority: TaskPriority.Low,
    execute: async () => {
      const results: T[] = []
      let result = gen.next()

      while (!result.done) {
        results.push(result.value)

        if (shouldYield()) {
          if (onChunk) onChunk(results.splice(0))
          await yieldToMain()
          markFrameStart()
        }

        result = gen.next()
      }

      if (onChunk && results.length > 0) onChunk(results)
    },
  })
}

export const scheduler = {
  schedule: scheduleTask,
  scheduleWork,
  cancel: cancelTask,
  flush: flushQueue,
  getQueueLength,
  getFrameBudget,
  shouldYield,
  splitGenerator,
}
