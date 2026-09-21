import type { DashboardData } from './types'

const refreshApiUrl = (import.meta.env.VITE_REFRESH_API_URL || '').trim()

export const api = {
  async dashboard(): Promise<DashboardData> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('동기화 데이터를 찾지 못했습니다. GitHub Actions를 먼저 실행해 주세요.')
    const body = await response.json() as DashboardData & { error?: string }
    if (!Array.isArray(body.openings)) throw new Error(body.error || '대시보드 데이터 형식이 올바르지 않습니다.')
    return body
  },

  async requestSync(): Promise<void> {
    if (!refreshApiUrl) {
      throw new Error('즉시 동기화 주소가 설정되지 않았습니다. GitHub Actions 변수 REFRESH_API_URL을 확인해 주세요.')
    }
    const response = await fetch(refreshApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' }),
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (!response.ok || !body.ok) {
      throw new Error(body.error || 'GitHub Actions 실행을 요청하지 못했습니다.')
    }
  },
}
