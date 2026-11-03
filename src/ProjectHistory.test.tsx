import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { ProjectHistoryView } from './App'
import { reconcileOpeningHistory } from './opening-history'

describe('프로젝트별 채용 히스토리', () => {
  it('프로젝트의 공고 카드, 온라인 과제 단계, 최근 1년 변경 이력을 한 화면에 보여준다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const opening = data.openings[0]
    opening.candidates.push({ id: 'assignment', row: 20, name: '과제 지원자', stage: '온라인 과제', project: 'MAZE', openingTitle: opening.title })
    const observed = reconcileOpeningHistory(data, {}, new Date().toISOString())
    const html = renderToStaticMarkup(<ProjectHistoryView project="MAZE" data={observed.data} history={observed.history} onBack={() => {}} onSelectOpening={() => {}} />)
    expect(html).toContain('MAZE 채용 히스토리')
    expect(html).toContain('프로젝트 채용 직무')
    expect(html).toContain('온라인 과제')
    expect(html).toContain('1명')
    expect(html).toContain('최근 1년 히스토리')
    expect(html).toContain('최초 기록')
  })
})
