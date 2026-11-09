import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { liveWeeklyRows, mondayInSeoul, weeklyComparison, WeeklyComparison } from './WeeklyComparison'

describe('월요일 채용 현황 비교', () => {
  it('서울 시간 월요일을 기준으로 공유 TO와 완료 날짜를 정확히 집계한다', async () => {
    expect(mondayInSeoul(new Date('2026-11-08T15:30:00Z'))).toBe('2026-11-09')
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const example = data.openings[0]
    data.openings.push({ ...example, id: 'completed', project: 'KONG', title: '글로벌 사업PM', toGroup: '',
      status: '완료', completedName: '테스트 입사자', completedDate: '2026-11-09', candidates: [] })
    const rows = liveWeeklyRows(data.openings, '2026-11-09')
    expect(rows.find(row => row.project === '전체')).toMatchObject({ activeTo: 3, candidates: 4, completed: 1 })
    expect(rows.find(row => row.project === 'KONG')).toMatchObject({ activeTo: 0, completed: 1 })
    data.openings[2].completedDate = '2026-11-02'
    expect(liveWeeklyRows(data.openings, '2026-11-09')[0].completed).toBe(0)
  })

  it('직전 월요일 기록이 있어야 차이를 표시하며 없으면 기준일만 안내한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const now = new Date('2026-11-09T02:00:00Z')
    expect(weeklyComparison(data, now).hasPrevious).toBe(false)
    expect(renderToStaticMarkup(<WeeklyComparison data={data} now={now} />)).toContain('지난 월요일 기록 없음')
    data.weeklySnapshots = [
      { week: '2026-11-02', project: '전체', activeTo: 4, candidates: 5, completed: 2, capturedAt: '2026-11-02 10:00:00' },
      { week: '2026-11-02', project: 'MAZE', activeTo: 4, candidates: 5, completed: 2, capturedAt: '2026-11-02 10:00:00' },
    ]
    const result = weeklyComparison(data, now)
    expect(result.hasPrevious).toBe(true)
    const html = renderToStaticMarkup(<WeeklyComparison data={data} now={now} />)
    expect(html).toContain('4 → <b>3</b>')
    expect(html).toContain('5 → <b>4</b>')
    data.weeklySnapshots.push({ week: '2026-11-09', project: '전체', activeTo: 2, candidates: 3, completed: 1, capturedAt: '2026-11-09 23:07:00' })
    expect(weeklyComparison(data, new Date('2026-11-10T02:00:00Z')).current[0].activeTo).toBe(3)
  })

  it('새로고침 후 늦게 입력한 지난 월요일 완료 세 명을 기록 없이도 보여준다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const example = data.openings[0]
    const now = new Date('2026-11-09T02:00:00Z')
    expect(weeklyComparison(data, now).previous[0].completed).toBe(0)
    for (const [index, project] of ['Art실', 'HERO', 'MAZE'].entries()) {
      data.openings.push({ ...example, id: `completed-${index}`, project, title: `완료 직무 ${index}`,
        toGroup: '', status: '완료', completedName: `입사자 ${index}`, completedDate: '2026-11-02', candidates: [] })
    }
    const result = weeklyComparison(data, now)
    expect(result.hasPrevious).toBe(false)
    expect(result.current[0].completed).toBe(0)
    expect(result.previous.find(row => row.project === '전체')?.completed).toBe(3)
    expect(renderToStaticMarkup(<WeeklyComparison data={data} now={now} />)).toContain('지난 월요일 채용 완료 <b>3명</b>')
    data.weeklySnapshots = [{ week: '2026-11-02', project: '전체', activeTo: 5, candidates: 6, completed: 0, capturedAt: '' }]
    expect(weeklyComparison(data, now).previous[0].completed).toBe(3)
  })
})
