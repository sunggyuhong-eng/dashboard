import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, Check, ChevronRight, ClipboardCopy, Clock3, ExternalLink, FileText, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
import { api } from './api'
import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'

type OpeningNote = {
  targetTo: number
  reason: string
  project: string
  memo: string
  enabledStages: PipelineStage[]
}

const NOTE_PREFIX = 'kong-recruiting-note:'
const NEW_DAYS = 7
const REPORT_ID = '__report__'

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
  const fallback: OpeningNote = { targetTo: 0, reason: '', project: opening.project, memo: '', enabledStages: recommendedStages(opening) }
  try {
    const saved = localStorage.getItem(noteKey(opening.id))
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<OpeningNote>
    return { ...fallback, ...parsed, enabledStages: Array.isArray(parsed.enabledStages) ? parsed.enabledStages.filter(stage => PIPELINE_STAGES.includes(stage)) : fallback.enabledStages }
  } catch { return fallback }
}
function isNewOpening(postedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return false
  const age = Date.now() - new Date(`${postedAt}T00:00:00+09:00`).getTime()
  return age >= 0 && age < NEW_DAYS * 24 * 60 * 60 * 1000
}
function stagesFor(opening: Opening, note: OpeningNote) {
  const stages = new Set(note.enabledStages)
  opening.candidates.forEach(candidate => stages.add(candidate.stage))
  return PIPELINE_STAGES.filter(stage => stages.has(stage))
}

function projectName(opening: Opening, note: OpeningNote) {
  const saved = note.project.trim() || opening.project.trim()
  if (saved) {
    const normalized = saved.replace(/^Project\s+/i, '').trim()
    return /^(octopus|otps)$/i.test(normalized) ? 'OTPS' : normalized
  }
  const bracket = opening.title.match(/^\[([^\]]+)\]/)?.[1]?.trim()
  const normalized = bracket?.replace(/^Project\s+/i, '').trim()
  return normalized && /^(octopus|otps)$/i.test(normalized) ? 'OTPS' : normalized || '프로젝트 미지정'
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
    const count = opening.candidates.filter(candidate => candidate.stage === stage).length
    if (!count) return []
    const suffix = stage === '면접' ? `${count}명` : `${count}명 진행 중`
    return [`${labels[stage]} ${suffix}`]
  })
}

function openingSituation(opening: Opening, note: OpeningNote) {
  const status = stageStatus(opening).join(' · ')
  if (!opening.candidates.length) return status
  const memo = note.memo.split('\n').map(line => line.trim()).filter(Boolean).join(' · ')
  return memo ? `${status} · ${memo}` : status
}

function progressBar(completed: number, target: number) {
  if (!target) return ''
  const ratio = Math.min(1, Math.max(0, completed / target))
  const filled = Math.round(ratio * 10)
  return `\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${Math.round(ratio * 100)}% (${completed}/${target}명)`
}

function createSlackReport(openings: Opening[]) {
  const notes = new Map(openings.map(opening => [opening.id, loadNote(opening)]))
  const groups = new Map<string, Opening[]>()
  openings.forEach(opening => {
    const project = projectName(opening, notes.get(opening.id)!)
    groups.set(project, [...(groups.get(project) || []), opening])
  })
  const targetTo = openings.reduce((sum, opening) => sum + notes.get(opening.id)!.targetTo, 0)
  const candidateCount = openings.reduce((sum, opening) => sum + opening.candidates.length, 0)
  const today = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
  const lines = [
    `*채용 진행 현황 | ${today}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `*전체 요약*  • 오픈 공고 \`${openings.length}개\`  • 목표 TO \`${targetTo ? `${targetTo}명` : '미입력'}\`  • 진행 지원자 \`${candidateCount}명\``,
    '',
  ]
  Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko')).forEach(([project, projectOpenings]) => {
    const projectTo = projectOpenings.reduce((sum, opening) => sum + notes.get(opening.id)!.targetTo, 0)
    const projectHired = projectOpenings.reduce((sum, opening) => sum + opening.hiredCount, 0)
    const projectCandidates = projectOpenings.reduce((sum, opening) => sum + opening.candidates.length, 0)
    lines.push(`*${project}*  |  공고 ${projectOpenings.length}개 · TO ${projectTo ? `${projectTo}명` : '미입력'} · 진행 ${projectCandidates}명`)
    if (projectTo) lines.push(`충원 ${progressBar(projectHired, projectTo)}`)
    projectOpenings.sort((a, b) => a.title.localeCompare(b.title, 'ko')).forEach(opening => {
      const note = notes.get(opening.id)!
      const to = note.targetTo ? ` · TO ${note.targetTo}명` : ''
      lines.push(`• *${roleName(opening, project)}*${to}`)
      lines.push(`  ↳ ${stageStatus(opening).join(' · ')}`)
      if (opening.candidates.length) {
        if (note.reason.trim()) lines.push(`  ↳ 채용 배경: ${note.reason.trim()}`)
        note.memo.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => lines.push(`  ↳ ${line}`))
      }
    })
    lines.push('')
  })
  return lines.join('\n').trim()
}

export default function App() { return <Dashboard /> }

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(REPORT_ID)
  const [query, setQuery] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const [refreshNotice, setRefreshNotice] = useState('')
  const load = async (manual = false) => {
    setLoading(true); setError('')
    try {
      const previousSyncedAt = data?.syncedAt
      const next = await api.dashboard(); setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
      if (manual) {
        const unchanged = previousSyncedAt && previousSyncedAt === next.syncedAt
        setRefreshNotice(unchanged ? '새로운 동기화 데이터가 아직 없어요. 현재 배포 데이터를 다시 확인했습니다.' : '최신 배포 데이터를 반영했습니다.')
        window.setTimeout(() => setRefreshNotice(''), 3500)
      }
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load(false) }, [])
  const openings = useMemo(() => (data?.openings || []).filter(x => (includeClosed || x.status === '진행중') && `${x.title} ${x.project}`.toLowerCase().includes(query.toLowerCase())), [data, query, includeClosed])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  const goHome = () => setSelectedId(REPORT_ID)
  return <div className="shell"><header className="topbar"><button className="brand-home" onClick={goHome} aria-label="전체 채용 리포트로 이동"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.svg`} alt="KONG STUDIOS" /><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></button><nav><button onClick={() => void load(true)} disabled={loading} title="현재 배포된 데이터를 캐시 없이 다시 불러옵니다"><RefreshCw size={16} className={loading ? 'spin' : ''} /> {loading ? '불러오는 중' : '데이터 다시 불러오기'}</button></nav></header>
    <div className="workspace"><aside className="opening-sidebar"><div className="sidebar-title"><span>RECRUITING REPORT</span><button className="sidebar-home" onClick={goHome}>채용 현황</button></div><button className={`report-link ${selectedId === REPORT_ID ? 'active' : ''}`} onClick={goHome}><BarChart3 size={17} /><div><b>전체 채용 리포트</b><small>오픈 공고와 전형 진행 요약</small></div><ChevronRight size={15} /></button><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="공고·프로젝트 검색" />{query && <button onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="closed-toggle"><input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} /> 마감 공고 포함</label><div className="opening-list">{openings.map(opening => <button key={opening.id} className={selectedId === opening.id ? 'active' : ''} onClick={() => setSelectedId(opening.id)}><span className={`status-dot ${opening.status === '마감' ? 'closed' : ''}`} /><div><b>{opening.title}{isNewOpening(opening.postedAt) && <em className="new-badge">NEW</em>}</b><small>{projectName(opening, loadNote(opening))} · 진행 {opening.candidates.length}명</small></div><ChevronRight size={15} /></button>)}</div></aside>
      <main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selectedId === REPORT_ID && data ? <OverviewReport data={data} /> : selected ? <OpeningBoard opening={selected} /> : <EmptyState />}</main></div>
    {refreshNotice && <div className="toast">{refreshNotice}</div>}
    <footer><span>마지막 동기화 {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</span><span>진행 지원자 {data?.candidateCount || 0}명</span></footer>
  </div>
}

function OverviewReport({ data }: { data: DashboardData }) {
  const [reportOpen, setReportOpen] = useState(false)
  const [reportText, setReportText] = useState('')
  const [copied, setCopied] = useState(false)
  const active = data.openings.filter(opening => opening.status === '진행중')
  const notes = new Map(active.map(opening => [opening.id, loadNote(opening)]))
  const candidates = active.flatMap(opening => opening.candidates)
  const targetTo = active.reduce((sum, opening) => sum + notes.get(opening.id)!.targetTo, 0)
  const projects = new Map<string, Opening[]>()
  active.forEach(opening => {
    const project = projectName(opening, notes.get(opening.id)!)
    projects.set(project, [...(projects.get(project) || []), opening])
  })
  const openReport = () => { setReportText(createSlackReport(active)); setCopied(false); setReportOpen(true) }
  const copyReport = async () => {
    try { await navigator.clipboard.writeText(reportText) }
    catch { const area = document.querySelector<HTMLTextAreaElement>('.report-textarea'); area?.select(); document.execCommand('copy') }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000)
  }
  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1><p>프로젝트별 오픈 직무와 현재 진행 상황을 한 화면에서 확인합니다.</p></div><div className="report-actions"><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div><button className="primary generate-report" onClick={openReport}><ClipboardCopy size={16} /> 리포트 생성하기</button></div></div>
    <div className="report-kpis"><Summary icon={BriefcaseBusiness} label="오픈 공고" value={`${active.length}개`} /><Summary icon={Target} label="목표 TO" value={targetTo ? `${targetTo}명` : '미입력'} /><Summary icon={UsersRound} label="진행 지원자" value={`${candidates.length}명`} /></div>
    <article className="project-overview"><header><div><span>PROJECT OVERVIEW</span><h2>채용 현황</h2></div><small>프로젝트별 TO와 핵심 진행 상황</small></header><div className="project-summary-table"><div className="project-summary-row project-summary-head"><span>프로젝트</span><span>오픈 공고</span><span>목표 TO</span><span>채용 배경</span><span>진행 지원자</span><span>현재 핵심 상황</span></div>{Array.from(projects.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([project, openings]) => { const projectCandidates = openings.reduce((sum, opening) => sum + opening.candidates.length, 0); const projectTo = openings.reduce((sum, opening) => sum + notes.get(opening.id)!.targetTo, 0); const reasons = [...new Set(openings.map(opening => notes.get(opening.id)!.reason.trim()).filter(Boolean))]; return <div className="project-summary-row" key={project}><span className="project-name"><b>{project}</b>{openings.some(opening => isNewOpening(opening.postedAt)) && <em className="new-badge">NEW</em>}</span><span><b>{openings.length}</b>개</span><span><b>{projectTo || '-'}</b>{projectTo ? '명' : ''}</span><span className="project-reason">{reasons.length ? reasons.map(reason => <small key={reason}>{reason}</small>) : <small>미입력</small>}</span><span><b>{projectCandidates}</b>명</span><span className="key-situation">{[...openings].sort((a, b) => a.title.localeCompare(b.title, 'ko')).map(opening => <strong key={opening.id}><i>{roleName(opening, project)}</i>{openingSituation(opening, notes.get(opening.id)!)}</strong>)}</span></div> })}</div></article>
    {reportOpen && <div className="modal-backdrop" onMouseDown={() => setReportOpen(false)}><section className="modal report-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>SLACK REPORT</span><h2>슬랙 보고 문구</h2></div><button onClick={() => setReportOpen(false)}><X /></button></header><div className="report-guide"><b>복사해서 Slack에 바로 붙여 넣으세요</b><p>굵은 제목, 검은 불릿, 프로젝트별 충원 막대가 유지됩니다. 문구는 아래에서 직접 수정할 수 있습니다.</p></div><label className="report-editor-label">보고 문구 미리보기<textarea className="report-textarea" value={reportText} onChange={e => setReportText(e.target.value)} /></label><div className="modal-actions"><span className="copy-status">{copied ? 'Slack 문구를 복사했습니다.' : ''}</span><button className="outline" onClick={() => setReportOpen(false)}>닫기</button><button className="primary" onClick={copyReport}><ClipboardCopy size={15} /> Slack 문구 복사</button></div></section></div>}
  </section>
}

function OpeningBoard({ opening }: { opening: Opening }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState<OpeningNote>(() => loadNote(opening))
  const [form, setForm] = useState<OpeningNote>(() => loadNote(opening))
  useEffect(() => { const next = loadNote(opening); setNote(next); setForm(next); setEditing(false) }, [opening])
  const remaining = Math.max(0, note.targetTo - opening.hiredCount)
  const visibleStages = stagesFor(opening, note)
  const save = () => {
    const next = { ...form, targetTo: Math.max(0, Number(form.targetTo) || 0), enabledStages: PIPELINE_STAGES.filter(stage => form.enabledStages.includes(stage)) }
    localStorage.setItem(noteKey(opening.id), JSON.stringify(next)); setNote(next); setEditing(false); setNotice('이 브라우저에 공고 설정을 저장했어요')
    window.setTimeout(() => setNotice(''), 2500)
  }
  const toggleStage = (stage: PipelineStage) => setForm(current => ({ ...current, enabledStages: current.enabledStages.includes(stage) ? current.enabledStages.filter(item => item !== stage) : [...current.enabledStages, stage] }))
  return <section className="opening-view"><div className="opening-head"><div><span className="eyebrow">{opening.status === '진행중' ? 'ACTIVE OPENING' : 'CLOSED OPENING'}{isNewOpening(opening.postedAt) && <em className="new-badge head-badge">NEW</em>}</span><h1>{opening.title}</h1><p>{note.project || opening.project || '프로젝트 미지정'}{opening.url && <a href={opening.url} target="_blank" rel="noreferrer">게임잡 공고 <ExternalLink size={13} /></a>}</p></div><button className="outline" onClick={() => { setForm(note); setEditing(true) }}><Settings2 size={16} /> TO·전형·메모 편집</button></div>
    <div className="summary-grid"><Summary icon={Target} label="목표 TO" value={`${note.targetTo}명`} /><Summary icon={Check} label="충원 완료" value={`${opening.hiredCount}명`} /><Summary icon={BriefcaseBusiness} label="잔여 TO" value={`${remaining}명`} accent /><Summary icon={UsersRound} label="진행 지원자" value={`${opening.candidates.length}명`} /></div>
    <div className="note-grid"><article className="reason-card"><span>채용 배경</span><p>{note.reason || '채용 배경을 입력해 주세요.'}</p></article><article className="reason-card"><span>메모</span><p>{note.memo || '이 공고에 대한 메모를 입력해 주세요.'}</p></article></div>
    <div className="board-title"><div><span>HIRING PIPELINE</span><h2>전형 진행 현황</h2></div><p><Clock3 size={14} /> 선택한 전형과 실제 지원자가 있는 단계만 표시합니다.</p></div>
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, 244px)` }}>{visibleStages.map(stage => { const candidates = opening.candidates.filter(x => x.stage === stage); return <section className="lane" key={stage}><header><b>{stage}</b><span>{candidates.length}</span></header><div className="lane-body">{candidates.map(candidate => <article className="candidate" key={candidate.id}><b>{candidate.name}</b><small>{candidate.project || note.project || opening.project || '프로젝트 미지정'}</small></article>)}{!candidates.length && <div className="lane-empty">지원자 없음</div>}</div></section> })}</div>
    {notice && <div className="toast">{notice}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><section className="modal wide-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>LOCAL OPENING SETTINGS</span><h2>TO·전형·메모</h2></div><button onClick={() => setEditing(false)}><X /></button></header><p className="local-help">이 내용은 현재 브라우저에만 저장되며 Google Sheet에는 반영되지 않습니다.</p><div className="form-grid"><label>프로젝트<input value={form.project} onChange={e => setForm({ ...form, project: e.target.value })} /></label><label>목표 TO<input type="number" min="0" value={form.targetTo} onChange={e => setForm({ ...form, targetTo: Number(e.target.value) })} /></label></div><fieldset className="stage-selector"><legend>사용 전형</legend><p>직무에 맞는 단계만 선택하세요. 실제 지원자가 있는 단계는 선택을 해제해도 화면에 유지됩니다.</p><div>{PIPELINE_STAGES.map(stage => <label key={stage}><input type="checkbox" checked={form.enabledStages.includes(stage)} onChange={() => toggleStage(stage)} /><span>{stage}</span></label>)}</div></fieldset><label>채용 배경<textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label><label>메모<textarea rows={3} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={() => setEditing(false)}>취소</button><button className="primary" onClick={save}>이 브라우저에 저장</button></div></section></div>}
  </section>
}

function Summary({ icon: Icon, label, value, accent = false }: { icon: typeof Target; label: string; value: string; accent?: boolean }) { return <article className={`summary ${accent ? 'accent' : ''}`}><Icon size={18} /><div><span>{label}</span><b>{value}</b></div></article> }
function Loading({ label }: { label: string }) { return <div className="state"><RefreshCw className="spin" /><b>{label}</b></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state"><b>데이터를 불러오지 못했어요</b><p>{message}</p><button onClick={retry}>다시 시도</button></div> }
function EmptyState() { return <div className="state"><BriefcaseBusiness /><b>표시할 공고가 없어요</b><p>GitHub Actions에서 데이터 동기화를 실행해 주세요.</p></div> }
