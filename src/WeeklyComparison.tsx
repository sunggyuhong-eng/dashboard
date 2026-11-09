import { groupOpeningsByTo, projectName } from './headcount'
import { offerDate } from './OfferOverview'
import type { DashboardData, Opening, WeeklySnapshot } from './types'

const displayProject = (project: string) => project === 'ART실' ? 'Art실' : project
const projectKey = (project: string) => project.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR')

export function mondayInSeoul(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0, 10)
}

function shiftWeek(week: string, days: number) {
  const date = new Date(`${week}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function liveWeeklyRows(openings: Opening[], week: string): WeeklySnapshot[] {
  const previous = shiftWeek(week, -7)
  const projects = new Map<string, WeeklySnapshot>()
  const people = new Set<string>()
  for (const opening of openings) {
    const project = projectKey(projectName(opening))
    if (!projects.has(project)) projects.set(project, { week, project, activeTo: 0, candidates: 0, completed: 0, capturedAt: '' })
    const row = projects.get(project)!
    if (opening.status === '진행중') row.candidates += opening.candidates.filter(candidate => candidate.stage !== 'Hired').length
    const date = offerDate(opening.completedDate)
    const name = opening.completedName?.trim()
    if (opening.status === '완료' && name && date > previous && date <= week) {
      const personKey = `${project}\u001f${name}\u001f${date}`
      if (!people.has(personKey)) { row.completed++; people.add(personKey) }
    }
  }
  groupOpeningsByTo(openings.filter(opening => opening.status === '진행중')).forEach(group => {
    const project = projectKey(projectName(group.openings[0]))
    projects.get(project)!.activeTo += group.targetTo
  })
  const rows = [...projects.values()].sort((a, b) => a.project.localeCompare(b.project, 'ko'))
  return [{ week, project: '전체', activeTo: rows.reduce((sum, row) => sum + row.activeTo, 0),
    candidates: rows.reduce((sum, row) => sum + row.candidates, 0),
    completed: rows.reduce((sum, row) => sum + row.completed, 0), capturedAt: '' }, ...rows]
}

export function weeklyComparison(data: DashboardData, now = new Date()) {
  const currentMonday = mondayInSeoul(now)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const snapshots = data.weeklySnapshots || []
  const storedWeeks = [...new Set(snapshots.map(row => row.week).filter(week => week <= currentMonday))].sort().reverse()
  const week = today === currentMonday ? currentMonday : storedWeeks[0] || currentMonday
  const current = today === currentMonday || !storedWeeks.includes(week)
    ? liveWeeklyRows(data.openings, week) : snapshots.filter(row => row.week === week)
  const previousWeek = shiftWeek(week, -7)
  const previous = snapshots.filter(row => row.week === previousWeek)
  return { week, previousWeek, current, previous, hasPrevious: previous.some(row => row.project === '전체') }
}

function Difference({ current, previous, hasPrevious }: { current: number; previous: number; hasPrevious: boolean }) {
  if (!hasPrevious) return <span className="weekly-no-previous">지난 월요일 기록 없음</span>
  const diff = current - previous
  return <span className={`weekly-difference ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>
    {diff > 0 ? `+${diff}` : diff}명 <small>지난 월요일 대비</small>
  </span>
}

export function WeeklyComparison({ data, now }: { data: DashboardData; now?: Date }) {
  const { week, previousWeek, current, previous, hasPrevious } = weeklyComparison(data, now)
  const total = current.find(row => row.project === '전체') || { activeTo: 0, candidates: 0, completed: 0 }
  const old = previous.find(row => row.project === '전체') || { activeTo: 0, candidates: 0, completed: 0 }
  const oldByProject = new Map(previous.map(row => [row.project, row]))
  const currentByProject = new Map(current.map(row => [row.project, row]))
  const projectNames = [...new Set([...currentByProject.keys(), ...oldByProject.keys()].filter(project => project !== '전체'))].sort((a, b) => a.localeCompare(b, 'ko'))
  return <section className="weekly-comparison" aria-label="월요일 채용 현황 비교">
    <header><div><span>WEEKLY COMPARISON</span><h2>지난 월요일과 비교</h2><p>{previousWeek.replace(/-/g, '.')} → {week.replace(/-/g, '.')} 기준</p></div></header>
    {data.weeklySnapshotError && <p className="weekly-error">주간 기록을 저장하지 못했습니다: {data.weeklySnapshotError}</p>}
    <div className="weekly-metrics">
      {([['채용중 TO', 'activeTo'], ['진행 지원자', 'candidates'], ['주간 채용 완료', 'completed']] as const).map(([label, field]) =>
        <article key={field}><span>{label}</span><strong>{total[field]}명</strong><Difference current={total[field]} previous={old[field]} hasPrevious={hasPrevious} /></article>)}
    </div>
    {hasPrevious ? <div className="weekly-projects"><h3>프로젝트별 변화</h3><div className="weekly-project-head"><span>프로젝트</span><span>채용중 TO</span><span>진행 지원자</span><span>주간 채용 완료</span></div>
      {projectNames.map(project => {
        const row = currentByProject.get(project)
        const prior = oldByProject.get(project)
        return <div className="weekly-project-row" key={project}><strong>{displayProject(project)}</strong>
          {(['activeTo', 'candidates', 'completed'] as const).map(field => <span key={field}>{prior?.[field] ?? 0} → <b>{row?.[field] ?? 0}</b></span>)}
        </div>
      })}</div> : <p className="weekly-baseline">첫 월요일 기록을 기준으로 저장합니다. 직전 월요일 기록이 쌓이면 증감이 표시됩니다.</p>}
  </section>
}
