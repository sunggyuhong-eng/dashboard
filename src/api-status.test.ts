import { describe, expect, it } from 'vitest'
import fixture from '../tests/fixtures/shared_to.json'
import { buildLiveDashboard, normalizePipelineStage } from './api'

describe('시트 진행 상태와 전형 이름 연결', () => {
  it('G열 완료 상태는 완료 목록용 상태로 반영하고 기본값은 진행중으로 둔다', async () => {
    const payload = structuredClone(fixture)
    payload.openings[0].status = '완료'
    const data = await buildLiveDashboard(payload, null)
    expect(data.openings.find(opening => opening.title === payload.openings[0].title)?.status).toBe('완료')
    expect(data.openings.find(opening => opening.title === payload.openings[1].title)?.status).toBe('진행중')
  })

  it('온라인 과제 표기 변형을 온라인 과제로 통일한다', () => {
    expect(normalizePipelineStage('온라인과제')).toBe('온라인 과제')
    expect(normalizePipelineStage('온라인 과제')).toBe('온라인 과제')
    expect(normalizePipelineStage('과제 전형')).toBe('온라인 과제')
  })
})
