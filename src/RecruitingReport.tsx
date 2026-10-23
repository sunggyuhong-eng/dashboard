import { Printer, X } from 'lucide-react'
import { groupOpeningsByProject, groupOpeningsByTo, totalTargetTo } from './headcount'
import { collectPipelineRows, PIPELINE_GROUPS } from './PipelineOverview'
import { collectOffers } from './OfferOverview'
import { offerDate } from './OfferOverview'
import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'

export type ProjectReport = {
  name: string
  openings: Opening[]
  targetTo: number
  candidateCount: number
}

export function buildProjectReports(openings: Opening[]): ProjectReport[] {
  return Array.from(groupOpeningsByProject(openings), ([name, projectOpenings]) => ({
    name,
    openings: projectOpenings,
    targetTo: totalTargetTo(projectOpenings),
    candidateCount: projectOpenings.reduce((total, opening) => total + opening.candidates.length, 0),
  }))
}

const dateText = (value: string) => value.replace(/-/g, '.')
const titleText = (value: string) => value.replace(/^\[[^\]]+\]\s*/, '').replace(/\s*모집\s*$/i, '').trim()

const stageNames: Record<PipelineStage, string> = {
  '온라인 과제': '온라인 과제',
  '코딩테스트': '코딩 테스트',
  '역량검사': '역량 검사',
  '면접': '면접 예정자',
  '1차 면접': '1차 면접',
  '2차 면접': '2차 면접',
  '면접합격': '면접 합격',
  '처우단계': '처우 협의',
  'Offer': '오퍼',
}

function openingStatus(opening: Opening) {
  if (!opening.candidates.length) return ['이력서 검토 중']
  return PIPELINE_STAGES.filter(stage => opening.candidates.some(candidate => candidate.stage === stage)).map(stage => {
    const candidates = opening.candidates.filter(candidate => candidate.stage === stage)
    if (stage === 'Offer') {
      const details = candidates.map(candidate => {
        const date = offerDate(candidate.hireDate)
        return date ? `${candidate.name} ${dateText(date)} 입사 예정` : `${candidate.name} 입사일 미정`
      })
      return `${stageNames[stage]} ${candidates.length}명 진행 중${details.length ? ` (${details.join(' · ')})` : ''}`
    }
    const suffix = stage === '면접' ? '명' : '명 진행 중'
    return `${stageNames[stage]} ${candidates.length}${suffix}`
  })
}

function reportAsOf(syncedAt: string) {
  const date = syncedAt ? new Date(syncedAt) : new Date()
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
  }).format(Number.isNaN(date.getTime()) ? new Date() : date)
}

function formatReportDate(syncedAt: string) {
  const date = syncedAt ? new Date(syncedAt) : new Date()
  if (Number.isNaN(date.getTime())) return 'recruiting-report'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  return `콩스튜디오_채용현황_${parts}`
}

function ProjectDetailPage({ project, pageNumber, openingNotes }: {
  project: ProjectReport
  pageNumber: number
  openingNotes: Map<string, string>
}) {
  const groups = groupOpeningsByTo(project.openings)
  return <section className="pdf-page pdf-project-page">
    <header className="pdf-page-heading"><div><span>PROJECT RECRUITING</span><h2>{project.name}</h2><p>프로젝트별 채용 계획과 진행 상황</p></div><b className="pdf-page-number">{String(pageNumber).padStart(2, '0')}</b></header>
    <div className="pdf-project-metrics"><div><small>목표 TO</small><b>{project.targetTo}<em>명</em></b></div><div><small>오픈 직무</small><b>{project.openings.length}<em>개</em></b></div><div><small>진행 지원자</small><b>{project.candidateCount}<em>명</em></b></div></div>
    <div className="pdf-project-groups">{groups.map(group => <section className="pdf-to-group" key={group.key}>
      <header className="pdf-group-heading"><span>채용 목표</span><b>{group.targetTo ? `${group.targetTo}명` : '미입력'}</b>{group.reasons.length === 1 && <small>{group.reasons[0]}</small>}</header>
      <div className="pdf-opening-list">{group.openings.map(opening => {
        const memo = openingNotes.get(opening.id)?.trim()
        const reason = group.reasons.length > 1 ? opening.reason.trim() : ''
        return <article className="pdf-opening-row" key={opening.id}>
          <div className="pdf-opening-main"><h3>{titleText(opening.title)}</h3>{reason && <small className="pdf-opening-reason">{reason}</small>}{memo && <small className="pdf-opening-memo">메모 · {memo}</small>}</div>
          <div className="pdf-opening-progress"><span>현재 진행</span><ul>{openingStatus(opening).map(status => <li key={status}>{status}</li>)}</ul></div>
        </article>
      })}</div>
    </section>)}</div>
    <footer className="pdf-page-footer"><span>KONG STUDIOS KOREA · 채용 진행 현황</span><span>{project.name} · {project.openings.length}개 직무</span></footer>
  </section>
}

export function RecruitingReport({ data, openingNotes, onClose }: {
  data: DashboardData
  openingNotes: Map<string, string>
  onClose: () => void
}) {
  const openings = data.openings.filter(opening => opening.status === '진행중')
  const projects = buildProjectReports(openings)
  const offers = collectOffers(openings)
  const stages = PIPELINE_GROUPS.map(group => ({ label: group.label, count: collectPipelineRows(openings, group.id).length }))
  const targetTo = projects.reduce((sum, project) => sum + project.targetTo, 0)
  const asOf = reportAsOf(data.syncedAt)
  const savePdf = () => {
    const originalTitle = document.title
    document.title = formatReportDate(data.syncedAt)
    window.print()
    document.title = originalTitle
  }

  return <div className="report-modal-backdrop" onMouseDown={onClose}>
    <section className="recruiting-report-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-report-title" onMouseDown={event => event.stopPropagation()}>
      <header className="report-modal-toolbar"><div><span>RECRUITING REPORT</span><h2 id="pdf-report-title">채용 진행 현황 PDF</h2><small>표지와 전체 요약, 프로젝트별 진행 현황</small></div><div><button type="button" className="primary" onClick={savePdf}><Printer size={16} /> PDF 저장</button><button type="button" className="report-close" aria-label="리포트 닫기" onClick={onClose}><X size={19} /></button></div></header>
      <div className="report-preview-pages">
        <section className="pdf-page pdf-cover-page">
          <img className="pdf-brand-logo" src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" />
          <div className="pdf-cover-copy"><span>RECRUITING STATUS REPORT · {asOf}</span><h1>채용 진행<br />현황 리포트</h1><p>전체 채용 요약과 프로젝트별 채용 진행 상황</p></div>
          <div className="pdf-cover-footer"><b>KONG STUDIOS KOREA</b><span>내부 채용 현황 · {asOf}</span></div>
          <i className="pdf-cover-glow" aria-hidden="true" />
        </section>
        <section className="pdf-page pdf-summary-page">
          <header className="pdf-page-heading"><div><span>RECRUITING OVERVIEW</span><h2>전체 채용 현황</h2><p>{asOf} 기준으로 확인한 오픈 공고와 진행 상황</p></div><b className="pdf-page-number">02</b></header>
          <div className="pdf-summary-metrics"><div><small>오픈 공고</small><b>{openings.length}<em>개</em></b></div><div><small>목표 TO</small><b>{targetTo}<em>명</em></b></div><div><small>진행 지원자</small><b>{openings.reduce((count, opening) => count + opening.candidates.length, 0)}<em>명</em></b></div></div>
          <section className="pdf-stage-summary"><header><div><span>PIPELINE</span><h3>주요 전형 진행 현황</h3></div><small>현재 전형 기준</small></header><div>{stages.map(stage => <article key={stage.label}><small>{stage.label}</small><b>{stage.count}<em>명</em></b></article>)}</div></section>
          <section className="pdf-offer-summary"><header><div><span>OFFER & JOINING</span><h3>오퍼 · 입사 예정</h3></div><b>{offers.length}<small>명</small></b></header>
            {offers.length ? <div className="pdf-offer-list">{offers.map(row => <article key={row.key}><div><b>{row.project}</b><span>{titleText(row.title)}</span></div><strong>{row.candidate.name || '이름 미입력'}</strong><time>{row.hireDate ? <><b>{dateText(row.hireDate)}</b><small>입사 예정</small></> : <small>입사일 미정</small>}</time></article>)}</div> : <p className="pdf-empty-offer">현재 진행 중인 오퍼가 없습니다.</p>}
          </section>
          <footer className="pdf-page-footer"><span>KONG STUDIOS KOREA · 채용 진행 현황</span><span>전체 요약</span></footer>
        </section>
        {projects.map((project, index) => <ProjectDetailPage key={project.name} project={project} pageNumber={index + 3} openingNotes={openingNotes} />)}
        {!projects.length && <section className="pdf-page pdf-project-page"><header className="pdf-page-heading"><div><span>PROJECT RECRUITING</span><h2>오픈 공고가 없습니다</h2></div><b className="pdf-page-number">03</b></header><footer className="pdf-page-footer"><span>KONG STUDIOS KOREA · 채용 진행 현황</span><span>프로젝트별 현황</span></footer></section>}
      </div>
      <p className="report-print-hint">PDF 저장을 누른 뒤 인쇄 창에서 <b>PDF로 저장</b>을 선택해 주세요.</p>
    </section>
  </div>
}
