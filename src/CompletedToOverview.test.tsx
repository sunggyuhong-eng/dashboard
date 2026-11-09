import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { collectCompletedToRows, collectPreviousMondayCompletedToRows, previousMondayInSeoul, CompletedToOverview } from './CompletedToOverview'
import { OverviewReport } from './App'

describe('Dashboard_TO 채용 완료 기록', () => {
  const novemberNinth = new Date('2026-11-09T02:00:00Z')

  it('I열 입사자와 J열 공고마감 날짜를 완료 목록에 표시하고 TO 번호는 숨긴다', async () => {
    const raw = structuredClone(fixture)
    raw.openings[0] = { ...raw.openings[0], toNumber: 15, status: '완료', completedName: '테스트 입사자', completedDate: '2026-11-02' }
    raw.openings[1].status = '완료'
    const data = await buildLiveDashboard(raw, null)
    const rows = collectCompletedToRows(data.openings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ project: 'MAZE', toNumbers: [15], name: '테스트 입사자', date: '2026-11-02', status: '완료' })
    const html = renderToStaticMarkup(<CompletedToOverview openings={data.openings} now={novemberNinth} />)
    expect(html).toContain('채용 완료 TO')
    expect(html).toContain('공고 마감 날짜')
    expect(html).not.toContain('TO 번호')
    expect(html).toContain('테스트 입사자')
    expect(html).toContain('2026.11.02')
    expect(html).not.toContain('TO 상태')
  })

  it('진행중 TO의 부분 입사도 표시하고 공유 TO의 동일 인물은 한 번만 센다', async () => {
    const raw = structuredClone(fixture)
    raw.openings[0] = { ...raw.openings[0], toNumber: 4, completedName: '한가람', completedDate: '2026-11-09' }
    raw.openings[1] = { ...raw.openings[1], toNumber: 5, completedName: '한가람', completedDate: '2026-11-09' }
    const data = await buildLiveDashboard(raw, null)
    const rows = collectCompletedToRows(data.openings)
    expect(rows).toHaveLength(1)
    expect(rows[0].toNumbers).toEqual([4, 5])
    expect(rows[0].titles).toHaveLength(2)
    expect(renderToStaticMarkup(<CompletedToOverview openings={data.openings} now={novemberNinth} />)).not.toContain('한가람')
  })

  it('입사자와 날짜가 비어 있거나 마감 상태인 공고는 지난 월요일 완료 목록에서 제외한다', async () => {
    const raw = structuredClone(fixture)
    raw.openings.forEach(opening => { opening.toGroup = '' })
    raw.openings[0] = { ...raw.openings[0], status: '완료', toNumber: 6 }
    raw.openings[1] = { ...raw.openings[1], status: '마감', toNumber: 7 }
    const data = await buildLiveDashboard(raw, null)
    const html = renderToStaticMarkup(<CompletedToOverview openings={data.openings} now={novemberNinth} />)
    expect(html).toContain('2026.11.02에 완료된 채용이 없습니다.')
    expect(html).not.toContain('TO 번호')
  })

  it('완료되어 채용중 TO가 0명인 QA·Infra·Server·KONG은 프로젝트 목록에서 숨긴다', async () => {
    const raw = structuredClone(fixture)
    raw.openings = ['QA', 'Infra', 'Server', 'KONG'].map((project, index) => ({
      ...raw.openings[0], project, title: `${project} 직무`, toGroup: '', status: '완료',
      completedName: index === 3 ? '테스트 입사자' : '', completedDate: index === 3 ? '2026-11-02' : '',
    }))
    const data = await buildLiveDashboard(raw, null)
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).not.toContain('org-project-row')
    expect(renderToStaticMarkup(<CompletedToOverview openings={data.openings} now={novemberNinth} />)).toContain('테스트 입사자')
    raw.openings[0].status = '진행중'
    const active = renderToStaticMarkup(<OverviewReport data={await buildLiveDashboard(raw, null)} />)
    expect(active.match(/class="org-project-row/g)).toHaveLength(1)
    expect(active).toContain('QA')
  })

  it('매주 서울 월요일 기준 직전 월요일 완료자만 중복 없이 표시하고 새로고침 데이터 변경을 반영한다', async () => {
    const raw = structuredClone(fixture)
    raw.openings = ['A', 'B', 'C', '진행중', '이번주', '이전주', '이름없음'].map((name, index) => ({
      ...raw.openings[0], title: `직무 ${index}`, toGroup: '', status: name === '진행중' ? '진행중' : '완료',
      completedName: name === '이름없음' ? '' : name,
      completedDate: name === '이번주' ? '2026-11-09' : name === '이전주' ? '2026-10-26' : '2026-11-02',
    }))
    const data = await buildLiveDashboard(raw, null)
    expect(previousMondayInSeoul(novemberNinth)).toBe('2026-11-02')
    expect(collectPreviousMondayCompletedToRows(data.openings, novemberNinth).map(row => row.name)).toEqual(['A', 'B', 'C'])
    expect(renderToStaticMarkup(<CompletedToOverview openings={data.openings} now={novemberNinth} />)).toContain('<b>3명</b>')
    data.openings[0].status = '진행중'
    expect(collectPreviousMondayCompletedToRows(data.openings, novemberNinth)).toHaveLength(2)
    const nextMonday = new Date('2026-11-16T02:00:00Z')
    expect(previousMondayInSeoul(nextMonday)).toBe('2026-11-09')
    expect(collectPreviousMondayCompletedToRows(data.openings, nextMonday).map(row => row.name)).toEqual(['이번주'])
  })
})
