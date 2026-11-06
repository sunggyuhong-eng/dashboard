import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { collectPipelineRows, PIPELINE_GROUPS, PipelineOverview } from './PipelineOverview'

describe('전형별 지원자 목록', () => {
  it('공유 TO 공고도 지원자를 합치거나 중복 제거하지 않고 다섯 전형에 정확히 연결한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const opening = data.openings[0]
    const template = opening.candidates[0]
    opening.candidates.push(
      { ...template, id: 'salary', stage: '처우단계', name: '처우 지원자' },
      { ...template, id: 'general', stage: '면접', name: '일반 면접' },
      { ...template, id: 'passed', stage: '면접합격', name: '면접 합격자' },
      { ...template, id: 'art', stage: '온라인 과제', name: '과제 지원자' },
    )
    data.openings.push({ ...opening, id: 'closed', status: '마감' })
    const counts = PIPELINE_GROUPS.map(group => collectPipelineRows(data.openings, group.id).length)
    expect(counts).toEqual([1, 1, 4, 1, 1])
    const interviews = collectPipelineRows(data.openings, 'interview')
    expect(interviews.map(row => row.candidate.stage).sort()).toEqual(['1차 면접', '2차 면접', '면접', '면접합격'].sort())
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
    expect(collectPipelineRows(data.openings, 'interview').find(item => item.candidate.id === second.id)!.dates).toEqual([])
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

  it('프로젝트별 채용 진행과 입사 예정자 화면을 분리해 표시한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    data.openings.flatMap(opening => opening.candidates).find(candidate => candidate.stage === 'Offer')!.hireDate = ''
    const html = renderToStaticMarkup(<PipelineOverview openings={data.openings} />)
    expect(html).toContain('id="operations-tab-openings" aria-selected="true"')
    expect(html).toContain('MAZE')
    expect(html).toContain('그래픽스 프로그래머')
    expect(html).toContain('채용 사유')
    expect(html).toContain('진행 단계')
    expect(html).not.toContain('테스트 D')
    expect(html).not.toContain('테스트 A')
    const hireHtml = renderToStaticMarkup(<PipelineOverview openings={data.openings} initialView="hires" />)
    expect(hireHtml).toContain('id="operations-tab-hires" aria-selected="true"')
    expect(hireHtml).toContain('테스트 D')
    expect(hireHtml).toContain('입사 예정일')
    expect(hireHtml).toContain('일정 미정')
    const empty = renderToStaticMarkup(<PipelineOverview openings={[]} />)
    expect(empty).toContain('현재 진행 중인 채용 TO가 없습니다.')
    const emptyHires = renderToStaticMarkup(<PipelineOverview openings={[]} initialView="hires" />)
    expect(emptyHires).toContain('현재 입사 예정자가 없습니다.')
  })
})
