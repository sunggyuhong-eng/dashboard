import { groupOpeningsByTo, projectName } from './headcount'
import { offerDate } from './OfferOverview'
import type { Opening } from './types'

export type CompletedToRow = {
  key: string
  project: string
  toNumbers: number[]
  titles: string[]
  name: string
  date: string
  status: '완료' | '진행중'
}

export function collectCompletedToRows(openings: Opening[]): CompletedToRow[] {
  const rows = new Map<string, CompletedToRow>()
  groupOpeningsByTo(openings).forEach(group => {
    const toNumbers = [...new Set(group.openings.map(opening => opening.toNumber).filter((number): number is number => !!number))].sort((a, b) => a - b)
    const groupStatus = group.openings.every(opening => opening.status === '완료') ? '완료' as const : '진행중' as const
    const hasNamedCompletion = group.openings.some(opening => !!opening.completedName?.trim())
    group.openings.forEach(opening => {
      const name = (opening.completedName || '').trim()
      if (!name && (opening.status !== '완료' || hasNamedCompletion)) return
      const date = offerDate(opening.completedDate)
      const key = JSON.stringify([group.key, name, date])
      const title = opening.title.replace(/^\[[^\]]+\]\s*/, '').trim()
      const row = rows.get(key) || {
        key, project: projectName(opening), toNumbers, titles: [], name,
        date, status: groupStatus,
      }
      if (!row.titles.includes(title)) row.titles.push(title)
      rows.set(key, row)
    })
  })
  return [...rows.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')
    || a.project.localeCompare(b.project, 'ko')
    || (a.toNumbers[0] ?? Number.MAX_SAFE_INTEGER) - (b.toNumbers[0] ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name, 'ko'))
}

export function CompletedToOverview({ openings }: { openings: Opening[] }) {
  const rows = collectCompletedToRows(openings)
  return <section className="completed-to-overview" aria-label="채용 완료 TO">
    <header><div><h2>채용 완료 TO</h2><p>채용 직무와 입사자, 공고 마감 날짜를 확인하세요.</p></div><b>{rows.length}건</b></header>
    {rows.length ? <div className="completed-to-list">
      <div className="completed-to-head"><span>프로젝트</span><span>채용 직무</span><span>입사자</span><span>공고 마감 날짜</span><span>TO 상태</span></div>
      {rows.map(row => <article className="completed-to-row" key={row.key}>
        <div data-label="프로젝트"><strong>{row.project}</strong></div>
        <div data-label="채용 직무"><span>{row.titles.join(' / ')}</span></div>
        <div data-label="입사자"><strong>{row.name || '입사자 미입력'}</strong></div>
        <div data-label="공고 마감 날짜"><time dateTime={row.date || undefined}>{row.date ? row.date.replace(/-/g, '.') : '날짜 미입력'}</time></div>
        <div data-label="TO 상태"><span className={`completed-to-status ${row.status === '완료' ? 'done' : 'partial'}`}>{row.status === '완료' ? '완료' : '진행중'}</span></div>
      </article>)}
    </div> : <div className="completed-to-empty">채용 완료 기록이 없습니다.</div>}
  </section>
}
