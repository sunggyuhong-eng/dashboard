import { UsersRound } from 'lucide-react'
import { groupOpeningsByTo, projectName, toProgressAnchor } from './headcount'
import { offerDate } from './OfferOverview'
import type { Candidate, Opening, PipelineStage } from './types'

export const PIPELINE_GROUPS = [
  { id: 'assessment', label: '온라인 과제 · 코딩 테스트', stages: ['온라인 과제', '코딩테스트', '역량검사'] },
  { id: 'interview', label: '면접 · 1차 · 2차', stages: ['면접', '1차 면접', '2차 면접'] },
  { id: 'decision', label: '면접 합격 · 처우 협의', stages: ['면접합격', '처우단계'] },
  { id: 'offer', label: '입사 예정 · Offer', stages: ['Offer'] },
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
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function collectPlannedHires(openings: Opening[], today = todayDateString()) {
  return openings.flatMap(opening => opening.candidates.flatMap(candidate => {
    const date = offerDate(candidate.offerDate || candidate.hireDate)
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
  const pairs = candidate.stage === 'Offer' ? [['입사 예정', candidate.offerDate || candidate.hireDate]]
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
  return groups.length ? <div className="operations-to-list">{groups.map(group => <section className="operations-to-group" id={toProgressAnchor(group)} key={group.key}>
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

export function PipelineOverview({ openings }: { openings: Opening[] }) {
  return <section className="pipeline-overview grouped-pipeline" aria-label="진행 단계별 지원자 목록">
    {PIPELINE_GROUPS.map(group => {
      const rows = collectPipelineRows(openings, group.id).filter(row => group.id !== 'offer' || !offerDate(row.candidate.offerDate || row.candidate.hireDate) || offerDate(row.candidate.offerDate || row.candidate.hireDate) > todayDateString())
      return <article className="pipeline-group-card" key={group.id}>
        <header><h3>{group.label}</h3><b>{rows.length}명</b></header>
        <div className="pipeline-group-rows">{rows.length ? rows.map(row => <div className="pipeline-person-row" key={row.key}>
          <div><strong>{row.candidate.name || '이름 미입력'}</strong><span className="pipeline-person-stage">{stageLabel[row.candidate.stage as PipelineStage]}</span></div>
          <p><b>{row.project}</b><span>{row.title}</span></p>
          {group.id === 'offer' && <small>입사 예정 날짜 <b>{row.dates[0]?.value?.replace(/-/g, '.') || '일정 미정'}</b></small>}
        </div>) : <p className="pipeline-group-empty">현재 해당 단계의 지원자가 없습니다.</p>}</div>
      </article>
    })}
  </section>
}
