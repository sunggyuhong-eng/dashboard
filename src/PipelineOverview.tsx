import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight, UsersRound } from 'lucide-react'
import { projectName } from './headcount'
import { offerDate } from './OfferOverview'
import type { Candidate, Opening, PipelineStage } from './types'

export const PIPELINE_GROUPS = [
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
  candidate: Candidate
  dates: { label: string; value: string }[]
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
    opening.candidates.filter(candidate => (group.stages as readonly PipelineStage[]).includes(candidate.stage)).map((candidate, index) => ({
      key: `${opening.id}:${candidate.id}:${index}`,
      openingId: opening.id,
      project: projectName(opening),
      title: opening.title.replace(/^\[[^\]]+\]\s*/, '').trim(),
      candidate,
      dates: candidateDates(candidate),
    })),
  ).sort((a, b) => (groupId === 'offer' ? (a.dates[0]?.value || '9999-12-31').localeCompare(b.dates[0]?.value || '9999-12-31') : 0)
    || a.project.localeCompare(b.project, 'ko')
    || a.title.localeCompare(b.title, 'ko')
    || a.candidate.name.localeCompare(b.candidate.name, 'ko'))
}

export function PipelineOverview({ openings, onSelectOpening }: {
  openings: Opening[]
  onSelectOpening?: (id: string) => void
}) {
  const [selected, setSelected] = useState<PipelineGroupId>('offer')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const scroll = useRef<HTMLDivElement>(null)
  const groups = PIPELINE_GROUPS.map(group => ({ ...group, rows: collectPipelineRows(openings, group.id) }))
  const current = groups.find(group => group.id === selected)!
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0 }, [selected])
  const switchWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % groups.length
    else if (event.key === 'ArrowLeft') next = (index + groups.length - 1) % groups.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = groups.length - 1
    else return
    event.preventDefault()
    setSelected(groups[next].id)
    buttons.current[next]?.focus()
  }
  const hasSchedule = selected === 'offer' || selected === 'interview'
  return <section className="pipeline-overview" aria-label="전형별 지원자">
    <div className="pipeline-tabs" role="tablist" aria-label="진행 전형 선택">
      {groups.map((group, index) => <button key={group.id} type="button" role="tab" id={`pipeline-tab-${group.id}`}
        aria-selected={selected === group.id} aria-controls="pipeline-candidate-list" tabIndex={selected === group.id ? 0 : -1}
        ref={element => { buttons.current[index] = element }} onClick={() => setSelected(group.id)} onKeyDown={event => switchWithKeyboard(event, index)}>
        <span>{group.label}</span><b>{group.rows.length}<small>명</small></b>
      </button>)}
    </div>
    <div className="pipeline-list-panel" id="pipeline-candidate-list" role="tabpanel" aria-labelledby={`pipeline-tab-${selected}`} tabIndex={0}>
      <header className="pipeline-list-heading"><h3>{current.label} 지원자 <span>{current.rows.length}명</span></h3><small>{selected === 'offer' ? '입사 예정일 순' : '프로젝트 · 직무 순'}</small></header>
      {current.rows.length ? <div className="pipeline-list-scroll" ref={scroll} tabIndex={0} role="region" aria-label={`${current.label} 지원자 목록`}>
        <table className="pipeline-candidate-table">
          <colgroup><col className="pipeline-project-col" /><col /><col className="pipeline-name-col" /><col className="pipeline-stage-col" />{hasSchedule && <col className="pipeline-date-col" />}</colgroup>
          <thead><tr><th scope="col">프로젝트</th><th scope="col">채용 직무</th><th scope="col">지원자</th><th scope="col">현재 단계</th>{hasSchedule && <th scope="col">{selected === 'offer' ? '입사 예정일' : '면접 일정'}</th>}</tr></thead>
          <tbody>{current.rows.map(row => <tr key={row.key}>
            <td className="pipeline-project">{row.project}</td>
            <td>{onSelectOpening ? <button type="button" className="pipeline-opening-link" onClick={() => onSelectOpening(row.openingId)} aria-label={`${row.project} ${row.title} 공고 보기`}><span>{row.title}</span><ChevronRight size={14} /></button> : <span className="pipeline-opening-title">{row.title}</span>}</td>
            <td className="pipeline-candidate-name">{row.candidate.name || '이름 미입력'}</td>
            <td><span className="pipeline-stage-label">{stageLabel[row.candidate.stage]}</span></td>
            {hasSchedule && <td className="pipeline-schedule">{row.dates.length ? row.dates.map(date => <time key={date.label} dateTime={date.value} className={selected === 'offer' ? 'pipeline-hire-date' : ''}>{date.value.replace(/-/g, '.')}<small>{date.label}</small></time>) : <span className="pipeline-date-pending">{selected === 'offer' ? '입사일 미정' : row.candidate.stage === '면접합격' ? '—' : '일정 미정'}</span>}</td>}
          </tr>)}</tbody>
        </table>
      </div> : <div className="pipeline-empty"><UsersRound size={25} /><b>{current.label} 진행 중인 지원자가 없습니다.</b></div>}
    </div>
  </section>
}
