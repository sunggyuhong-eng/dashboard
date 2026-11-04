import { describe, expect, it } from 'vitest'
import { recordOpeningHistory, projectHistory } from './opening-history'
import type { Opening } from './types'

const opening = (): Opening => ({ id: 'o1', title: 'MAZE - Client Engineer', project: 'MAZE', url: '', postedAt: '', deadline: '', source: 'sheet', status: '진행중', targetTo: 2, hiredCount: 0, reason: '', isNew: false, candidates: [] })
function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('시트 상태 기반 채용 이력', () => {
  it('최초 기준을 저장하고 TO·전형·G열 상태 변화만 이력으로 남긴다', () => {
    const storage = memoryStorage(), row = opening()
    expect(recordOpeningHistory([row], new Date('2026-11-04T00:00:00Z'), storage).map(item => item.kind)).toEqual(['baseline'])
    expect(recordOpeningHistory([row], new Date('2026-11-04T01:00:00Z'), storage)).toHaveLength(1)
    row.candidates.push({ id: 'c1', row: 1, name: '이름', stage: '온라인 과제', project: 'MAZE', openingTitle: row.title })
    expect(recordOpeningHistory([row], new Date('2026-11-04T02:00:00Z'), storage).at(-1)?.kind).toBe('progress')
    row.status = '완료'
    expect(recordOpeningHistory([row], new Date('2026-11-04T03:00:00Z'), storage).at(-1)?.kind).toBe('status')
  })

  it('프로젝트 단위 최근 365일 이벤트만 시간순으로 반환한다', () => {
    const storage = memoryStorage(), row = opening()
    recordOpeningHistory([row], new Date('2025-10-01T00:00:00Z'), storage)
    row.targetTo = 3
    const events = recordOpeningHistory([row], new Date('2026-11-04T00:00:00Z'), storage)
    expect(projectHistory(events, 'MAZE', new Date('2026-11-04T00:00:00Z'))).toHaveLength(1)
    expect(projectHistory(events, 'BLDS')).toHaveLength(0)
  })
})
