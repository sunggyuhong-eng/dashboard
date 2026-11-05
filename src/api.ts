import { PIPELINE_STAGES, type Candidate, type DashboardData, type Opening, type PipelineStage, type ProjectTable } from './types'
import { approvalLink } from './links'
import { groupOpeningsByTo } from './headcount'

type SheetOpening = { project?: unknown; title?: unknown; targetTo?: unknown; toGroup?: unknown; reason?: unknown; approvalUrl?: unknown; status?: unknown; toNumber?: unknown }
type SheetCandidate = { id?: unknown; row?: unknown; name?: unknown; stage?: unknown; project?: unknown; openingTitle?: unknown; hireDate?: unknown; firstInterviewDate?: unknown; secondInterviewDate?: unknown }
type SheetPayload = {
  ok?: boolean
  error?: string
  openings?: SheetOpening[]
  candidates?: SheetCandidate[]
  hiredCounts?: Record<string, unknown>
  projectTotals?: Record<string, unknown>
  projectTables?: Record<string, { totalTo?: unknown; rows?: Array<{ part?: unknown; count?: unknown; members?: unknown[] }> }>
  syncedAt?: string
}

const clean = (value: unknown) => String(value ?? '').trim()
const normalized = (value: unknown) => clean(value).replace(/\s+/g, ' ').toLowerCase()
const openingKey = (project: unknown, title: unknown) => `${normalized(project)}\u001f${normalized(title)}`

export function normalizePipelineStage(value: unknown): PipelineStage | null {
  const key = normalized(value).replace(/[\s_-]+/g, '')
  if (key.includes('코딩') || key.includes('coding')) return '코딩테스트'
  if (key.includes('과제') || key.includes('assignment') || key === 'task' || key.includes('onlinetask')) return '온라인 과제'
  const aliases: Record<string, PipelineStage> = {
    '온라인과제': '온라인 과제', '온라인과제전형': '온라인 과제',
    '코딩테스트': '코딩테스트', '역량검사': '역량검사',
    '면접': '면접', '1차면접': '1차 면접', '2차면접': '2차 면접',
    '면접합격': '면접합격', '처우단계': '처우단계', '처우협의': '처우단계',
    'offer': 'Offer', '오퍼': 'Offer',
  }
  return aliases[key] || null
}

async function openingId(project: unknown, title: unknown) {
  const input = new TextEncoder().encode(openingKey(project, title))
  const digest = await crypto.subtle.digest('SHA-256', input)
  const hex = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
  return `sheet-${hex.slice(0, 16)}`
}

function readSheetJsonp(sheetApiUrl: string): Promise<SheetPayload> {
  if (!sheetApiUrl) throw new Error('배포 데이터에 시트 연결 주소가 없습니다. 최신 파일을 업로드한 뒤 GitHub Actions를 한 번 실행해 주세요.')
  return new Promise((resolve, reject) => {
    const callbackName = `kongSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const target = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    const cleanup = () => {
      window.clearTimeout(timer)
      script.remove()
      delete target[callbackName]
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('시트 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'))
    }, 30_000)
    target[callbackName] = (payload: SheetPayload) => { cleanup(); resolve(payload) }
    script.onerror = () => { cleanup(); reject(new Error('시트 데이터를 불러오지 못했습니다. Apps Script 배포 주소를 확인해 주세요.')) }
    script.src = `${sheetApiUrl}${sheetApiUrl.includes('?') ? '&' : '?'}callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`
    document.head.appendChild(script)
  })
}

export async function buildLiveDashboard(payload: SheetPayload, previous: DashboardData | null): Promise<DashboardData> {
  if (!payload.ok || !Array.isArray(payload.openings) || !Array.isArray(payload.candidates)) {
    throw new Error(payload.error || '시트 데이터 형식이 올바르지 않습니다.')
  }
  const previousIds = new Set((previous?.openings || []).map(item => item.id))
  const candidatesByOpening = new Map<string, Candidate[]>()
  payload.candidates.forEach((source, index) => {
    const stage = normalizePipelineStage(source.stage)
    if (!stage) return
    const key = openingKey(source.project, source.openingTitle)
    const candidate: Candidate = {
      id: clean(source.id) || `row-${clean(source.row) || index + 1}`,
      row: Number(source.row) || index + 1,
      name: clean(source.name),
      stage,
      project: clean(source.project),
      openingTitle: clean(source.openingTitle),
      hireDate: clean(source.hireDate),
      firstInterviewDate: clean(source.firstInterviewDate),
      secondInterviewDate: clean(source.secondInterviewDate),
    }
    candidatesByOpening.set(key, [...(candidatesByOpening.get(key) || []), candidate])
  })
  const openings: Opening[] = []
  for (const source of payload.openings) {
    const project = clean(source.project)
    const title = clean(source.title)
    if (!project || !title) continue
    const id = await openingId(project, title)
    const key = openingKey(project, title)
    openings.push({
      id, title, project, url: '', postedAt: '', deadline: '', source: 'sheet', status: clean(source.status) === '완료' ? '완료' : clean(source.status) === '마감' ? '마감' : '진행중',
      targetTo: Math.max(0, Number(source.targetTo) || 0),
      toNumber: Math.max(0, Number(source.toNumber) || 0) || undefined,
      toGroup: clean(source.toGroup).replace(/\s+/g, ' '),
      hiredCount: Math.max(0, Number(payload.hiredCounts?.[key]) || 0),
      reason: clean(source.reason),
      approvalUrl: approvalLink(source.approvalUrl),
      isNew: previous !== null && !previousIds.has(id),
      candidates: candidatesByOpening.get(key) || [],
    })
  }
  openings.sort((a, b) => `${a.project}\u001f${a.title}`.localeCompare(`${b.project}\u001f${b.title}`, 'ko'))
  groupOpeningsByTo(openings)
  return {
    openings,
    candidateCount: openings.reduce((sum, opening) => sum + opening.candidates.length, 0),
    syncedAt: payload.syncedAt || new Date().toISOString(),
    sheetApiUrl: previous?.sheetApiUrl || '',
    projectTotals: Object.fromEntries(Object.entries(payload.projectTotals || {}).map(([project, total]) => [
      project.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR'),
      Math.max(0, Number(total) || 0),
    ])),
    projectTables: Object.fromEntries(Object.entries(payload.projectTables || {}).map(([project, table]): [string, ProjectTable] => [
      project.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR'),
      {
        totalTo: Math.max(0, Number(table.totalTo) || 0),
        rows: (table.rows || []).map(row => ({
          part: clean(row.part),
          count: Math.max(0, Number(row.count) || 0),
          members: Array.isArray(row.members) ? row.members.map(clean).filter(Boolean) : [],
        })).filter(row => row.part),
      },
    ])),
  }
}

export const api = {
  async dashboard(): Promise<DashboardData> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('동기화 데이터를 찾지 못했습니다. GitHub Actions를 먼저 실행해 주세요.')
    const body = await response.json() as DashboardData & { error?: string }
    if (!Array.isArray(body.openings)) throw new Error(body.error || '대시보드 데이터 형식이 올바르지 않습니다.')
    groupOpeningsByTo(body.openings)
    return body
  },

  async liveDashboard(previous: DashboardData | null): Promise<DashboardData> {
    const endpoint = previous?.sheetApiUrl?.trim() || ''
    return buildLiveDashboard(await readSheetJsonp(endpoint), previous)
  },
}
