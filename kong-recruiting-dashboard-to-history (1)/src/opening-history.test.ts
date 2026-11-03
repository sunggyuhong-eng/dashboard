import { describe, expect, it } from 'vitest'
import type { DashboardData, Opening } from './types'
import { projectHistoryEvents, reconcileOpeningHistory, type OpeningHistory } from './opening-history'

const opening = (): Opening => ({
  id: 'opening-1', title: 'Software Engineer', project: 'MAZE', url: '', postedAt: '', deadline: '',
  status: '진행중', targetTo: 3, toGroup: 'MAZE-DEV', hiredCount: 1, reason: '대체 채용',
  source: 'sheet', isNew: false, candidates: [
    { id: 'candidate-1', row: 2, name: '테스트 지원자', stage: '코딩테스트', project: 'MAZE', openingTitle: 'Software Engineer' },
    { id: 'candidate-2', row: 3, name: '테스트 지원자 2', stage: '1차 면접', project: 'MAZE', openingTitle: 'Software Engineer' },
  ],
})

const dashboard = (openings: Opening[]): DashboardData => ({ openings, syncedAt: '2026-11-02T00:00:00.000Z', candidateCount: openings.reduce((sum, item) => sum + item.candidates.length, 0) })

describe('공고 상태와 TO 이력', () => {
  it('시트 조회로 최초 TO와 단계 인원을 기록하고 값이 바뀔 때만 이력을 추가한다', () => {
    const initial = opening()
    const first = reconcileOpeningHistory(dashboard([initial]), {}, '2026-11-02T00:00:00.000Z')
    expect(first.history[initial.id].events).toHaveLength(1)
    expect(first.history[initial.id].snapshot.stageCounts).toEqual({ 코딩테스트: 1, '1차 면접': 1 })
    const same = reconcileOpeningHistory(dashboard([initial]), first.history, '2026-11-02T01:00:00.000Z')
    expect(same.history[initial.id].events).toHaveLength(1)
    const changed = reconcileOpeningHistory(dashboard([{ ...initial, targetTo: 4, hiredCount: 2 }]), same.history, '2026-11-03T00:00:00.000Z')
    expect(changed.history[initial.id].events).toHaveLength(2)
    expect(changed.history[initial.id].events[1].snapshot.targetTo).toBe(4)
  })

  it('시트에서 완료로 표시한 후 공고가 빠져도 완료 상태와 TO 이력을 복원한다', () => {
    const current = opening()
    const observed = reconcileOpeningHistory(dashboard([current]), {} as OpeningHistory, '2026-11-02T00:00:00.000Z')
    const completed = reconcileOpeningHistory(dashboard([{ ...current, status: '마감' }]), observed.history, '2026-11-04T00:00:00.000Z')
    expect(completed.data.openings[0].status).toBe('마감')
    const removed = reconcileOpeningHistory(dashboard([]), completed.history, '2026-11-05T00:00:00.000Z')
    expect(removed.data.openings).toHaveLength(1)
    expect(removed.data.openings[0]).toMatchObject({ id: current.id, status: '마감', targetTo: 3, hiredCount: 1 })
    expect(removed.history[current.id].events.map(event => event.kind)).toEqual(['snapshot', 'status'])
  })

  it('시트 상태가 완료로 바뀌면 진행 지원자 합계에서 제외되고 진행중 복귀 시 다시 포함한다', () => {
    const current = opening()
    const observed = reconcileOpeningHistory(dashboard([current]), {})
    const closed = reconcileOpeningHistory(dashboard([{ ...current, status: '마감' }]), observed.history)
    expect(closed.data.candidateCount).toBe(0)
    const reopened = reconcileOpeningHistory(dashboard([current]), closed.history)
    expect(reopened.data.candidateCount).toBe(2)
    expect(reopened.history[current.id].status).toBe('진행중')
  })

  it('프로젝트별 히스토리는 최근 365일의 변경만 반환한다', () => {
    const current = opening()
    const now = Date.parse('2026-11-03T00:00:00.000Z')
    const initial = reconcileOpeningHistory(dashboard([current]), {}, new Date(now - 366 * 86400000).toISOString())
    const changed = reconcileOpeningHistory(dashboard([{ ...current, targetTo: 4 }]), initial.history, new Date(now - 180 * 86400000).toISOString())
    const entries = projectHistoryEvents(changed.history, 'MAZE', now)
    expect(entries).toHaveLength(1)
    expect(entries[0].event.snapshot.targetTo).toBe(4)
  })
})
