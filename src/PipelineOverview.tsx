import { useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, UsersRound } from 'lucide-react'
import { groupOpeningsByProject, groupOpeningsByTo, projectName, totalTargetTo } from './headcount'
import { offerDate } from './OfferOverview'
import type { Candidate, CompletedHire, Opening, PipelineStage } from './types'

export const PIPELINE_GROUPS = [
  { id: 'task', label: '온라인 과제', stages: ['온라인 과제'] },
  { id: 'coding', label: '코딩 테스트', stages: ['코딩테스트'] },
  { id: 'interview', label: '면접', stages: ['면접', '1차 면접', '2차 면접', '면접합격'] },
  { id: 'salary', label: '처우 협의', stages: ['처우단계'] },
  { id: 'offer', label: '오퍼', stages: ['Offer'] },
] as const

export type PipelineGroupId = typeof PIPELINE_GROUPS[number]['id']
export type PipelineRow = {
  key: string
  openingId: string
  project: string
  title: string
  reason: string
  candidate: Candidate
  dates: { label: string; value: string }[]
}

type OperationsView = 'openings' | 'hires' | 'completed'
function todayDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function thisWeekMonday(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return todayDateString(monday)
}

const stageLabel: Record<PipelineStage, string> = {
  '온라인 과제': '온라인 과제', '코딩테스트': '코딩 테스트', '역량검사': '역량 검사',
  '면접': '면접', '1차 면접': '1차 면접', '2차 면접': '2차 면접',
  '면접합격': '면접 합격', '처우단계': '처우 협의', 'Offer': '오퍼',
}

function candidateDates(candidate: Candidate): PipelineRow['dates'] {
  const pairs = candidate.stage === 'Offer' ? [['입사 예정', candidate.hireDate]]
    : candidate.stage === '1차 면접' ? [['1차 면접', candidate.firstInterviewDate]]
    : candidate.stage === '2차 면접' ? [['2차 면접', candidate.secondInterviewDate]]
    : candidate.stage === '면접' ? [['1차 면접', candidate.firstInterviewDate], ['2차 면접', candidate.secondInterviewDate]]
    : []
  return pairs.flatMap(([label, raw]) => {
    const value = offerDate(raw)
    return value ? [{ label: label!, value }] : []
  })
}

export function collectPipelineRows(openings: Opening[], groupId: PipelineGroupId): PipelineRow[] {
  const group = PIPELINE_GROUPS.find(item => item.id === groupId)!
  return openings.filter(opening => opening.status === '진행중').flatMap(opening =>
  opening.candidates.filter(candidate => candidate.stage !== 'Hired' && (group.stages as readonly PipelineStage[]).includes(candidate.stage)).map((candidate, index) => ({
      key: `${opening.id}:${candidate.id}:${index}`,
      openingId: opening.id,
      project: projectName(opening),
      title: opening.title.replace(/^\[[^\]]+\]\s*/, '').trim(),
      reason: opening.reason || '',
      candidate,
      dates: candidateDates(candidate),
    })),
  ).sort((a, b) => (groupId === 'offer' ? (a.dates[0]?.value || '9999-12-31').localeCompare(b.dates[0]?.value || '9999-12-31') : 0)
    || a.project.localeCompare(b.project, 'ko')
    || a.title.localeCompare(b.title, 'ko')
    || a.candidate.name.localeCompare(b.candidate.name, 'ko'))
}

function roleName(opening: Opening) {
  const project = projectName(opening)
  const escapedProject = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return opening.title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(new RegExp(`^${escapedProject}\\s*[-–|:]?\\s*`, 'i'), '')
    .replace(/\s*모집\s*$/i, '')
    .trim() || opening.title
}

function sortProjectEntries<T>(entries: [string, T][]) {
  const order = ['ART실', 'GDTS', 'OTPS', 'MAZE', 'HERO', 'ZERO', 'QA', 'SERVER', 'KONG']
  return [...entries].sort(([a], [b]) => {
    const key = (value: string) => value.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR')
    const ai = order.indexOf(key(a))
    const bi = order.indexOf(key(b))
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.localeCompare(b, 'ko')
  })
}

function ProjectSection({ project, countLabel, children, defaultOpen = false }: {
  project: string
  countLabel?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return <details className={`operations-project ${countLabel ? 'has-count' : ''}`} open={defaultOpen}>
    <summary>{countLabel && <span className="operations-project-count">{countLabel}</span>}<strong>{project}</strong><ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="operations-project-content">{children}</div>
  </details>
}

function OpeningProgress({ opening }: { opening: Opening }) {
  const stageCounts = new Map<PipelineStage, number>()
  opening.candidates.filter((candidate): candidate is Candidate & { stage: PipelineStage } => candidate.stage !== 'Hired').forEach(candidate => stageCounts.set(candidate.stage, (stageCounts.get(candidate.stage) || 0) + 1))
  const entries = [...stageCounts.entries()]
  return <div className="operations-progress">
    <span className="operations-field-label">진행 단계</span>
    <div className="operations-stage-list">{entries.length ? entries.map(([stage, count]) => <span className="operations-stage-chip" key={stage}><i aria-hidden="true" /><span>{stageLabel[stage]}</span><b>{count}명</b></span>) : <span className="operations-no-stage">진행 중인 지원자 없음</span>}</div>
  </div>
}

function OpeningGroups({ openings }: { openings: Opening[] }) {
  const groups = groupOpeningsByTo(openings)
  return groups.length ? <div className="operations-to-list">{groups.map(group => <section className="operations-to-group" key={group.key}>
    <header><span>{group.shared ? '공유 TO' : '채용 중 TO'}</span>{group.targetTo > 0 && <b>목표 {group.targetTo}명</b>}</header>
    {group.openings.map(opening => <article className="operations-opening" key={opening.id}>
      <div className="operations-opening-main">
        <span className="operations-field-label">채용 직무</span>
        <h4>{roleName(opening)}</h4>
        <p><strong>채용 사유</strong><span>{opening.reason || '채용 사유 미입력'}</span></p>
        {opening.approvalUrl && <a href={opening.approvalUrl} target="_blank" rel="noreferrer">채용승인신청서</a>}
      </div>
      <OpeningProgress opening={opening} />
    </article>)}
  </section>)}</div> : <div className="operations-empty"><UsersRound size={23} /><b>현재 채용 중인 TO가 없습니다.</b></div>
}

function PlannedHireList({ openings }: { openings: Opening[] }) {
  const today = todayDateString()
  const rows = openings.flatMap(opening => opening.candidates.flatMap(candidate => {
    const date = offerDate(candidate.offerDate)
    if (opening.status !== '진행중' || candidate.stage !== 'Offer' || (date && date <= today)) return []
    return [{ opening, candidate, date }]
  })).sort((a, b) => {
    return (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')
  })
  return rows.length ? <div className="operations-hires-list">
    <div className="operations-hires-heading"><b>입사 예정 {rows.length}명</b></div>
    <div className="operations-hire-table-head"><span>프로젝트</span><span>입사자</span><span>채용 직무</span><span>채용 사유</span><span>입사 예정 날짜</span></div>
    {rows.map(({ opening, candidate, date }) => <article className="operations-hire-row" key={`${opening.id}:${candidate.id}`}>
      <div><strong>{projectName(opening)}</strong></div>
      <div><strong>{candidate.name || '이름 미입력'}</strong></div>
      <div><strong>{roleName(opening)}</strong></div>
      <div><span>{opening.reason || '채용 사유 미입력'}</span></div>
      <div className="operations-hire-date"><strong>{date ? date.replace(/-/g, '.') : '일정 미정'}</strong></div>
    </article>)}
  </div> : <div className="operations-empty"><CalendarDays size={23} /><b>현재 입사 예정자가 없습니다.</b></div>
}

function CompletedToList({ completedHires }: { completedHires: CompletedHire[] }) {
  const rows = [...completedHires].sort((a, b) => (offerDate(b.hireDate) || '').localeCompare(offerDate(a.hireDate) || '')
    || a.name.localeCompare(b.name, 'ko'))
  return rows.length ? <div className="operations-completed-list">
    <div className="operations-hires-heading"><b>입사 완료 {rows.length}명</b></div>
    <div className="operations-completed-table-head"><span>이름</span><span>소속</span><span>팀</span><span>Title</span><span>계약형태</span><span>입사날짜</span></div>
    {rows.map((hire, index) => <article className="operations-completed-row" key={`${hire.name}:${hire.hireDate}:${index}`}>
      <div><strong>{hire.name}</strong></div>
      <div><strong>{hire.organization || '—'}</strong></div>
      <div><span>{hire.team || '—'}</span></div>
      <div><strong>{hire.title || '—'}</strong></div>
      <div><span>{hire.employmentType || '—'}</span></div>
      <div className="operations-completed-date"><strong>{offerDate(hire.hireDate).replace(/-/g, '.') || '날짜 미입력'}</strong></div>
    </article>)}
  </div> : <div className="operations-empty"><CalendarDays size={23} /><b>입사 완료자가 없습니다.</b></div>
}

export function PipelineOverview({ openings, completedHires = [], initialView = 'openings' }: { openings: Opening[]; completedHires?: CompletedHire[]; initialView?: OperationsView }) {
  const [view, setView] = useState<OperationsView>(initialView)
  const active = openings.filter(opening => opening.status === '진행중')
  const byProject = sortProjectEntries([...groupOpeningsByProject(active).entries()])
  const projectSections = byProject.map(([project, projectOpenings]) => ({ project, openings: projectOpenings, targetTo: totalTargetTo(projectOpenings) }))
  const today = todayDateString()
  const plannedHireCount = active.reduce((sum, opening) => sum + opening.candidates.filter(candidate => {
    const date = offerDate(candidate.offerDate)
    return candidate.stage === 'Offer' && (!date || date > today)
  }).length, 0)
  const activeToCount = totalTargetTo(active)
  const monday = thisWeekMonday()
  const mondayHireCount = completedHires.filter(hire => offerDate(hire.hireDate) === monday).length

  return <section className="pipeline-overview" aria-label="프로젝트별 채용 운영">
    <div className="operations-view-tabs" role="tablist" aria-label="채용 운영 화면 선택">
      <button type="button" role="tab" id="operations-tab-openings" aria-selected={view === 'openings'} aria-controls="operations-panel" onClick={() => setView('openings')}>
        <span>채용 진행 TO</span><b>{activeToCount}명</b>
      </button>
      <button type="button" role="tab" id="operations-tab-hires" aria-selected={view === 'hires'} aria-controls="operations-panel" onClick={() => setView('hires')}>
        <span>입사 예정자</span><b>{plannedHireCount}명</b>
      </button>
      <button type="button" role="tab" id="operations-tab-completed" aria-selected={view === 'completed'} aria-controls="operations-panel" onClick={() => setView('completed')}>
        <span>입사 완료자</span><b>이번 주 월요일 {mondayHireCount}명</b>
      </button>
    </div>
    <div className={`operations-panel view-${view}`} id="operations-panel" role="tabpanel" aria-labelledby={`operations-tab-${view}`}>
      {view === 'openings' ? projectSections.length ? <div className="operations-project-list">{projectSections.map(({ project, openings: projectOpenings, targetTo }, index) => <ProjectSection key={project} project={project} countLabel={`채용중 TO ${targetTo}명`} defaultOpen={index === 0}>
        <OpeningGroups openings={projectOpenings} />
      </ProjectSection>)}</div> : <div className="operations-empty"><UsersRound size={23} /><b>현재 진행 중인 채용 TO가 없습니다.</b></div>
      : view === 'hires' ? <PlannedHireList openings={openings} /> : <CompletedToList completedHires={completedHires} />}
    </div>
  </section>
}
