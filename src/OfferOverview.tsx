import { CalendarDays, ChevronRight } from 'lucide-react'
import { projectName } from './headcount'
import type { Candidate, Opening } from './types'

export type OfferRow = {
  key: string
  openingId: string
  project: string
  title: string
  candidate: Candidate
  hireDate: string
}

// Use the supplied year. Never infer an arrival date or mark an offer as hired.
export function offerDate(value?: string): string {
  const text = String(value ?? '').normalize('NFKC').trim()
  const match = text.match(/^(\d{4})(\d{2})(\d{2})$/)
    || text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?=$|[^\d])/)
  if (!match) return ''
  const [, y, m, d] = match
  const year = Number(y), month = Number(m), day = Number(d)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function collectOffers(openings: Opening[]): OfferRow[] {
  return openings.filter(opening => opening.status === '진행중').flatMap(opening =>
    opening.candidates.filter(candidate => candidate.stage === 'Offer').map((candidate, index) => ({
      key: `${opening.id}:${candidate.id}:${index}`,
      openingId: opening.id,
      project: projectName(opening),
      title: opening.title.replace(/^\[[^\]]+\]\s*/, '').trim(),
      candidate,
      hireDate: offerDate(candidate.hireDate),
    })),
  ).sort((a, b) => (a.hireDate || '9999-12-31').localeCompare(b.hireDate || '9999-12-31')
    || a.project.localeCompare(b.project, 'ko')
    || a.title.localeCompare(b.title, 'ko')
    || a.candidate.name.localeCompare(b.candidate.name, 'ko'))
}

export function OfferOverview({ openings, onSelectOpening }: {
  openings: Opening[]
  onSelectOpening?: (id: string) => void
}) {
  const rows = collectOffers(openings)
  return <section className="offer-overview" aria-labelledby="offer-overview-title">
    <header className="offer-overview-heading">
      <div><span className="offer-section-label"><CalendarDays size={15} /> 오퍼 진행 현황</span><h3 id="offer-overview-title">오퍼 · 입사 예정</h3></div>
      <b className="offer-total">{rows.length}<small>명</small></b>
    </header>
    {rows.length ? <>
      <div className="offer-list-meta"><span>프로젝트와 직무별 입사 일정</span><small>입사 예정일 순</small></div>
      <div className="offer-list-scroll" role="region" aria-label="오퍼 지원자 목록" tabIndex={0}>
        <table className="offer-table">
          <colgroup><col className="offer-role-column" /><col className="offer-name-column" /><col className="offer-date-column" /></colgroup>
          <thead><tr><th scope="col">프로젝트 · 직무</th><th scope="col">지원자</th><th scope="col">입사 예정일</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.key}>
            <td><span className="offer-project">{row.project}</span>{onSelectOpening
              ? <button type="button" className="offer-opening-link" onClick={() => onSelectOpening(row.openingId)} aria-label={`${row.project} ${row.title} 공고 보기`}><span>{row.title}</span><ChevronRight size={14} /></button>
              : <span className="offer-opening-title">{row.title}</span>}</td>
            <td className="offer-candidate-name">{row.candidate.name || '이름 미입력'}</td>
            <td>{row.hireDate
              ? <time className="offer-hire-date" dateTime={row.hireDate}>{row.hireDate.replace(/-/g, '.')}<small>입사 예정</small></time>
              : <span className="offer-date-pending">입사일 미정</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : <div className="offer-empty"><CalendarDays size={24} /><b>진행 중인 오퍼가 없습니다.</b><span>오퍼 단계로 변경되면 이곳에 표시됩니다.</span></div>}
  </section>
}
