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
  const week = mondayInSeoul(now)
  const previousWeek = shiftWeek(week, -7)
  const snapshots = data.weeklySnapshots || []
  // TO/지원자의 직전 월요일 값만 보관 기록을 사용합니다. I/J열에 뒤늦게
  // 적은 완료자는 최신 시트에서 날짜별로 다시 계산해야 새로고침 즉시 반영됩니다.
  const current = liveWeeklyRows(data.openings, week)
  const previousCompletions = liveWeeklyRows(data.openings, previousWeek)
  const previousSnapshot = snapshots.filter(row => row.week === previousWeek)
  const completedByProject = new Map(previousCompletions.map(row => [row.project, row.completed]))
  const previous = [...previousSnapshot.map(row => ({ ...row, completed: completedByProject.get(row.project) ?? 0 }))]
  const recorded = new Set(previous.map(row => row.project))
  previousCompletions.forEach(row => {
    if (!recorded.has(row.project)) previous.push({ ...row, activeTo: 0, candidates: 0 })
  })
  return { week, previousWeek, current, previous, hasPrevious: previousSnapshot.some(row => row.project === '전체') }
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
        <article key={field}><span>{label}</span><strong>{total[field]}명</strong>{field === 'completed'
          ? <span className="weekly-previous-completed">지난 월요일 채용 완료 <b>{old.completed}명</b></span>
          : <Difference current={total[field]} previous={old[field]} hasPrevious={hasPrevious} />}</article>)}
    </div>
    {hasPrevious ? <div className="weekly-projects"><h3>프로젝트별 변화</h3><div className="weekly-project-head"><span>프로젝트</span><span>채용중 TO</span><span>진행 지원자</span><span>주간 채용 완료</span></div>
      {projectNames.map(project => {
        const row = currentByProject.get(project)
        const prior = oldByProject.get(project)
        return <div className="weekly-project-row" key={project}><strong>{displayProject(project)}</strong>
          {(['activeTo', 'candidates', 'completed'] as const).map(field => <span key={field}>{field === 'completed' || hasPrevious ? prior?.[field] ?? 0 : '—'} → <b>{row?.[field] ?? 0}</b></span>)}
        </div>
      })}</div> : <p className="weekly-baseline">지난 월요일 TO·지원자 기록이 없어 두 지표의 증감은 아직 표시할 수 없습니다. 완료 인원은 입력한 공고 마감 날짜를 기준으로 즉시 집계합니다.</p>}
  </section>
}
