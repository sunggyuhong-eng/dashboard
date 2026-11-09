import { CalendarDays, UsersRound } from 'lucide-react'
import { groupOpeningsByTo, projectName } from './headcount'
import { offerDate } from './OfferOverview'
import type { Candidate, Opening, PipelineStage } from './types'

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

function todayDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function collectPlannedHires(openings: Opening[], today = todayDateString()) {
  return openings.flatMap(opening => opening.candidates.flatMap(candidate => {
    const date = offerDate(candidate.offerDate)
    if (opening.status !== '진행중' || candidate.stage !== 'Offer' || (date && date <= today)) return []
    return [{ opening, candidate, date }]
  })).sort((a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')
    || projectName(a.opening).localeCompare(projectName(b.opening), 'ko')
    || a.candidate.name.localeCompare(b.candidate.name, 'ko'))
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

function OpeningProgress({ opening }: { opening: Opening }) {
  const stageCounts = new Map<PipelineStage, number>()
  opening.candidates.filter((candidate): candidate is Candidate & { stage: PipelineStage } => candidate.stage !== 'Hired').forEach(candidate => stageCounts.set(candidate.stage, (stageCounts.get(candidate.stage) || 0) + 1))
  const entries = [...stageCounts.entries()]
  return <div className="operations-progress">
    <span className="operations-field-label">진행 단계</span>
    <div className="operations-stage-list">{entries.length ? entries.map(([stage, count]) => <span className={`operations-stage-chip ${stage === 'Offer' ? 'offer' : ''}`} key={stage}><i aria-hidden="true" /><span>{stageLabel[stage]}</span><b>{count}명</b></span>) : <span className="operations-no-stage">진행 중인 지원자 없음</span>}</div>
  </div>
}

export function ProjectOpeningProgress({ openings }: { openings: Opening[] }) {
  const groups = groupOpeningsByTo(openings)
  return groups.length ? <div className="operations-to-list">{groups.map(group => <section className="operations-to-group" key={group.key}>
    <header><span>{group.shared ? '공유 TO' : '채용 중 TO'}</span>{group.targetTo > 0 && <b>목표 {group.targetTo}명</b>}</header>
    {group.openings.map(opening => <article className="operations-opening" key={opening.id}>
      <div className="operations-opening-main">
        <span className="operations-field-label">채용 직무</span>
        <h4>{roleName(opening)}</h4>
        {opening.reason?.length > 60
          ? <details className="operations-reason expanded"><summary><strong>채용 사유</strong><span>{opening.reason.slice(0, 60).trim()}… <b>더 보기</b></span></summary><p>{opening.reason}</p></details>
          : <p className="operations-reason"><strong>채용 사유</strong><span>{opening.reason || '채용 사유 미입력'}</span></p>}
        {opening.approvalUrl && <a href={opening.approvalUrl} target="_blank" rel="noreferrer">채용승인신청서</a>}
      </div>
      <OpeningProgress opening={opening} />
    </article>)}
  </section>)}</div> : <div className="operations-empty"><UsersRound size={23} /><b>현재 채용 중인 TO가 없습니다.</b></div>
}

function PlannedHireList({ openings }: { openings: Opening[] }) {
  const rows = collectPlannedHires(openings)
  return rows.length ? <div className="operations-hires-list">
    <div className="operations-hires-heading"><b>입사 예정 {rows.length}명</b></div>
    <div className="operations-hire-table-head"><span>프로젝트</span><span>입사자</span><span>채용 직무</span><span>채용 사유</span><span>입사 예정 날짜</span></div>
    {rows.map(({ opening, candidate, date }) => <article className="operations-hire-row" key={`${opening.id}:${candidate.id}`}>
      <div data-label="프로젝트"><strong>{projectName(opening)}</strong></div>
      <div data-label="입사자"><strong>{candidate.name || '이름 미입력'}</strong></div>
      <div data-label="채용 직무"><strong>{roleName(opening)}</strong></div>
      <div data-label="채용 사유"><span>{opening.reason || '채용 사유 미입력'}</span></div>
      <div className="operations-hire-date" data-label="입사 예정 날짜"><strong>{date ? date.replace(/-/g, '.') : '일정 미정'}</strong></div>
    </article>)}
  </div> : <div className="operations-empty"><CalendarDays size={23} /><b>현재 입사 예정자가 없습니다.</b></div>
}

export function PipelineOverview({ openings }: { openings: Opening[] }) {
  return <section className="pipeline-overview" aria-label="입사 예정자 목록"><PlannedHireList openings={openings} /></section>
}
