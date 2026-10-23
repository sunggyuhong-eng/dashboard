import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { OpeningBoard, OverviewReport } from './App'
import { groupOpeningsByProject, groupOpeningsByTo, totalTargetTo } from './headcount'

const payload = () => structuredClone(fixture)

describe('공유 TO', () => {
  it('두 공고의 3+3을 3명으로 합산하고 지원자·전형·날짜·승인 링크는 공고별로 유지한다', async () => {
    const data = await buildLiveDashboard(payload(), null)
    expect(data.openings).toHaveLength(2)
    expect(totalTargetTo(data.openings)).toBe(3)
    expect(data.candidateCount).toBe(4)
    for (const opening of data.openings) {
      expect(opening.candidates).toHaveLength(2)
      expect(opening.candidates.every(candidate => candidate.openingTitle === opening.title)).toBe(true)
      expect(opening.approvalUrl).toMatch(/^https:\/\/example.com\/approval\//)
    }
    const candidates = data.openings.flatMap(opening => opening.candidates)
    expect(candidates.filter(candidate => candidate.stage.includes('면접'))).toHaveLength(2)
    expect(candidates.find(candidate => candidate.stage === 'Offer')?.hireDate).toBe('2026-12-01')
    expect(candidates.find(candidate => candidate.stage === '1차 면접')?.firstInterviewDate).toBe('2026-11-19')
  })

  it('그룹이 없는 기존 공고와 같은 이름의 다른 프로젝트 그룹은 독립 집계한다', async () => {
    const old = payload()
    old.openings.forEach(opening => { opening.toGroup = '' })
    expect(totalTargetTo((await buildLiveDashboard(old, null)).openings)).toBe(6)
    old.openings[0].toGroup = '공유-01'
    old.openings[1].toGroup = '공유-01'
    old.openings[1].project = 'ZERO'
    expect(totalTargetTo((await buildLiveDashboard(old, null)).openings)).toBe(6)
  })

  it('그룹 추가·해제·수정에도 공고 ID와 지원자 연결을 유지한다', async () => {
    const raw = payload()
    raw.openings.forEach(opening => { opening.toGroup = '' })
    const before = await buildLiveDashboard(raw, null)
    const shared = await buildLiveDashboard(payload(), before)
    expect(shared.openings.map(opening => opening.id)).toEqual(before.openings.map(opening => opening.id))
    expect(shared.openings.every(opening => !opening.isNew)).toBe(true)
    expect(shared.openings.map(opening => opening.candidates)).toEqual(before.openings.map(opening => opening.candidates))
    const removed = await buildLiveDashboard(raw, shared)
    expect(totalTargetTo(removed.openings)).toBe(6)
    expect(removed.openings.map(opening => opening.id)).toEqual(before.openings.map(opening => opening.id))
    const updated = payload()
    updated.openings.forEach(opening => { opening.targetTo = 4; opening.toGroup = '새그룹' })
    expect(totalTargetTo((await buildLiveDashboard(updated, shared)).openings)).toBe(4)
    expect(totalTargetTo((await buildLiveDashboard({...payload(), openings: [payload().openings[0]]}, shared)).openings)).toBe(3)
  })

  it('3/0도 처리하되 서로 다른 양수 TO는 어느 순서에서든 명확히 거부한다', async () => {
    const raw = payload()
    raw.openings[1].targetTo = 0
    expect(totalTargetTo((await buildLiveDashboard(raw, null)).openings)).toBe(3)
    raw.openings[1].targetTo = 2
    await expect(buildLiveDashboard(raw, null)).rejects.toThrow('채용인원이 서로 다릅니다')
    raw.openings.reverse()
    await expect(buildLiveDashboard(raw, null)).rejects.toThrow('MAZE-개발-01')
  })

  it('프로젝트 별칭과 그룹 공백·대소문자를 일관되게 처리한다', async () => {
    const raw = payload()
    raw.openings[0].project = 'Project octopus'
    raw.openings[1].project = 'OTPS'
    raw.openings[0].toGroup = ' Shared   Pool '
    raw.openings[1].toGroup = 'shared pool'
    const data = await buildLiveDashboard(raw, null)
    expect(totalTargetTo(data.openings)).toBe(3)
    expect([...groupOpeningsByProject(data.openings).keys()]).toEqual(['OTPS'])
  })

  it('화면 합계·프로젝트·원 그래프는 3명, 표는 TO와 공통 배경만 병합한다', async () => {
    const data = await buildLiveDashboard(payload(), null)
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).toMatch(/오픈 공고<\/span><b>2개/)
    expect(html).toMatch(/목표 TO<\/span><b>3명/)
    expect(html).toMatch(/진행 지원자<\/span><b>4명/)
    expect(html).toContain('(3명)')
    expect(html).toContain('<span>100%</span><strong>3명</strong>')
    expect(html).toContain('class="to-cell" rowSpan="2"')
    expect(html).not.toContain('개 공고 합산')
    expect(html).not.toContain('shared-to-row')
    expect(html).not.toContain('공유 TO')
    expect(html).toContain('class="reason-cell shared-reason-cell" rowSpan="2"')
    expect(html.match(/개발 인력 대체채용/g)).toHaveLength(1)
    expect(html).toContain('1차 면접 1명 진행 중')
    expect(html).toContain('2차 면접 1명 진행 중')
    expect(html).toContain('오퍼 1명 진행 중')
    const differing = structuredClone(data)
    differing.openings[0].reason = '별도 세부 사유'
    const differingHtml = renderToStaticMarkup(<OverviewReport data={differing} />)
    expect(differingHtml).not.toContain('class="reason-cell shared-reason-cell"')
    expect(differingHtml).toContain('별도 세부 사유')
  })

  it('상세 화면은 공유 충원·잔여 TO와 선택 공고의 지원자만 표시한다', async () => {
    const data = await buildLiveDashboard(payload(), null)
    data.openings[0].hiredCount = 1
    data.openings[1].hiredCount = 1
    const group = groupOpeningsByTo(data.openings)[0]
    expect(group.hiredCount).toBe(2)
    const html = renderToStaticMarkup(<OpeningBoard opening={data.openings[0]} openings={data.openings} />)
    expect(html).toMatch(/목표 TO<\/span><b>3명/)
    expect(html).toMatch(/충원 완료<\/span><b>2명/)
    expect(html).toMatch(/잔여 TO<\/span><b>1명/)
    expect(html).toMatch(/진행 지원자<\/span><b>2명/)
    expect(html).not.toContain('shared-to-summary')
    expect(data.openings[1].candidates.every(candidate => !html.includes(candidate.name))).toBe(true)
  })

  it('공유 TO는 하나의 기준 인원으로 유지하고 세부 직무는 각각 표시한다', async () => {
    const data = await buildLiveDashboard(payload(), null)
    const groups = groupOpeningsByTo(data.openings)
    expect(groups).toHaveLength(1)
    expect(groups[0].targetTo).toBe(3)
    expect(groups[0].openings.map(opening => opening.title)).toEqual(expect.arrayContaining([
      '소프트웨어 엔지니어 모집 (경력 5년 이상)',
      '그래픽스 프로그래머 모집 (경력 5년 이상)',
    ]))
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).not.toContain('2개 공고 합산')
    expect(html).not.toContain('지원자 추이')
  })
})
