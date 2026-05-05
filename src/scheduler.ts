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

const YIELD_INTERVAL_MS = 45
const FRAME_BUDGET_MS = 16.67

const taskQueue: Task[] = []
let isRunning = false
let lastYieldTime = 0

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

function shouldYield(): boolean {
  return performance.now() - lastYieldTime > YIELD_INTERVAL_MS
}

async function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if ('scheduler' in globalThis && typeof (globalThis as any).scheduler.postTask === 'function') {
      ;(globalThis as any).scheduler.postTask(resolve, { priority: 'background' })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

export async function flushQueue(): Promise<void> {
  if (isRunning) return
  isRunning = true

  while (taskQueue.length > 0) {
    const task = taskQueue.shift()
    if (!task) break

    lastYieldTime = performance.now()

    try {
      await task.execute()
    } catch {
      // Task failed silently — don't block other tasks
    }

    if (taskQueue.length > 0 && shouldYield()) {
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
  const index = taskQueue.findIndex((t) => t.id === taskId)
  if (index === -1) return false
  taskQueue.splice(index, 1)
  return true
}

export function getQueueLength(): number {
  return taskQueue.length
}

export function getFrameBudget(): number {
  return Math.max(0, FRAME_BUDGET_MS - (performance.now() % FRAME_BUDGET_MS))
}

export const scheduler = {
  schedule: scheduleTask,
  scheduleWork,
  cancel: cancelTask,
  flush: flushQueue,
  getQueueLength,
  getFrameBudget,
}
