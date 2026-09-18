import type { DashboardData } from './types'

export const api = {
  async dashboard(): Promise<DashboardData> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('동기화 데이터를 찾지 못했습니다. GitHub Actions를 먼저 실행해 주세요.')
    const body = await response.json() as DashboardData & { error?: string }
    if (!Array.isArray(body.openings)) throw new Error(body.error || '대시보드 데이터 형식이 올바르지 않습니다.')
    return body
  },
}
