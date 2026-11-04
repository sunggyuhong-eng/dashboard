import type { Opening } from './types'

export const OPENING_HISTORY_KEY = 'kong-opening-history-v1'
export type OpeningHistorySnapshot = {
  status: string
  targetTo: number
  hiredCount: number
  stageCounts: Record<string, number>
}
export type OpeningHistoryEvent = {
  openingId: string
  project: string
  title: string
  at: string
  kind: 'baseline' | 'status' | 'progress'
  previousStatus?: string
  status: string
  snapshot: OpeningHistorySnapshot
}

function snapshotOf(opening: Opening): OpeningHistorySnapshot {
  const stageCounts: Record<string, number> = {}
  opening.candidates.forEach(candidate => { stageCounts[candidate.stage] = (stageCounts[candidate.stage] || 0) + 1 })
  return { status: opening.status, targetTo: opening.targetTo, hiredCount: opening.hiredCount, stageCounts }
}

export function readOpeningHistory(storage?: Pick<Storage, 'getItem'>): OpeningHistoryEvent[] {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!target) return []
  try {
    const parsed = JSON.parse(target.getItem(OPENING_HISTORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.openingId === 'string' && typeof item.at === 'string') as OpeningHistoryEvent[] : []
  } catch { return [] }
}

export function recordOpeningHistory(openings: Opening[], now = new Date(), storage?: Pick<Storage, 'getItem' | 'setItem'>): OpeningHistoryEvent[] {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!target) return []
  const history = readOpeningHistory(target)
  const stamp = now.toISOString()
  for (const opening of openings) {
    const snapshot = snapshotOf(opening)
    const last = [...history].reverse().find(event => event.openingId === opening.id)
    const serialized = JSON.stringify(snapshot)
    if (!last) {
      history.push({ openingId: opening.id, project: opening.project, title: opening.title, at: stamp, kind: 'baseline', status: opening.status, snapshot })
    } else if (JSON.stringify(last.snapshot) !== serialized) {
      const kind = last.status !== opening.status ? 'status' : 'progress'
      history.push({ openingId: opening.id, project: opening.project, title: opening.title, at: stamp, kind, previousStatus: last.status, status: opening.status, snapshot })
    }
  }
  const cutoff = now.getTime() - 365 * 24 * 60 * 60 * 1000
  const retained = history.filter(event => Date.parse(event.at) >= cutoff).slice(-5000)
  target.setItem(OPENING_HISTORY_KEY, JSON.stringify(retained))
  return retained
}

export function projectHistory(events: OpeningHistoryEvent[], project: string, now = new Date()): OpeningHistoryEvent[] {
  const cutoff = now.getTime() - 365 * 24 * 60 * 60 * 1000
  return events.filter(event => event.project === project && Date.parse(event.at) >= cutoff).sort((a, b) => a.at.localeCompare(b.at))
}
