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

export function previousMondayInSeoul(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) - 7)
  return date.toISOString().slice(0, 10)
}

export function collectPreviousMondayCompletedToRows(openings: Opening[], now = new Date()): CompletedToRow[] {
  const previousMonday = previousMondayInSeoul(now)
  return collectCompletedToRows(openings.filter(opening => opening.status === '완료'
    && !!opening.completedName?.trim() && offerDate(opening.completedDate) === previousMonday))
}

export function CompletedToOverview({ openings, now }: { openings: Opening[]; now?: Date }) {
  const previousMonday = previousMondayInSeoul(now)
  const rows = collectPreviousMondayCompletedToRows(openings, now)
  return <section className="completed-to-overview" aria-label="채용 완료 TO">
    <header><div><h2>채용 완료 TO</h2><p>{previousMonday.replace(/-/g, '.')} 완료 · 입사자와 공고 마감 날짜를 확인하세요.</p></div><b>{rows.length}명</b></header>
    {rows.length ? <div className="completed-to-list">
      <div className="completed-to-head"><span>프로젝트</span><span>채용 직무</span><span>입사자</span><span>공고 마감 날짜</span></div>
      {rows.map(row => <article className="completed-to-row" key={row.key}>
        <div data-label="프로젝트"><strong>{row.project}</strong></div>
        <div data-label="채용 직무"><span>{row.titles.join(' / ')}</span></div>
        <div data-label="입사자"><strong>{row.name}</strong></div>
        <div data-label="공고 마감 날짜"><time dateTime={row.date}>{row.date.replace(/-/g, '.')}</time></div>
      </article>)}
    </div> : <div className="completed-to-empty">{previousMonday.replace(/-/g, '.')}에 완료된 채용이 없습니다.</div>}
  </section>
}
