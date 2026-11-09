import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { collectPipelineRows, collectPlannedHires, PIPELINE_GROUPS, PipelineOverview, ProjectOpeningProgress } from './PipelineOverview'
import { OverviewReport } from './App'

describe('전형별 지원자 목록', () => {
  it('공유 TO 공고도 지원자를 합치거나 중복 제거하지 않고 네 묶음에 정확히 연결한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const opening = data.openings[0]
    const template = opening.candidates[0]
    opening.candidates.push(
      { ...template, id: 'salary', stage: '처우단계', name: '처우 지원자' },
      { ...template, id: 'general', stage: '면접', name: '일반 면접' },
      { ...template, id: 'passed', stage: '면접합격', name: '면접 합격자' },
      { ...template, id: 'art', stage: '온라인 과제', name: '과제 지원자' },
      { ...template, id: 'assessment', stage: '역량검사', name: '역량검사 지원자' },
    )
    data.openings.push({ ...opening, id: 'closed', status: '마감' })
    const counts = PIPELINE_GROUPS.map(group => collectPipelineRows(data.openings, group.id).length)
    expect(counts).toEqual([3, 3, 2, 1])
    const interviews = collectPipelineRows(data.openings, 'interview')
    expect(interviews.map(row => row.candidate.stage).sort()).toEqual(['1차 면접', '2차 면접', '면접'].sort())
    expect(collectPipelineRows(data.openings, 'decision').map(row => row.candidate.stage).sort()).toEqual(['면접합격', '처우단계'].sort())
    const first = interviews.find(row => row.candidate.name === '테스트 A')!
    const second = interviews.find(row => row.candidate.name === '테스트 C')!
    expect(first.openingId).not.toBe(second.openingId)
    expect(first.title).toContain('소프트웨어')
    expect(second.title).toContain('그래픽스')
    expect(interviews.every(row => row.openingId !== 'closed')).toBe(true)
  })

  it('현재 면접 단계에 맞는 일정만 보여주고 이전 면접일을 다음 면접일로 쓰지 않는다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const second = data.openings.flatMap(opening => opening.candidates).find(candidate => candidate.stage === '2차 면접')!
    second.firstInterviewDate = '2026-10-01'
    second.secondInterviewDate = '20261119'
    let row = collectPipelineRows(data.openings, 'interview').find(item => item.candidate.id === second.id)!
    expect(row.dates).toEqual([{ label: '2차 면접', value: '2026-11-19' }])
    second.secondInterviewDate = ''
    row = collectPipelineRows(data.openings, 'interview').find(item => item.candidate.id === second.id)!
    expect(row.dates).toEqual([])
    second.stage = '면접합격'
    expect(collectPipelineRows(data.openings, 'interview').find(item => item.candidate.id === second.id)).toBeUndefined()
    expect(collectPipelineRows(data.openings, 'decision').find(item => item.candidate.id === second.id)!.dates).toEqual([])
  })

  it('오퍼는 입사일순으로 정렬하고 미정자는 마지막에 두며 새로 불러온 단계와 날짜를 반영한다', async () => {
    const raw = structuredClone(fixture)
    const source = raw.candidates.find(candidate => candidate.stage === 'Offer')!
    raw.candidates.push({ ...source, id: 'early', row: 8, name: '빠른 입사', hireDate: '20261119' }, { ...source, id: 'pending', row: 9, name: '입사일 미정자', hireDate: '' })
    const first = await buildLiveDashboard(raw, null)
    expect(collectPipelineRows(first.openings, 'offer').map(row => row.candidate.name)).toEqual(['빠른 입사', '테스트 D', '입사일 미정자'])
    source.stage = 'Hired'
    const pending = raw.candidates.find(candidate => candidate.id === 'pending')!
    pending.hireDate = '2026-11-01'
    const next = await buildLiveDashboard(raw, first)
    expect(collectPipelineRows(next.openings, 'offer').map(row => row.candidate.name)).toEqual(['입사일 미정자', '빠른 입사'])
  })

  it('상단에 네 단계 묶음의 프로젝트·직무·지원자를 한 화면에 보여준다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    data.openings.flatMap(opening => opening.candidates).find(candidate => candidate.stage === 'Offer')!.hireDate = ''
    const html = renderToStaticMarkup(<PipelineOverview openings={data.openings} />)
    expect(html).toContain('aria-label="진행 단계별 지원자 목록"')
    expect(html).toContain('온라인 과제 · 코딩 테스트')
    expect(html).toContain('면접 · 1차 · 2차')
    expect(html).toContain('면접 합격 · 처우 협의')
    expect(html).toContain('입사 예정 · Offer')
    expect(html).toContain('MAZE')
    expect(html).toContain('그래픽스 프로그래머')
    expect(html).toContain('테스트 D')
    expect(html).toContain('테스트 A')
    expect(html).toContain('입사 예정 날짜')
    const detailHtml = renderToStaticMarkup(<ProjectOpeningProgress openings={data.openings} />)
    expect(detailHtml).toContain('진행 단계')
    expect(detailHtml).toContain('공유 TO')
    expect(detailHtml).not.toContain('테스트 D')
    const empty = renderToStaticMarkup(<PipelineOverview openings={[]} />)
    expect(empty).toContain('현재 해당 단계의 지원자가 없습니다.')
  })

  it('상단 입사 예정자 수와 실제 목록은 같은 기준으로 집계한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const offer = data.openings.flatMap(opening => opening.candidates).find(candidate => candidate.stage === 'Offer')!
    offer.offerDate = '2020-01-01'
    expect(collectPlannedHires(data.openings, '2026-11-06')).toHaveLength(0)
    let html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).toMatch(/입사 예정자<\/span><b>0명/)
    expect(html).toContain('입사 예정 · Offer</h3><b>0명')
    offer.offerDate = '2099-01-01'
    html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).toMatch(/입사 예정자<\/span><b>1명/)
    expect(html).toContain('테스트 D')
    expect(collectPlannedHires(data.openings, '2026-11-06')).toHaveLength(1)
  })
})
