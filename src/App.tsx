import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Eye, EyeOff, FileText, LockKeyhole, LogOut, RefreshCw, Settings2, Target, UsersRound, X } from 'lucide-react'
import { api } from './api'
import { ApprovalLink } from './ApprovalLink'
import { PipelineOverview } from './PipelineOverview'
import { RecruitingReport } from './RecruitingReport'
import { groupOpeningsByProject, groupOpeningsByTo, projectName, totalTargetTo } from './headcount'
import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'
import { readOpeningHistory, recordOpeningHistory, projectHistory, type OpeningHistoryEvent } from './opening-history'

type OpeningNote = {
  memo: string
  enabledStages: PipelineStage[]
}

const NOTE_PREFIX = 'kong-recruiting-note:'
const REPORT_ID = '__report__'
const AUTH_KEY = 'kong-recruiting-authenticated'
const PASSWORD_HASH = '5acc4f34e4cc64ca45390a50c9f84d960b49639390b75fc5eb46b542a90dac66'

function noteKey(openingId: string) { return `${NOTE_PREFIX}${openingId}` }
function isArtOpening(title: string) { return /art|아트|애니메|컨셉|원화|모델|ui|ux|이펙트|vfx/i.test(title) }
function isDevOpening(title: string) { return /software|engineer|developer|개발|엔지니어|프로그래머|클라이언트|서버|unity|유니티/i.test(title) }
function recommendedStages(opening: Opening): PipelineStage[] {
  const active = new Set(opening.candidates.map(candidate => candidate.stage))
  if (isArtOpening(opening.title)) active.add('온라인 과제')
  if (isDevOpening(opening.title)) active.add('코딩테스트')
  if (![...active].some(stage => stage.includes('면접'))) active.add('면접')
  return PIPELINE_STAGES.filter(stage => active.has(stage))
}
function loadNote(opening: Opening): OpeningNote {
  const fallback: OpeningNote = { memo: '', enabledStages: recommendedStages(opening) }
  try {
    const saved = localStorage.getItem(noteKey(opening.id))
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<OpeningNote>
    return {
      memo: typeof parsed.memo === 'string' ? parsed.memo : '',
      enabledStages: Array.isArray(parsed.enabledStages) ? parsed.enabledStages.filter(stage => PIPELINE_STAGES.includes(stage)) : fallback.enabledStages,
    }
  } catch { return fallback }
}
function isNewOpening(opening: Opening) { return opening.isNew === true }
function stagesFor(opening: Opening, note: OpeningNote) {
  const stages = new Set(note.enabledStages)
  opening.candidates.forEach(candidate => stages.add(candidate.stage))
  return PIPELINE_STAGES.filter(stage => stages.has(stage))
}

function roleName(opening: Opening, project: string) {
  return opening.title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(new RegExp(`^${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–|:]?\\s*`, 'i'), '')
    .replace(/\s*모집\s*$/i, '')
    .trim() || opening.title
}

function stageStatus(opening: Opening) {
  if (!opening.candidates.length) return ['이력서 검토 중']
  const labels: Record<PipelineStage, string> = {
    '온라인 과제': '온라인 과제', '코딩테스트': '코딩 테스트', '역량검사': '역량 검사',
    '면접': '면접 예정자', '1차 면접': '1차 면접', '2차 면접': '2차 면접',
    '면접합격': '면접 합격', '처우단계': '처우 협의', 'Offer': '오퍼',
  }
  return PIPELINE_STAGES.flatMap(stage => {
    const stageCandidates = opening.candidates.filter(candidate => candidate.stage === stage)
    const count = stageCandidates.length
    if (!count) return []
    const suffix = stage === '면접' ? `${count}명` : `${count}명 진행 중`
    const offerDates = stage === 'Offer'
      ? stageCandidates.filter(candidate => candidate.hireDate).map(candidate => `${candidate.name}: ${formatKoreanDate(candidate.hireDate)} 입사 예정`)
      : []
    const offerDetail = offerDates.length ? ` (${offerDates.join(' · ')})` : ''
    return [`${labels[stage]} ${suffix}${offerDetail}`]
  })
}

function ProgressSituation({ opening, note }: { opening: Opening; note: OpeningNote }) {
  const text = openingSituation(opening, note)
  const match = text.match(/\([^)]*입사 예정[^)]*\)/)
  if (!match || match.index == null) return <b>{text}</b>
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  return <b>{before}<strong className="overview-hire-date">{match[0]}</strong>{after}</b>
}

function openingSituation(opening: Opening, note: OpeningNote) {
  const status = stageStatus(opening).join(' · ')
  if (!opening.candidates.length) return status
  const memo = note.memo.split('\n').map(line => line.trim()).filter(Boolean).join(' · ')
  return memo ? `${status} · ${memo}` : status
}

type InterviewEvent = {
  key: string
  date: Date
  project: string
  candidate: string
  opening: string
  round: '1차' | '2차'
}

function parseSheetDate(value?: string) {
  const source = (value || '').trim()
  if (!source) return null
  const numbers = source.match(/\d+/g)?.map(Number) || []
  let year: number
  let month: number
  let day: number
  if (numbers.length >= 3 && numbers[0] > 1900) [year, month, day] = numbers
  else if (numbers.length >= 2) { year = new Date().getFullYear(); [month, day] = numbers }
  else return null
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return parsed
}

function formatKoreanDate(value?: string) {
  const parsed = parseSheetDate(value)
  if (!parsed) return (value || '').trim()
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(parsed)
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function InterviewCalendar({ openings }: { openings: Opening[] }) {
  const [open, setOpen] = useState(false)
  const events = useMemo(() => {
    const result: InterviewEvent[] = []
    openings.forEach(opening => {
      const project = projectName(opening)
      const role = roleName(opening, project)
      opening.candidates.forEach(candidate => {
        const schedules: Array<['1차' | '2차', string | undefined]> = [
          ['1차', candidate.firstInterviewDate],
          ['2차', candidate.secondInterviewDate],
        ]
        schedules.forEach(([round, value]) => {
          const date = parseSheetDate(value)
          if (!date) return
          result.push({ key: `${candidate.id}-${round}-${localDateKey(date)}`, date, project, candidate: candidate.name, opening: role, round })
        })
      })
    })
    return result.sort((a, b) => a.date.getTime() - b.date.getTime() || a.candidate.localeCompare(b.candidate, 'ko'))
  }, [openings])
  const firstUpcoming = events.find(event => event.date.getTime() >= new Date().setHours(0, 0, 0, 0))
  const [month, setMonth] = useState(() => {
    const base = firstUpcoming?.date || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const todayKey = localDateKey(new Date())
  const upcomingCount = events.filter(event => event.date.getTime() >= new Date().setHours(0, 0, 0, 0)).length
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => index - firstDay.getDay() + 1)
  const monthLabel = `${month.getFullYear()}년 ${month.getMonth() + 1}월`
  const moveMonth = (amount: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  return <><button className="calendar-fab" onClick={() => setOpen(value => !value)} aria-expanded={open}><CalendarDays size={18} /><span>면접 일정</span>{upcomingCount > 0 && <b>{upcomingCount}</b>}</button>{open && <section className="calendar-popover"><header><div><span>INTERVIEW CALENDAR</span><h2>면접 일정</h2></div><button onClick={() => setOpen(false)} aria-label="달력 닫기"><X size={19} /></button></header><div className="calendar-month"><button onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={18} /></button><b>{monthLabel}</b><button onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight size={18} /></button></div><div className="calendar-weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { if (day < 1 || day > daysInMonth) return <div className="calendar-day empty" key={`empty-${index}`} />; const date = new Date(month.getFullYear(), month.getMonth(), day); const key = localDateKey(date); const dayEvents = events.filter(event => localDateKey(event.date) === key); return <article className={`calendar-day ${key === todayKey ? 'today' : ''}`} key={key}><span className="calendar-date">{day}</span><div className="calendar-events">{dayEvents.map(event => <div className={`calendar-event round-${event.round === '1차' ? 'one' : 'two'}`} key={event.key} title={`${event.opening} · ${event.round} 면접`}><b>{event.project}</b><span>{event.candidate}</span><em>{event.round}</em></div>)}</div></article> })}</div><footer className="calendar-legend"><span><i className="round-one" />1차 면접</span><span><i className="round-two" />2차 면접</span></footer></section>}</>
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function isAuthenticated() {
  try { return sessionStorage.getItem(AUTH_KEY) === 'true' }
  catch { return false }
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated)
  const unlock = () => {
    try { sessionStorage.setItem(AUTH_KEY, 'true') } catch { /* 세션 저장이 막혀도 현재 화면은 허용 */ }
    setAuthenticated(true)
  }
  const logout = () => {
    try { sessionStorage.removeItem(AUTH_KEY) } catch { /* ignore */ }
    setAuthenticated(false)
  }
  return authenticated ? <Dashboard onLogout={logout} /> : <LoginScreen onSuccess={unlock} />
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password) { setError('비밀번호를 입력해 주세요.'); return }
    setChecking(true); setError('')
    try {
      if (await sha256(password) === PASSWORD_HASH) onSuccess()
      else { setError('비밀번호가 올바르지 않습니다.'); setPassword('') }
    } catch { setError('비밀번호를 확인하지 못했습니다. 다시 시도해 주세요.') }
    finally { setChecking(false) }
  }
  return <main className="login-shell"><section className="login-card"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" /><span className="login-eyebrow">KONG STUDIOS KOREA</span><h1>채용 대시보드</h1><p>내부 채용 현황을 확인하려면 비밀번호를 입력해 주세요.</p><form onSubmit={submit}><label>비밀번호<div className={`password-field ${error ? 'invalid' : ''}`}><LockKeyhole size={18} /><input autoFocus autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => { setPassword(event.target.value); setError('') }} placeholder="비밀번호 입력" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <div className="login-error">{error}</div>}<button className="login-submit" type="submit" disabled={checking}>{checking ? '확인 중...' : '들어가기'}</button></form><small>브라우저 탭을 닫으면 다시 로그인이 필요합니다.</small></section></main>
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedId, setSelectedId] = useState(REPORT_ID)
  const [refreshNotice, setRefreshNotice] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const deployed = await api.dashboard()
      let next = deployed
      try {
        next = await api.liveDashboard(deployed)
      } catch (liveError) {
        setRefreshNotice(`최신 시트를 불러오지 못해 마지막 배포 데이터를 표시합니다. ${liveError instanceof Error ? liveError.message : ''}`.trim())
        window.setTimeout(() => setRefreshNotice(''), 7000)
      }
      setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  const syncNow = async () => {
    if (syncing) return
    setSyncing(true); setError(''); setRefreshNotice('시트에서 최신 데이터를 불러오고 있어요.')
    try {
      const next = await api.liveDashboard(data)
      setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
      setRefreshNotice('최신 시트 데이터가 바로 반영됐어요.')
      window.setTimeout(() => setRefreshNotice(''), 4000)
    } catch (e) {
      setRefreshNotice(e instanceof Error ? e.message : '데이터 동기화를 시작하지 못했습니다.')
      window.setTimeout(() => setRefreshNotice(''), 6500)
    } finally {
      setSyncing(false)
    }
  }
  useEffect(() => { void load() }, [])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  const goHome = () => setSelectedId(REPORT_ID)
  return <div className="shell"><header className="topbar"><button className="brand-home" onClick={goHome} aria-label="전체 채용 리포트로 이동"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" /><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></button><nav><button className={syncing ? 'sync-button syncing' : 'sync-button'} onClick={() => void syncNow()} disabled={loading || syncing} title="연동용 시트에서 최신 데이터를 읽어 현재 화면에 바로 반영합니다"><RefreshCw size={16} className={loading || syncing ? 'spin' : ''} /> {syncing ? '시트 불러오는 중' : loading ? '불러오는 중' : '데이터 다시 불러오기'}</button><button className="logout-button" onClick={onLogout}><LogOut size={16} /> 로그아웃</button></nav></header>
    <div className="workspace"><main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selectedId === REPORT_ID && data ? <OverviewReport data={data} onSelectOpening={setSelectedId} /> : selected ? <OpeningBoard opening={selected} openings={data!.openings} onBack={goHome} /> : <EmptyState />}</main></div>
    {refreshNotice && <div className="toast">{refreshNotice}</div>}
    {data && <InterviewCalendar openings={data.openings} />}
    <footer><span>마지막 동기화 {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</span><span>진행 지원자 {data?.candidateCount || 0}명</span></footer>
  </div>
}

const stageColorClasses: Record<PipelineStage, string> = { '온라인 과제':'task', '코딩테스트':'coding', '역량검사':'assessment', '면접':'interview', '1차 면접':'interview', '2차 면접':'interview', '면접합격':'interview', '처우단계':'compensation', 'Offer':'offer' }
const stageDisplayLabels: Record<PipelineStage, string> = { '온라인 과제':'온라인 과제', '코딩테스트':'코딩 테스트', '역량검사':'역량 검사', '면접':'면접', '1차 면접':'1차 면접', '2차 면접':'2차 면접', '면접합격':'면접 합격', '처우단계':'처우 협의', 'Offer':'오퍼' }
function stageClass(stage: PipelineStage) { return stageColorClasses[stage] }
function stageLabel(stage: PipelineStage) { return stageDisplayLabels[stage] }

export function OverviewReport({ data, onSelectOpening }: { data: DashboardData; onSelectOpening?: (id: string) => void }) {
  const [reportOpen, setReportOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [historyEvents, setHistoryEvents] = useState<OpeningHistoryEvent[]>(() => readOpeningHistory())
  useEffect(() => { setHistoryEvents(recordOpeningHistory(data.openings)) }, [data.openings])

  const active = data.openings.filter(opening => opening.status === '진행중')
  const completed = data.openings.filter(opening => opening.status === '완료')
  const candidates = active.flatMap(opening => opening.candidates)
  const targetTo = totalTargetTo(active)
  const hiredCount = groupOpeningsByTo(data.openings).reduce((sum, group) => sum + group.hiredCount, 0)
  const notes = new Map(active.map(opening => [opening.id, loadNote(opening)]))
  const allProjects = groupOpeningsByProject(data.openings)
  const projectOrder = ['ART실', 'GDTS', 'OTPS', 'MAZE', 'HERO', 'ZERO', 'QA', 'SERVER', 'KONG']
  const orderedProjects = [...allProjects.entries()].sort(([a], [b]) => {
    const key = (value: string) => value.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR')
    const ai = projectOrder.indexOf(key(a))
    const bi = projectOrder.indexOf(key(b))
    return (ai < 0 ? projectOrder.length : ai) - (bi < 0 ? projectOrder.length : bi) || a.localeCompare(b, 'ko')
  })
  const selectedProjectOpenings = selectedProject ? allProjects.get(selectedProject) || [] : []
  const selectedProjectEvents = selectedProject ? projectHistory(historyEvents, selectedProject) : []
  const currentToGroups = groupOpeningsByTo(selectedProjectOpenings.filter(opening => opening.status === '진행중'))
  const completedToGroups = groupOpeningsByTo(selectedProjectOpenings.filter(opening => opening.status === '완료'))
  const openReport = () => setReportOpen(true)

  const historyFor = (opening: Opening) => selectedProjectEvents.filter(event => event.openingId === opening.id)
  const hiringStartDate = (opening: Opening) => historyFor(opening).find(event => event.kind === 'baseline')?.at
  const completionDate = (opening: Opening) => historyFor(opening).find(event => event.kind === 'status' && event.status === '완료')?.at
  const formatHistoryDate = (value?: string) => {
    if (!value) return '기록 없음'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }

  const renderToGroup = (group: ReturnType<typeof groupOpeningsByTo>[number], isCompleted: boolean) => {
    const stages = PIPELINE_STAGES.map(stage => ({ stage, count: group.openings.reduce((sum, opening) => sum + opening.candidates.filter(candidate => candidate.stage === stage).length, 0) })).filter(item => item.count)
    return <article className={`org-to-group ${isCompleted ? 'completed' : ''}`} key={`${isCompleted ? 'done' : 'active'}-${group.key}`}>
      <header className="org-to-metrics"><span className={`org-status ${isCompleted ? 'done' : ''}`}>{isCompleted ? '완료' : '진행 중'}</span><span>목표 TO <b>{group.targetTo}명</b></span></header>
      <ul className="org-to-openings">{group.openings.map(opening => {
        const started = hiringStartDate(opening)
        const finished = completionDate(opening)
        return <li key={opening.id}>
          <div className="org-to-opening-title"><b>{roleName(opening, selectedProject || opening.project)}</b><p className="org-to-reason"><strong>채용 사유</strong>{opening.reason || '채용 사유 미입력'}</p></div>
          <div className="org-to-dates"><span>이력 추적 시작일 <b>{formatHistoryDate(started)}</b></span>{isCompleted && <span>완료 확인일 <b>{formatHistoryDate(finished)}</b></span>}</div>
          {!isCompleted && <div className="org-stage-breakdown">{stages.length ? PIPELINE_STAGES.flatMap(stage => { const count = opening.candidates.filter(candidate => candidate.stage === stage).length; return count ? [<span key={stage} className="org-stage-chip"><i className={`org-stage-dot-${stageClass(stage)}`} /><span>{stageLabel(stage)}</span><b>{count}명</b></span>] : [] }) : <span className="org-stage-none">현재 진행 지원자 없음</span>}</div>}
          <button type="button" className="org-opening-link" onClick={() => onSelectOpening?.(opening.id)}>공고 상세 보기 <ChevronRight size={14} /></button>
        </li>
      })}</ul>
    </article>
  }

  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1></div><div className="report-actions"><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div><button className="primary generate-report" onClick={openReport}><FileText size={16} /> 리포트 생성하기</button></div></div>
    <div className="report-kpis"><Summary label="오픈 공고" value={`${active.length}개`} /><Summary label="목표 TO" value={targetTo ? `${targetTo}명` : '미입력'} /><Summary label="진행 지원자" value={`${candidates.length}명`} /><Summary label="채용 완료" value={`${hiredCount}명`} /></div>
    <section className="recruiting-operations"><header><div><span>RECRUITING OPERATIONS</span><h2>채용 운영 요약</h2></div></header><PipelineOverview openings={active} onSelectOpening={onSelectOpening} /></section>
    <article className="project-overview"><header><div><span>PROJECT OVERVIEW</span><h2>프로젝트별 채용 현황</h2><p>프로젝트를 선택하면 해당 행 바로 아래에서 진행 중 TO와 완료된 TO를 확인할 수 있어요.</p></div></header>
      <div className="org-project-list">{orderedProjects.map(([project, projectOpenings]) => {
        const activeOpenings = projectOpenings.filter(opening => opening.status === '진행중')
        const doneOpenings = projectOpenings.filter(opening => opening.status === '완료')
        const projectTarget = totalTargetTo(projectOpenings)
        const stageCounts = PIPELINE_STAGES.map(stage => ({ stage, count: activeOpenings.reduce((sum, opening) => sum + opening.candidates.filter(candidate => candidate.stage === stage).length, 0) })).filter(item => item.count)
        const icon = ['GDTS', 'ZERO'].includes(project.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR')) ? `${import.meta.env.BASE_URL}${project.trim().replace(/^Project\s+/i, '').toLocaleUpperCase('ko-KR').toLowerCase()}.png` : null
        return <div className="org-project-entry" key={project}>
          <button type="button" className={`org-project-row ${selectedProject === project ? 'active' : ''}`} aria-expanded={selectedProject === project} onClick={() => setSelectedProject(selectedProject === project ? null : project)}>
            <span className="org-project-name">{icon && <img src={icon} alt="" /> }<span><strong>{project}</strong><small>{activeOpenings.length}개 진행 · {doneOpenings.length}개 완료</small></span></span>
            <span className="org-project-stat"><small>목표 TO</small><b>{projectTarget}명</b></span>
            <span className="org-project-stages">{stageCounts.length ? stageCounts.map(item => <span key={item.stage} className="org-stage-chip"><i className={`org-stage-dot-${stageClass(item.stage)}`} /><span>{stageLabel(item.stage)}</span><b>{item.count}명</b></span>) : <small>진행 중 지원자 없음</small>}</span><ChevronRight size={17} />
          </button>
          {selectedProject === project && <section className="org-project-detail"><header><div><span>PROJECT DETAIL</span><h3>{selectedProject}</h3></div><button type="button" className="outline" onClick={() => setSelectedProject(null)}>닫기 <X size={14} /></button></header>
            <p className="org-date-note">날짜는 이 대시보드가 현재 브라우저에서 TO를 처음 기록하거나 완료 상태를 확인한 시점입니다. 이전 날짜가 브라우저 기록에 없으면 과거 일자는 표시되지 않습니다.</p>
            <section className="org-to-section"><header><div><h4>현재 진행 중 TO</h4><small>{currentToGroups.length}건</small></div></header>{currentToGroups.length ? currentToGroups.map(group => renderToGroup(group, false)) : <p className="org-history-empty">현재 진행 중인 TO가 없습니다.</p>}</section>
            <section className="org-to-section"><header><div><h4>완료된 TO</h4><small>{completedToGroups.length}건</small></div></header>{completedToGroups.length ? completedToGroups.map(group => renderToGroup(group, true)) : <p className="org-history-empty">완료된 TO가 없습니다.</p>}</section>
            <section className="org-history"><header><div><span>TO & PIPELINE HISTORY</span><h4>최근 1년 변경 이력</h4></div><small>이 브라우저에서 확인한 변경사항</small></header>
              {selectedProjectEvents.length ? <ol>{selectedProjectEvents.slice().reverse().map((event, index) => <li key={`${event.openingId}-${event.at}-${index}`}><time>{new Date(event.at).toLocaleString('ko-KR')}</time><b>{event.kind === 'baseline' ? '기록 시작' : event.kind === 'status' ? `상태 변경 · ${event.previousStatus} → ${event.status}` : 'TO / 전형 현황 변경'}</b><span>{roleName({ title: event.title } as Opening, selectedProject)} · 목표 TO {event.snapshot.targetTo || '미입력'}명 · {Object.entries(event.snapshot.stageCounts).map(([stage, count]) => `${stageLabel(stage as PipelineStage)} ${count}명`).join(' · ') || '진행 지원자 없음'}</span></li>)}</ol> : <p className="org-history-empty">이 프로젝트의 기록이 아직 없습니다.</p>}
            </section>
          </section>}
        </div>
      })}</div>
    </article>
    {reportOpen && <RecruitingReport data={data} openingNotes={new Map(active.map(opening => [opening.id, notes.get(opening.id)?.memo || '']))} onClose={() => setReportOpen(false)} />}
  </section>
}

export function OpeningBoard({ opening, openings = [opening], onBack }: { opening: Opening; openings?: Opening[]; onBack?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState<OpeningNote>(() => loadNote(opening))
  const [form, setForm] = useState<OpeningNote>(() => loadNote(opening))
  useEffect(() => { const next = loadNote(opening); setNote(next); setForm(next); setEditing(false) }, [opening])
  const group = groupOpeningsByTo(openings).find(group => group.openings.some(item => item.id === opening.id)) || groupOpeningsByTo([opening])[0]
  const remaining = Math.max(0, group.targetTo - group.hiredCount)
  const visibleStages = stagesFor(opening, note)
  const save = () => {
    const next = { ...form, enabledStages: PIPELINE_STAGES.filter(stage => form.enabledStages.includes(stage)) }
    localStorage.setItem(noteKey(opening.id), JSON.stringify(next)); setNote(next); setEditing(false); setNotice('이 브라우저에 공고 설정을 저장했어요')
    window.setTimeout(() => setNotice(''), 2500)
  }
  const toggleStage = (stage: PipelineStage) => setForm(current => ({ ...current, enabledStages: current.enabledStages.includes(stage) ? current.enabledStages.filter(item => item !== stage) : [...current.enabledStages, stage] }))
  return <section className="opening-view"><div className="opening-head"><div><button type="button" className="opening-back outline" onClick={onBack}><ArrowLeft size={16} /> 프로젝트 목록으로</button><span className="eyebrow">ACTIVE OPENING{isNewOpening(opening) && <em className="new-badge head-badge">NEW</em>}</span><div className="opening-title-line"><h1>{opening.title}</h1><ApprovalLink url={opening.approvalUrl} title={opening.title} /></div><p>{opening.project || '프로젝트 미지정'}</p></div><button className="outline" onClick={() => { setForm(note); setEditing(true) }}><Settings2 size={16} /> 전형·메모 편집</button></div>
    <div className="summary-grid"><Summary icon={Target} label="목표 TO" value={`${group.targetTo}명`} /><Summary icon={Check} label="충원 완료" value={`${group.hiredCount}명`} /><Summary icon={BriefcaseBusiness} label="잔여 TO" value={`${remaining}명`} accent /><Summary icon={UsersRound} label="진행 지원자" value={`${opening.candidates.length}명`} /></div>
    <div className="note-grid"><article className="reason-card"><span>채용 배경</span><p>{opening.reason || '채용 배경 미입력'}</p></article><article className="reason-card"><span>메모</span><p>{note.memo || '이 공고에 대한 메모를 입력해 주세요.'}</p></article></div>
    <div className="board-title"><div><span>HIRING PIPELINE</span><h2>전형 진행 현황</h2></div><p><Clock3 size={14} /> 선택한 전형과 실제 지원자가 있는 단계만 표시합니다.</p></div>
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, 244px)` }}>{visibleStages.map(stage => { const candidates = opening.candidates.filter(x => x.stage === stage); return <section className="lane" key={stage}><header><b>{stage}</b><span>{candidates.length}</span></header><div className="lane-body">{candidates.map(candidate => <article className="candidate" key={candidate.id}><div className="candidate-name"><b>{candidate.name}</b>{candidate.stage === 'Offer' && candidate.hireDate && <strong className="hire-date">› {formatKoreanDate(candidate.hireDate)} 입사 예정</strong>}</div><small>{candidate.project || opening.project || '프로젝트 미지정'}</small></article>)}{!candidates.length && <div className="lane-empty">지원자 없음</div>}</div></section> })}</div>
    {notice && <div className="toast">{notice}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><section className="modal wide-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>LOCAL OPENING SETTINGS</span><h2>전형·메모</h2></div><button onClick={() => setEditing(false)}><X /></button></header><p className="local-help">목표 TO와 채용 배경은 연동용 사본의 Dashboard_TO 탭에서 불러옵니다. 전형 설정과 메모만 현재 브라우저에 저장됩니다.</p><fieldset className="stage-selector"><legend>사용 전형</legend><p>직무에 맞는 단계만 선택하세요. 실제 지원자가 있는 단계는 선택을 해제해도 화면에 유지됩니다.</p><div>{PIPELINE_STAGES.map(stage => <label key={stage}><input type="checkbox" checked={form.enabledStages.includes(stage)} onChange={() => toggleStage(stage)} /><span>{stage}</span></label>)}</div></fieldset><label>메모<textarea rows={3} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={() => setEditing(false)}>취소</button><button className="primary" onClick={save}>이 브라우저에 저장</button></div></section></div>}
  </section>
}

function Summary({ icon: Icon, label, value, accent = false }: { icon?: typeof Target; label: string; value: string; accent?: boolean }) { return <article className={`summary ${accent ? 'accent' : ''}`}>{Icon && <Icon size={18} />}<div><span>{label}</span><b>{value}</b></div></article> }
function Loading({ label }: { label: string }) { return <div className="state"><RefreshCw className="spin" /><b>{label}</b></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state"><b>데이터를 불러오지 못했어요</b><p>{message}</p><button onClick={retry}>다시 시도</button></div> }
function EmptyState() { return <div className="state"><BriefcaseBusiness /><b>표시할 공고가 없어요</b><p>GitHub Actions에서 데이터 동기화를 실행해 주세요.</p></div> }
