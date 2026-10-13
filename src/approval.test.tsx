import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildLiveDashboard } from './api'
import { ApprovalLink } from './ApprovalLink'

describe('채용승인신청서 바로가기', () => {
  it('같은 직무명도 프로젝트별 링크를 유지하고 링크 변경 시 공고 ID를 보존한다', async () => {
    const payload = { ok: true, candidates: [], openings: [
      { project: 'QA실', title: '게임 QA 담당자 (계약직)', approvalUrl: 'https://example.com/approval/qa' },
      { project: 'HERO', title: '게임 QA 담당자 (계약직)', approvalUrl: 'https://example.com/approval/hero' },
    ] }
    const first = await buildLiveDashboard(payload, null)
    expect(first.openings.find(row => row.project === 'QA실')?.approvalUrl).toBe('https://example.com/approval/qa')
    expect(first.openings.find(row => row.project === 'HERO')?.approvalUrl).toBe('https://example.com/approval/hero')
    payload.openings[0].approvalUrl = 'https://example.com/approval/qa-new'
    const updated = await buildLiveDashboard(payload, first)
    expect(updated.openings.map(row => row.id)).toEqual(first.openings.map(row => row.id))
    expect(updated.openings.every(row => !row.isNew)).toBe(true)
    expect(updated.openings.find(row => row.project === 'QA실')?.approvalUrl).toBe('https://example.com/approval/qa-new')
    payload.openings[0].approvalUrl = ''
    const removed = await buildLiveDashboard(payload, updated)
    expect(removed.openings.find(row => row.project === 'QA실')?.approvalUrl).toBe('')
  })

  it('정상 링크는 새 탭으로 열고 링크 없는 기존 데이터에는 버튼을 표시하지 않는다', () => {
    const html = renderToStaticMarkup(<ApprovalLink url="https://example.com/approval?id=1&project=qa" title="게임 QA 담당자" />)
    expect(html).toContain('href="https://example.com/approval?id=1&amp;project=qa"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('바로가기')
    expect(renderToStaticMarkup(<ApprovalLink title="이전 공고" />)).toBe('')
    expect(renderToStaticMarkup(<ApprovalLink url="javascript:alert(1)" title="잘못된 링크" />)).toBe('')
  })
})
