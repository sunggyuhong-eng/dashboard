import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard } from './api'
import { OverviewReport } from './App'
import { collectOffers, offerDate, OfferOverview } from './OfferOverview'

describe('오퍼 · 입사 예정', () => {
  it('오퍼만 공고별로 모으며 날짜순 정렬 후 미정자를 표시한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const opening = data.openings[0]
    const offer = data.openings.flatMap(item => item.candidates).find(candidate => candidate.stage === 'Offer')!
    opening.candidates.push(
      { ...offer, id: 'earlier', name: '지원자 빠름', hireDate: '20261119' },
      { ...offer, id: 'pending', name: '지원자 미정', hireDate: '' },
    )
    data.openings.push({ ...opening, id: 'closed', status: '마감' })
    const rows = collectOffers(data.openings)
    expect(rows.map(row => row.candidate.name)).toEqual(['지원자 빠름', '테스트 D', '지원자 미정'])
    expect(rows.map(row => row.hireDate)).toEqual(['2026-11-19', '2026-12-01', ''])
    expect(rows.every(row => row.candidate.stage === 'Offer' && row.openingId !== 'closed')).toBe(true)
    expect(rows[0].openingId).toBe(opening.id)
  })

  it('실제 존재하는 날짜만 표시하며 잘못된 날짜나 짧은 숫자를 추정하지 않는다', () => {
    expect(offerDate('20261119')).toBe('2026-11-19')
    expect(offerDate('2026-11-19')).toBe('2026-11-19')
    expect(offerDate('2026. 11. 19.')).toBe('2026-11-19')
    expect(offerDate('2026년 11월 19일')).toBe('2026-11-19')
    expect(offerDate('2027-01-04T09:00:00')).toBe('2027-01-04')
    expect(offerDate('20280229')).toBe('2028-02-29')
    for (const invalid of ['', '미정', '20260229', '2026-02-30', '2026-13-01', '2026119']) expect(offerDate(invalid)).toBe('')
  })

  it('프로젝트·직무·이름·날짜와 공고 이동 버튼을 표시하고 과거 날짜도 자동 입사 처리하지 않는다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const offer = data.openings.flatMap(item => item.candidates).find(candidate => candidate.stage === 'Offer')!
    offer.hireDate = '2026-01-01'
    const html = renderToStaticMarkup(<OfferOverview openings={data.openings} onSelectOpening={() => {}} />)
    expect(html).toContain('MAZE')
    expect(html).toContain('그래픽스 프로그래머')
    expect(html).toContain('테스트 D')
    expect(html).toContain('class="offer-hire-date" dateTime="2026-01-01"')
    expect(html).toContain('2026.01.01')
    expect(html).toContain('공고 보기')
    expect(offer.stage).toBe('Offer')
  })

  it('새로 불러온 날짜 변경·삭제·전형 변경을 즉시 반영한다', async () => {
    const raw = structuredClone(fixture)
    const first = await buildLiveDashboard(raw, null)
    const source = raw.candidates.find(candidate => candidate.stage === 'Offer')!
    source.hireDate = '2027-01-04'
    const updated = await buildLiveDashboard(raw, first)
    expect(collectOffers(updated.openings)[0].hireDate).toBe('2027-01-04')
    source.hireDate = ''
    const cleared = await buildLiveDashboard(raw, updated)
    expect(renderToStaticMarkup(<OfferOverview openings={cleared.openings} />)).toContain('입사일 미정')
    source.stage = 'Hired'
    const hired = await buildLiveDashboard(raw, cleared)
    expect(collectOffers(hired.openings)).toHaveLength(0)
    expect(renderToStaticMarkup(<OfferOverview openings={hired.openings} />)).toContain('진행 중인 오퍼가 없습니다.')
  })

  it('공유 TO 합계와 공고별 오퍼 수를 유지하며 요약 안에 오퍼 패널을 표시한다', async () => {
    const data = await buildLiveDashboard(structuredClone(fixture), null)
    const html = renderToStaticMarkup(<OverviewReport data={data} />)
    expect(html).toMatch(/목표 TO<\/span><b>3명/)
    expect(html).toMatch(/진행 지원자<\/span><b>4명/)
    expect(html).toContain('pipeline-step pipeline-offer')
    expect(html).toContain('class="offer-total">1<small>명</small>')
    expect(html).toContain('class="to-cell shared-to-cell" rowSpan="2"')
    expect(html).toContain('오퍼 · 입사 예정')
  })
})
