import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { collectCompletedToRows, CompletedToOverview } from './CompletedToOverview'
import { OverviewReport } from './App'

describe('Dashboard_TO 채용 완료 기록', () => {
  it('I열 입사자와 J열 공고마감 날짜를 완료 목록에 표시하고 TO 번호는 숨긴다', async () => {
    const raw = structuredClone(fixture)
    raw.openings[0] = { ...raw.openings[0], toNumber: 15, status: '완료', completedName: '테스트 입사자', completedDate: '2026-11-09' }
    raw.openings[1].status = '완료'
    const data = await buildLiveDashboard(raw, null)
    const rows = collectCompletedToRows(data.openings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ project: 'MAZE', toNumbers: [15], name: '테스트 입사자', date: '2026-11-09', status: '완료' })
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).toContain('채용 완료 TO')
    expect(html).toContain('공고 마감 날짜')
    expect(html).not.toContain('TO 번호')
    expect(html).toContain('테스트 입사자')
    expect(html).toContain('2026.11.09')
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
    expect(renderToStaticMarkup(<CompletedToOverview openings={data.openings} />)).toContain('진행중')
  })

  it('입사자가 비어 있는 완료 TO는 미입력 상태로 보여주고 마감 공고는 완료로 간주하지 않는다', async () => {
    const raw = structuredClone(fixture)
    raw.openings.forEach(opening => { opening.toGroup = '' })
    raw.openings[0] = { ...raw.openings[0], status: '완료', toNumber: 6 }
    raw.openings[1] = { ...raw.openings[1], status: '마감', toNumber: 7 }
    const data = await buildLiveDashboard(raw, null)
    const html = renderToStaticMarkup(<CompletedToOverview openings={data.openings} />)
    expect(html).toContain('입사자 미입력')
    expect(html).toContain('날짜 미입력')
    expect(html).not.toContain('TO 번호')
  })

  it('완료되어 채용중 TO가 0명인 QA·Infra·Server·KONG은 프로젝트 목록에서 숨긴다', async () => {
    const raw = structuredClone(fixture)
    raw.openings = ['QA', 'Infra', 'Server', 'KONG'].map((project, index) => ({
      ...raw.openings[0], project, title: `${project} 직무`, toGroup: '', status: '완료',
      completedName: index === 3 ? '테스트 입사자' : '', completedDate: index === 3 ? '2026-11-09' : '',
    }))
    const data = await buildLiveDashboard(raw, null)
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).not.toContain('org-project-row')
    expect(html).toContain('KONG')
    expect(html).toContain('테스트 입사자')
    raw.openings[0].status = '진행중'
    const active = renderToStaticMarkup(<OverviewReport data={await buildLiveDashboard(raw, null)} />)
    expect(active.match(/class="org-project-row/g)).toHaveLength(1)
    expect(active).toContain('QA')
  })
})
