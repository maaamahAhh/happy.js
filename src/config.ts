export type AggressionLevel = 'conservative' | 'balanced' | 'aggressive'

export interface TransformStrategies {
  propertyOrdering: boolean
  deleteDefense: boolean
  shapeMarking: boolean
  slotReservation: boolean
  readWriteSeparation: boolean
  domWriteCoalescing: boolean
  readCaching: boolean
  layoutGuard: boolean
  containmentInjection: boolean
  reactAutoMemo: boolean
  reactUseCallback: boolean
  reactUseMemo: boolean
  reactUseTransition: boolean
  eventPassive: boolean
  eventDelegation: boolean
  longTaskSplitting: boolean
}

const CONSERVATIVE: TransformStrategies = {
  propertyOrdering: true,
  deleteDefense: true,
  shapeMarking: false,
  slotReservation: false,
  readWriteSeparation: false,
  domWriteCoalescing: false,
  readCaching: false,
  layoutGuard: false,
  containmentInjection: false,
  reactAutoMemo: false,
  reactUseCallback: false,
  reactUseMemo: false,
  reactUseTransition: false,
  eventPassive: true,
  eventDelegation: false,
  longTaskSplitting: false,
}

const BALANCED: TransformStrategies = {
  propertyOrdering: true,
  deleteDefense: true,
  shapeMarking: true,
  slotReservation: false,
  readWriteSeparation: true,
  domWriteCoalescing: true,
  readCaching: true,
  layoutGuard: false,
  containmentInjection: false,
  reactAutoMemo: true,
  reactUseCallback: true,
  reactUseMemo: false,
  reactUseTransition: false,
  eventPassive: true,
  eventDelegation: false,
  longTaskSplitting: true,
}

const AGGRESSIVE: TransformStrategies = {
  propertyOrdering: true,
  deleteDefense: true,
  shapeMarking: true,
  slotReservation: true,
  readWriteSeparation: true,
  domWriteCoalescing: true,
  readCaching: true,
  layoutGuard: true,
  containmentInjection: true,
  reactAutoMemo: true,
  reactUseCallback: true,
  reactUseMemo: true,
  reactUseTransition: true,
  eventPassive: true,
  eventDelegation: true,
  longTaskSplitting: true,
}

export function getStrategyOptions(aggression: AggressionLevel): TransformStrategies {
  switch (aggression) {
    case 'conservative':
      return { ...CONSERVATIVE }
    case 'aggressive':
      return { ...AGGRESSIVE }
    default:
      return { ...BALANCED }
  }
}
