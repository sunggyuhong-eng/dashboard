import { useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, UsersRound } from 'lucide-react'
import { groupOpeningsByProject, groupOpeningsByTo, projectName } from './headcount'
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

type OperationsView = 'openings' | 'hires'

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
    opening.candidates.filter(candidate => (group.stages as readonly PipelineStage[]).includes(candidate.stage)).map((candidate, index) => ({
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
  countLabel: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return <details className="operations-project" open={defaultOpen}>
    <summary><strong>{project}</strong><span>{countLabel}</span><ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="operations-project-content">{children}</div>
  </details>
}

function OpeningProgress({ opening }: { opening: Opening }) {
  const stageCounts = new Map<PipelineStage, number>()
  opening.candidates.forEach(candidate => stageCounts.set(candidate.stage, (stageCounts.get(candidate.stage) || 0) + 1))
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
        <h4>{roleName(opening)}</h4>
        <p><strong>채용 사유</strong><span>{opening.reason || '채용 사유 미입력'}</span></p>
        {opening.approvalUrl && <a href={opening.approvalUrl} target="_blank" rel="noreferrer">채용승인신청서</a>}
      </div>
      <OpeningProgress opening={opening} />
    </article>)}
  </section>)}</div> : <div className="operations-empty"><UsersRound size={23} /><b>현재 채용 중인 TO가 없습니다.</b></div>
}

function PlannedHireList({ openings }: { openings: Opening[] }) {
  const projectMap = new Map<string, { opening: Opening; candidate: Candidate; date: string }[]>()
  openings.filter(opening => opening.status === '진행중').forEach(opening => {
    opening.candidates.filter(candidate => candidate.stage === 'Offer').forEach(candidate => {
      const project = projectName(opening)
      const list = projectMap.get(project) || []
      list.push({ opening, candidate, date: offerDate(candidate.hireDate) })
      projectMap.set(project, list)
    })
  })
  const projects = sortProjectEntries([...projectMap.entries()])
  return projects.length ? <div className="operations-project-list">{projects.map(([project, rows], index) => <ProjectSection key={project} project={project} countLabel={`입사 예정 ${rows.length}명`} defaultOpen={index === 0}>
    <div className="operations-hires-list">{rows.sort((a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')).map(({ opening, candidate, date }, rowIndex) => <article className="operations-hire-row" key={`${opening.id}:${candidate.id}:${rowIndex}`}>
      <div><span className="operations-field-label">채용 직무</span><strong>{roleName(opening)}</strong></div>
      <div><span className="operations-field-label">채용 사유</span><span>{opening.reason || '채용 사유 미입력'}</span></div>
      <div><span className="operations-field-label">입사 예정자</span><strong>{candidate.name || '이름 미입력'}</strong></div>
      <div className="operations-hire-date"><span className="operations-field-label"><CalendarDays size={14} /> 입사 예정일</span><strong>{date ? date.replace(/-/g, '.') : '일정 미정'}</strong></div>
    </article>)}</div>
  </ProjectSection>)}</div> : <div className="operations-empty"><CalendarDays size={23} /><b>현재 입사 예정자가 없습니다.</b></div>
}

export function PipelineOverview({ openings, initialView = 'openings' }: { openings: Opening[]; initialView?: OperationsView }) {
  const [view, setView] = useState<OperationsView>(initialView)
  const active = openings.filter(opening => opening.status === '진행중')
  const byProject = sortProjectEntries([...groupOpeningsByProject(active).entries()])
  const projectSections = byProject.map(([project, projectOpenings]) => ({ project, openings: projectOpenings, toCount: groupOpeningsByTo(projectOpenings).length }))
  const plannedHireCount = active.reduce((sum, opening) => sum + opening.candidates.filter(candidate => candidate.stage === 'Offer').length, 0)
  const activeToCount = projectSections.reduce((sum, section) => sum + section.toCount, 0)

  return <section className="pipeline-overview" aria-label="프로젝트별 채용 운영">
    <div className="operations-view-tabs" role="tablist" aria-label="채용 운영 화면 선택">
      <button type="button" role="tab" id="operations-tab-openings" aria-selected={view === 'openings'} aria-controls="operations-panel" onClick={() => setView('openings')}>
        <span>채용 진행 TO</span><b>{activeToCount}개</b>
      </button>
      <button type="button" role="tab" id="operations-tab-hires" aria-selected={view === 'hires'} aria-controls="operations-panel" onClick={() => setView('hires')}>
        <span>입사 예정자</span><b>{plannedHireCount}명</b>
      </button>
    </div>
    <div className="operations-panel" id="operations-panel" role="tabpanel" aria-labelledby={view === 'openings' ? 'operations-tab-openings' : 'operations-tab-hires'}>
      {view === 'openings' ? projectSections.length ? <div className="operations-project-list">{projectSections.map(({ project, openings: projectOpenings, toCount }, index) => <ProjectSection key={project} project={project} countLabel={`채용중 TO ${toCount}개`} defaultOpen={index === 0}>
        <OpeningGroups openings={projectOpenings} />
      </ProjectSection>)}</div> : <div className="operations-empty"><UsersRound size={23} /><b>현재 진행 중인 채용 TO가 없습니다.</b></div>
      : <PlannedHireList openings={active} />}
    </div>
  </section>
}
