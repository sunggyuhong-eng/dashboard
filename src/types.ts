export const PIPELINE_STAGES = [
  '온라인 과제', '코딩테스트', '역량검사', '면접', '1차 면접',
  '2차 면접', '면접합격', '처우단계', 'Offer', 'Hired',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export type Candidate = {
  id: string
  row: number
  name: string
  stage: PipelineStage
  project: string
  openingTitle: string
  hireDate?: string
  offerDate?: string
  firstInterviewDate?: string
  secondInterviewDate?: string
}

export type Opening = {
  id: string
  title: string
  project: string
  url: string
  postedAt: string
  deadline: string
  status: '진행중' | '완료' | '마감'
  targetTo: number
  toNumber?: number
  toGroup?: string
  hiredCount: number
  reason: string
  approvalUrl?: string
  source: 'sheet'
  isNew: boolean
  candidates: Candidate[]
}

export type ProjectTableSlot = {
  toNumber?: number
  toNumbers?: number[]
  person?: string
  status?: string
}

export type ProjectTableRow = {
  part: string
  count: number
  slots: ProjectTableSlot[]
}

export type ProjectTable = {
  totalTo: number
  rows: ProjectTableRow[]
}

export type DashboardData = {
  openings: Opening[]
  syncedAt: string
  candidateCount: number
  sheetApiUrl?: string
  projectTotals?: Record<string, number>
  projectTables?: Record<string, ProjectTable>
}
