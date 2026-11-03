import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BarChart3, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Eye, EyeOff, FileText, LockKeyhole, LogOut, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
import { api } from './api'
import { ApprovalLink } from './ApprovalLink'
import { PipelineOverview, PIPELINE_GROUPS } from './PipelineOverview'
import { RecruitingReport } from './RecruitingReport'
import { groupOpeningsByProject, groupOpeningsByTo, projectName, totalTargetTo } from './headcount'
import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'
import { readOpeningHistory, reconcileOpeningHistory, writeOpeningHistory, type OpeningHistory, type OpeningHistoryRecord } from './opening-history'

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
  const [openingHistory, setOpeningHistory] = useState<OpeningHistory>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedId, setSelectedId] = useState(REPORT_ID)
  const [showClosed, setShowClosed] = useState(false)
  const [query, setQuery] = useState('')
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
      const observed = reconcileOpeningHistory(next, readOpeningHistory())
      writeOpeningHistory(observed.history)
      setOpeningHistory(observed.history)
      setData(observed.data)
      setSelectedId(id => id === REPORT_ID || observed.data.openings.some(x => x.id === id) ? id : REPORT_ID)
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  const syncNow = async () => {
    if (syncing) return
    setSyncing(true); setError(''); setRefreshNotice('시트에서 최신 데이터를 불러오고 있어요.')
    try {
      const next = await api.liveDashboard(data)
      const observed = reconcileOpeningHistory(next, readOpeningHistory())
      writeOpeningHistory(observed.history)
      setOpeningHistory(observed.history)
      setData(observed.data)
      setSelectedId(id => id === REPORT_ID || observed.data.openings.some(x => x.id === id) ? id : REPORT_ID)
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
  const openings = useMemo(() => (data?.openings || []).filter(x => (showClosed ? x.status === '마감' : x.status === '진행중') && `${x.title} ${x.project}`.toLowerCase().includes(query.toLowerCase())), [data, query, showClosed])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  const closedCount = data?.openings.filter(opening => opening.status === '마감').length || 0
  const goHome = () => setSelectedId(REPORT_ID)
  return <div className="shell"><header className="topbar"><button className="brand-home" onClick={goHome} aria-label="전체 채용 리포트로 이동"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" /><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></button><nav><button className={syncing ? 'sync-button syncing' : 'sync-button'} onClick={() => void syncNow()} disabled={loading || syncing} title="연동용 시트에서 최신 데이터를 읽어 현재 화면에 바로 반영합니다"><RefreshCw size={16} className={loading || syncing ? 'spin' : ''} /> {syncing ? '시트 불러오는 중' : loading ? '불러오는 중' : '데이터 다시 불러오기'}</button><button className="logout-button" onClick={onLogout}><LogOut size={16} /> 로그아웃</button></nav></header>
    <div className="workspace"><aside className="opening-sidebar"><div className="sidebar-title"><span>RECRUITING REPORT</span><button className="sidebar-home" onClick={goHome}>채용 현황</button></div><button className={`report-link ${selectedId === REPORT_ID ? 'active' : ''}`} onClick={goHome}><BarChart3 size={17} /><div><b>전체 채용 리포트</b></div><ChevronRight size={15} /></button><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="공고·프로젝트 검색" />{query && <button onClick={() => setQuery('')}><X size={14} /></button>}</label><button type="button" className={`closed-filter ${showClosed ? 'active' : ''}`} onClick={() => { setShowClosed(value => !value); setSelectedId(REPORT_ID) }}><span>{showClosed ? '진행 중 공고 보기' : '완료된 공고 보기'}</span><b>{showClosed ? data?.openings.filter(opening => opening.status === '진행중').length || 0 : closedCount}</b></button><div className="opening-list">{openings.map(opening => <button key={opening.id} className={selectedId === opening.id ? 'active' : ''} onClick={() => setSelectedId(opening.id)}><span className={`status-dot ${opening.status === '마감' ? 'closed' : ''}`} /><div><b>{opening.title}{isNewOpening(opening) && <em className="new-badge">NEW</em>}</b><small>{projectName(opening)} · {opening.status === '마감' ? `완료 · 목표 TO ${openingHistory[opening.id]?.snapshot.targetTo ?? opening.targetTo}명` : `진행 ${opening.candidates.length}명`}</small></div><ChevronRight size={15} /></button>)}</div></aside>
      <main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selectedId === REPORT_ID && data ? <OverviewReport data={data} onSelectOpening={setSelectedId} /> : selected ? <OpeningBoard opening={selected} openings={data!.openings} history={openingHistory[selected.id]} /> : <EmptyState />}</main></div>
    {refreshNotice && <div className="toast">{refreshNotice}</div>}
    {data && <InterviewCalendar openings={data.openings.filter(opening => opening.status === '진행중')} />}
    <footer><span>마지막 동기화 {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</span><span>진행 지원자 {data?.candidateCount || 0}명</span></footer>
  </div>
}

export function OverviewReport({ data, onSelectOpening }: { data: DashboardData; onSelectOpening?: (id: string) => void }) {
  const [reportOpen, setReportOpen] = useState(false)
  const active = data.openings.filter(opening => opening.status === '진행중')
  const notes = new Map(active.map(opening => [opening.id, loadNote(opening)]))
  const candidates = active.flatMap(opening => opening.candidates)
  const targetTo = totalTargetTo(active)
  const projects = groupOpeningsByProject(active)
  const overviewColors = ['#1b64da', '#3182f6', '#67a5f6', '#8bbdf9', '#8065dc', '#a69af4', '#56b8a7', '#f0a24a']
  const projectShares = Array.from(projects.entries()).map(([project, projectOpenings]) => ({
    project,
    targetTo: totalTargetTo(projectOpenings),
    openingCount: projectOpenings.length,
  })).sort((a, b) => b.targetTo - a.targetTo || b.openingCount - a.openingCount || a.project.localeCompare(b.project, 'ko'))
  const shareUsesTo = projectShares.some(item => item.targetTo > 0)
  const projectShareTotal = Math.max(1, projectShares.reduce((sum, item) => sum + (shareUsesTo ? item.targetTo : item.openingCount), 0))
  let shareAngle = 0
  const projectShareStops = projectShares.map((item, index) => {
    const start = shareAngle
    shareAngle += ((shareUsesTo ? item.targetTo : item.openingCount) / projectShareTotal) * 360
    return `${overviewColors[index % overviewColors.length]} ${start}deg ${shareAngle}deg`
  })
  const mainPipelineTotal = candidates.filter(candidate => PIPELINE_GROUPS.some(group => (group.stages as readonly PipelineStage[]).includes(candidate.stage))).length
  const otherPipelineTotal = Math.max(0, candidates.length - mainPipelineTotal)
  const openReport = () => setReportOpen(true)
  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1></div><div className="report-actions"><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div><button className="primary generate-report" onClick={openReport}><FileText size={16} /> 리포트 생성하기</button></div></div>
    <div className="report-kpis"><Summary icon={BriefcaseBusiness} label="오픈 공고" value={`${active.length}개`} /><Summary icon={Target} label="목표 TO" value={targetTo ? `${targetTo}명` : '미입력'} /><Summary icon={UsersRound} label="진행 지원자" value={`${candidates.length}명`} /></div>
    <section className="recruiting-operations">
      <header><div><span>채용 운영 요약</span><h2>현재 전형 진행 현황</h2></div><small>주요 전형 {mainPipelineTotal}명{otherPipelineTotal > 0 && ` · 기타 전형 ${otherPipelineTotal}명`}</small></header>
      <div className="operations-layout with-pipeline-list">
        <div className="project-share-panel">
          <h3>{shareUsesTo ? '프로젝트별 목표 TO' : '프로젝트별 공고'}</h3>
          <div className="overview-donut compact" style={{ background: projectShares.length ? `conic-gradient(${projectShareStops.join(',')})` : '#eef1f4' }}><div><b>{shareUsesTo ? targetTo : active.length}</b><span>{shareUsesTo ? '목표 TO' : '오픈 공고'}</span></div></div>
          <ol className="project-share-list">{projectShares.map((item, index) => {
            const value = shareUsesTo ? item.targetTo : item.openingCount
            const ratio = Math.round((value / projectShareTotal) * 100)
            return <li key={item.project}><i style={{ background: overviewColors[index % overviewColors.length] }} /><b>{item.project}</b><span>{ratio}%</span><strong>{shareUsesTo ? `${item.targetTo}명` : `${item.openingCount}개`}</strong></li>
          })}</ol>
        </div>
        <PipelineOverview openings={active} onSelectOpening={onSelectOpening} />
      </div>
    </section>
    <article className="project-overview"><header><div><span>PROJECT OVERVIEW</span><h2>채용 현황</h2></div></header>
      <div className="project-status-table-wrap"><table className="project-status-table"><thead><tr><th>프로젝트</th><th>채용 직무</th><th>목표 TO</th><th>채용 배경</th><th>현재 진행</th></tr></thead>
        <tbody>{Array.from(projects.entries()).flatMap(([project, projectOpenings]) => {
          const groups = groupOpeningsByTo(projectOpenings)
          return groups.flatMap((group, groupIndex) => group.openings.map((opening, index) => {
            const mergeReason = group.shared && group.reasons.length <= 1
            return <tr key={opening.id}>
              {groupIndex === 0 && index === 0 && <th className="project-cell" rowSpan={projectOpenings.length}><span>{project}</span><small>({totalTargetTo(projectOpenings)}명)</small></th>}
              <td className="role-cell"><b>{roleName(opening, project)}</b>{isNewOpening(opening) && <em className="new-badge">NEW</em>}<ApprovalLink url={opening.approvalUrl} title={opening.title} /></td>
              {index === 0 && <td className="to-cell" rowSpan={group.openings.length}>
                <b>{group.targetTo ? `${group.targetTo}명` : '미입력'}</b>
              </td>}
              {mergeReason ? index === 0 && <td className="reason-cell shared-reason-cell" rowSpan={group.openings.length}>{group.reasons[0] || '미입력'}</td> : <td className="reason-cell">{opening.reason.trim() || '미입력'}</td>}
              <td className="progress-cell"><ProgressSituation opening={opening} note={notes.get(opening.id)!} /></td>
            </tr>
          }))
        })}</tbody>
      </table></div>
    </article>
    {reportOpen && <RecruitingReport data={data} openingNotes={new Map(active.map(opening => [opening.id, notes.get(opening.id)?.memo || '']))} onClose={() => setReportOpen(false)} />}
  </section>
}

const reportStageLabel: Record<PipelineStage, string> = {
  '온라인 과제': '온라인 과제', '코딩테스트': '코딩 테스트', '역량검사': '역량 검사', '면접': '면접',
  '1차 면접': '1차 면접', '2차 면접': '2차 면접', '면접합격': '면접 합격', '처우단계': '처우 협의', 'Offer': '오퍼',
}

function openingHistoryDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function OpeningBoard({ opening, openings = [opening], history }: {
  opening: Opening
  openings?: Opening[]
  history?: OpeningHistoryRecord
}) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState<OpeningNote>(() => loadNote(opening))
  const [form, setForm] = useState<OpeningNote>(() => loadNote(opening))
  useEffect(() => { const next = loadNote(opening); setNote(next); setForm(next); setEditing(false) }, [opening])
  const isClosed = opening.status === '마감'
  const toGroupOpenings = isClosed ? [opening] : openings.filter(item => item.status === '진행중')
  const group = groupOpeningsByTo(toGroupOpenings).find(group => group.openings.some(item => item.id === opening.id)) || groupOpeningsByTo([opening])[0]
  const historySnapshot = history?.snapshot
  const targetTo = isClosed ? historySnapshot?.targetTo ?? group.targetTo : group.targetTo
  const hiredCount = isClosed ? historySnapshot?.hiredCount ?? group.hiredCount : group.hiredCount
  const displayedCandidateCount = isClosed ? historySnapshot?.candidateCount ?? opening.candidates.length : opening.candidates.length
  const remaining = Math.max(0, targetTo - hiredCount)
  const visibleStages = stagesFor(opening, note)
  const save = () => {
    const next = { ...form, enabledStages: PIPELINE_STAGES.filter(stage => form.enabledStages.includes(stage)) }
    localStorage.setItem(noteKey(opening.id), JSON.stringify(next)); setNote(next); setEditing(false); setNotice('이 브라우저에 공고 설정을 저장했어요')
    window.setTimeout(() => setNotice(''), 2500)
  }
  const toggleStage = (stage: PipelineStage) => setForm(current => ({ ...current, enabledStages: current.enabledStages.includes(stage) ? current.enabledStages.filter(item => item !== stage) : [...current.enabledStages, stage] }))
  return <section className="opening-view"><div className="opening-head"><div><span className="eyebrow">{isClosed ? 'COMPLETED OPENING' : 'ACTIVE OPENING'}{isNewOpening(opening) && <em className="new-badge head-badge">NEW</em>}</span><div className="opening-title-line"><h1>{opening.title}</h1><ApprovalLink url={opening.approvalUrl} title={opening.title} /></div><p>{opening.project || '프로젝트 미지정'}{isClosed && <span className="closed-label">채용 완료</span>}</p></div><div className="opening-head-actions">{!isClosed && <button className="outline" onClick={() => { setForm(note); setEditing(true) }}><Settings2 size={16} /> 전형·메모 편집</button>}</div></div>
    {isClosed && <div className="archived-notice"><b>완료 공고의 이력</b><span>연동 시트 G열의 완료 표시를 기준으로 이 공고를 보관하고 있습니다.</span></div>}
    <div className="summary-grid"><Summary icon={Target} label="목표 TO" value={`${targetTo}명`} /><Summary icon={Check} label="충원 완료" value={`${hiredCount}명`} /><Summary icon={BriefcaseBusiness} label="잔여 TO" value={`${remaining}명`} accent /><Summary icon={UsersRound} label="기록된 진행 지원자" value={`${displayedCandidateCount}명`} /></div>
    <div className="note-grid"><article className="reason-card"><span>채용 배경</span><p>{opening.reason || '채용 배경 미입력'}</p></article><article className="reason-card"><span>메모</span><p>{note.memo || '이 공고에 대한 메모를 입력해 주세요.'}</p></article></div>
    {!isClosed && <><div className="board-title"><div><span>HIRING PIPELINE</span><h2>전형 진행 현황</h2></div><p><Clock3 size={14} /> 선택한 전형과 실제 지원자가 있는 단계만 표시합니다.</p></div>
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, 244px)` }}>{visibleStages.map(stage => { const candidates = opening.candidates.filter(x => x.stage === stage); return <section className="lane" key={stage}><header><b>{stage}</b><span>{candidates.length}</span></header><div className="lane-body">{candidates.map(candidate => <article className="candidate" key={candidate.id}><div className="candidate-name"><b>{candidate.name}</b>{candidate.stage === 'Offer' && candidate.hireDate && <strong className="hire-date">› {formatKoreanDate(candidate.hireDate)} 입사 예정</strong>}</div><small>{candidate.project || opening.project || '프로젝트 미지정'}</small></article>)}{!candidates.length && <div className="lane-empty">지원자 없음</div>}</div></section> })}</div></>}
    <section className="opening-history-panel"><header><div><span>TO HISTORY</span><h2>TO · 채용 진행 이력</h2></div><small>시트 데이터를 불러온 시점의 변경 사항을 기록합니다</small></header>{history?.events.length ? <ol>{[...history.events].reverse().map((event, index) => { const counts = PIPELINE_STAGES.flatMap(stage => { const count = event.snapshot.stageCounts[stage] || 0; return count ? [{ stage, count }] : [] }); const title = event.kind === 'status' ? `${event.previousStatus === '종료' ? '완료' : '진행중'} → ${event.status === '종료' ? '완료' : '진행중'}` : event.kind === 'removed' ? '시트에서 빠져 완료 이력으로 보관' : index === history.events.length - 1 ? '최초 기록' : '시트 데이터 변경'; return <li key={`${event.at}-${event.kind}-${index}`}><span className={`history-marker ${event.kind}`} /><article><header><b>{title}</b><time>{openingHistoryDate(event.at)}</time></header><div className="history-metrics"><span>목표 TO <b>{event.snapshot.targetTo}명</b></span><span>충원 <b>{event.snapshot.hiredCount}명</b></span><span>잔여 <b>{Math.max(0, event.snapshot.targetTo - event.snapshot.hiredCount)}명</b></span><span>진행 지원자 <b>{event.snapshot.candidateCount}명</b></span></div>{counts.length ? <div className="history-stages">{counts.map(({ stage, count }) => <span key={stage}>{reportStageLabel[stage]} <b>{count}명</b></span>)}</div> : <small className="history-empty">전형 진행 지원자 없음</small>}</article></li> })}</ol> : <div className="history-empty-state">이 브라우저에 저장된 이력이 아직 없습니다. 시트 데이터를 불러오면 현재 TO와 전형 현황부터 기록됩니다.</div>}</section>
    {notice && <div className="toast">{notice}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><section className="modal wide-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>LOCAL OPENING SETTINGS</span><h2>전형·메모</h2></div><button onClick={() => setEditing(false)}><X /></button></header><p className="local-help">목표 TO와 채용 배경은 연동용 사본의 Dashboard_TO 탭에서 불러옵니다. 전형 설정과 메모만 현재 브라우저에 저장됩니다.</p><fieldset className="stage-selector"><legend>사용 전형</legend><p>직무에 맞는 단계만 선택하세요. 실제 지원자가 있는 단계는 선택을 해제해도 화면에 유지됩니다.</p><div>{PIPELINE_STAGES.map(stage => <label key={stage}><input type="checkbox" checked={form.enabledStages.includes(stage)} onChange={() => toggleStage(stage)} /><span>{stage}</span></label>)}</div></fieldset><label>메모<textarea rows={3} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={() => setEditing(false)}>취소</button><button className="primary" onClick={save}>이 브라우저에 저장</button></div></section></div>}
  </section>
}

function Summary({ icon: Icon, label, value, accent = false }: { icon: typeof Target; label: string; value: string; accent?: boolean }) { return <article className={`summary ${accent ? 'accent' : ''}`}><Icon size={18} /><div><span>{label}</span><b>{value}</b></div></article> }
function Loading({ label }: { label: string }) { return <div className="state"><RefreshCw className="spin" /><b>{label}</b></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state"><b>데이터를 불러오지 못했어요</b><p>{message}</p><button onClick={retry}>다시 시도</button></div> }
function EmptyState() { return <div className="state"><BriefcaseBusiness /><b>표시할 공고가 없어요</b><p>GitHub Actions에서 데이터 동기화를 실행해 주세요.</p></div> }
