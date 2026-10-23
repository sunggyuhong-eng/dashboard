import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildProjectReports, openingStageCounts, RecruitingReport } from './RecruitingReport'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'

const reportData = async () => {
  const data = await buildLiveDashboard(structuredClone(fixture), null)
  data.syncedAt = '2026-10-23T03:00:00.000Z'
  data.openings[0].candidates.push({ id: 'offer-1', row: 99, name: '테스트지원자', stage: 'Offer', project: 'MAZE', openingTitle: data.openings[0].title, hireDate: '2026-11-19' })
  data.candidateCount++
  return data
}

describe('채용 PDF 리포트', () => {
  it('공유 TO는 프로젝트 합계에서 한 번만 계산하고 직무는 각각 유지한다', async () => {
    const data = await reportData()
    const reports = buildProjectReports(data.openings)
    expect(reports).toHaveLength(1)
    expect(reports[0].targetTo).toBe(3)
    expect(reports[0].openings.map(opening => opening.title)).toHaveLength(2)
  })

  it('표지, 요약, 오퍼 일정, 프로젝트별 현황과 PDF 저장 버튼을 제공한다', async () => {
    const data = await reportData()
    const html = renderToStaticMarkup(<RecruitingReport data={data} openingNotes={new Map()} onClose={vi.fn()} />)
    expect(html).toContain('채용 진행')
    expect(html).toContain('현황 리포트')
    expect(html).toContain('전체 채용 현황')
    expect(html).toContain('코딩 테스트')
    expect(html).toContain('처우 협의')
    expect(html).toContain('테스트지원자')
    expect(html).toContain('2026.11.19')
    expect(html).toContain('PROJECT RECRUITING')
    expect(html).toContain('PDF 저장')
    expect(html).not.toContain('공고 합산')
  })

  it('공고별 진행 단계와 인원을 색상 바 및 단계별 범례로 보여준다', async () => {
    const data = await reportData()
    const opening = data.openings.find(item => item.title.includes('소프트웨어'))!
    opening.candidates.push({ id: 'offer-software', row: 101, name: '오퍼 지원자', stage: 'Offer', project: opening.project, openingTitle: opening.title })
    expect(openingStageCounts(opening).map(item => [item.label, item.count])).toEqual([
      ['코딩 테스트', 1], ['1차 면접', 1], ['오퍼', 1],
    ])

    const html = renderToStaticMarkup(<RecruitingReport data={data} openingNotes={new Map()} onClose={vi.fn()} />)
    expect(html).toContain('전형별 진행 인원')
    expect(html).toContain('pdf-stage-segment pdf-stage-coding')
    expect(html).toContain('pdf-stage-segment pdf-stage-interview-first')
    expect(html).toContain('pdf-stage-segment pdf-stage-offer')
    expect(html).toContain('aria-label="코딩 테스트 1명, 1차 면접 1명, 오퍼 1명"')

    opening.candidates = []
    const emptyHtml = renderToStaticMarkup(<RecruitingReport data={data} openingNotes={new Map()} onClose={vi.fn()} />)
    expect(emptyHtml).toContain('이력서 검토 중')
  })
})
