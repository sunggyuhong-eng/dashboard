import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'

export const OPENING_HISTORY_STORAGE_KEY = 'kong-recruiting-opening-history-v1'
export type LifecycleStatus = '진행중' | '종료'
export type HistoryEventKind = 'snapshot' | 'status' | 'removed'
export type OpeningHistorySnapshot = {
  project: string
  title: string
  targetTo: number
  hiredCount: number
  candidateCount: number
  reason: string
  toGroup: string
  approvalUrl: string
  stageCounts: Partial<Record<PipelineStage, number>>
}
export type OpeningHistoryEvent = {
  kind: HistoryEventKind
  at: string
  status: LifecycleStatus
  previousStatus?: LifecycleStatus
  snapshot: OpeningHistorySnapshot
}
export type OpeningHistoryRecord = {
  status: LifecycleStatus
  snapshot: OpeningHistorySnapshot
  events: OpeningHistoryEvent[]
}
export type OpeningHistory = Record<string, OpeningHistoryRecord>
export type ProjectHistoryEntry = {
  openingId: string
  title: string
  event: OpeningHistoryEvent
}

function normalizedProject(value: string) {
  const project = value.trim().replace(/\s+/g, ' ').replace(/^Project\s+/i, '')
  return /^(octopus|otps)$/i.test(project) ? 'otps' : project.toLowerCase()
}

export function projectHistoryEvents(history: OpeningHistory, project: string, now = Date.now()): ProjectHistoryEntry[] {
  const since = now - 365 * 24 * 60 * 60 * 1000
  return Object.entries(history).flatMap(([openingId, record]) => {
    if (normalizedProject(record.snapshot.project) !== normalizedProject(project)) return []
    return record.events.flatMap(event => {
      const at = Date.parse(event.at)
      if (!Number.isFinite(at) || at < since || at > now) return []
      return [{ openingId, title: event.snapshot.title || record.snapshot.title, event }]
    })
  }).sort((a, b) => Date.parse(b.event.at) - Date.parse(a.event.at))
}

export function snapshotOpening(opening: Opening): OpeningHistorySnapshot {
  const stageCounts: Partial<Record<PipelineStage, number>> = {}
  for (const stage of PIPELINE_STAGES) {
    const count = opening.candidates.filter(candidate => candidate.stage === stage).length
    if (count) stageCounts[stage] = count
  }
  return {
    project: opening.project,
    title: opening.title,
    targetTo: Math.max(0, opening.targetTo || 0),
    hiredCount: Math.max(0, opening.hiredCount || 0),
    candidateCount: opening.candidates.length,
    reason: opening.reason,
    toGroup: opening.toGroup || '',
    approvalUrl: opening.approvalUrl || '',
    stageCounts,
  }
}

function snapshotKey(snapshot: OpeningHistorySnapshot) {
  return JSON.stringify({ ...snapshot, stageCounts: PIPELINE_STAGES.map(stage => [stage, snapshot.stageCounts[stage] || 0]) })
}

function validRecord(value: unknown): value is OpeningHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<OpeningHistoryRecord>
  return (record.status === '진행중' || record.status === '종료')
    && !!record.snapshot && typeof record.snapshot === 'object'
    && Array.isArray(record.events)
}

export function readOpeningHistory(storage: Pick<Storage, 'getItem'> = localStorage): OpeningHistory {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(OPENING_HISTORY_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => validRecord(value))) as OpeningHistory
  } catch {
    return {}
  }
}

export function writeOpeningHistory(history: OpeningHistory, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(OPENING_HISTORY_STORAGE_KEY, JSON.stringify(history))
    return true
  } catch {
    return false
  }
}

function appendEvent(record: OpeningHistoryRecord, event: OpeningHistoryEvent) {
  return { ...record, events: [...record.events, event].slice(-300) }
}

export function openingFromHistory(id: string, record: OpeningHistoryRecord): Opening {
  const snapshot = record.snapshot
  return {
    id,
    project: snapshot.project,
    title: snapshot.title,
    url: '',
    postedAt: '',
    deadline: '',
    source: 'sheet',
    status: '마감',
    targetTo: snapshot.targetTo,
    toGroup: snapshot.toGroup,
    hiredCount: snapshot.hiredCount,
    reason: snapshot.reason,
    approvalUrl: snapshot.approvalUrl,
    isNew: false,
    candidates: [],
  }
}

export function reconcileOpeningHistory(data: DashboardData, previous: OpeningHistory, at = new Date().toISOString()) {
  const history: OpeningHistory = { ...previous }
  const currentIds = new Set(data.openings.map(opening => opening.id))
  const openings = data.openings.map(opening => {
    const snapshot = snapshotOpening(opening)
    const sourceStatus: LifecycleStatus = opening.status === '마감' ? '종료' : '진행중'
    const existing = history[opening.id]
    if (!existing) {
      history[opening.id] = { status: sourceStatus, snapshot, events: [{ kind: 'snapshot', at, status: sourceStatus, snapshot }] }
    } else if (existing.status !== sourceStatus) {
      history[opening.id] = {
        ...existing,
        status: sourceStatus,
        snapshot,
        events: [...existing.events, {
          kind: 'status', at, status: sourceStatus, previousStatus: existing.status, snapshot,
        }].slice(-300),
      }
    } else if (snapshotKey(existing.snapshot) !== snapshotKey(snapshot)) {
      history[opening.id] = appendEvent({ ...existing, snapshot }, {
        kind: 'snapshot', at, status: sourceStatus, snapshot,
      })
    }
    const record = history[opening.id]
    return { ...opening, status: record.status === '종료' ? '마감' as const : '진행중' as const }
  })

  for (const [id, record] of Object.entries(history)) {
    if (currentIds.has(id) || record.status === '종료') continue
    const ended: OpeningHistoryRecord = {
      ...record,
      status: '종료',
      events: [...record.events, { kind: 'removed', at, status: '종료', previousStatus: '진행중', snapshot: record.snapshot }].slice(-300),
    }
    history[id] = ended
  }

  for (const [id, record] of Object.entries(history)) {
    if (!currentIds.has(id) && record.status === '종료') openings.push(openingFromHistory(id, record))
  }
  openings.sort((a, b) => a.project.localeCompare(b.project, 'ko') || a.title.localeCompare(b.title, 'ko'))
  const candidateCount = openings.filter(opening => opening.status === '진행중').reduce((sum, opening) => sum + opening.candidates.length, 0)
  return { data: { ...data, openings, candidateCount }, history }
}

