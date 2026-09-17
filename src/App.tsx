import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, BriefcaseBusiness, Check, ChevronDown, ChevronRight, ClipboardCopy, Clock3, ExternalLink, FileText, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
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
  if (saved) return saved.replace(/^Project\s+/i, '')
  const bracket = opening.title.match(/^\[([^\]]+)\]/)?.[1]?.trim()
  return bracket?.replace(/^Project\s+/i, '') || '프로젝트 미지정'
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
    `[채용 진행 현황 | ${today}]`,
    `- 진행 프로젝트 ${groups.size}개 / 오픈 공고 ${openings.length}개 / 진행 지원자 ${candidateCount}명${targetTo ? ` / 목표 TO ${targetTo}명` : ''}`,
    '',
  ]
  Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko')).forEach(([project, projectOpenings]) => {
    lines.push(`- ${project}`)
    projectOpenings.sort((a, b) => a.title.localeCompare(b.title, 'ko')).forEach(opening => {
      const note = notes.get(opening.id)!
      const to = note.targetTo ? ` (TO ${note.targetTo}명)` : ''
      lines.push(`  - ${roleName(opening, project)}${to}`)
      stageStatus(opening).forEach(status => lines.push(`    - ${status}`))
      if (opening.candidates.length) {
        if (note.reason.trim()) lines.push(`    - 채용 배경: ${note.reason.trim()}`)
        note.memo.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => lines.push(`    - ${line}`))
      }
    })
  })
  return lines.join('\n')
}

export default function App() { return <Dashboard /> }

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(REPORT_ID)
  const [query, setQuery] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const load = async () => {
    setLoading(true); setError('')
    try {
      const next = await api.dashboard(); setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const openings = useMemo(() => (data?.openings || []).filter(x => (includeClosed || x.status === '진행중') && `${x.title} ${x.project}`.toLowerCase().includes(query.toLowerCase())), [data, query, includeClosed])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  return <div className="shell"><header className="topbar"><div><div className="brand-mark">KS</div><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></div><nav><button onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> 새로고침</button></nav></header>
    <div className="workspace"><aside className="opening-sidebar"><div className="sidebar-title"><span>RECRUITING REPORT</span><h2>채용 현황</h2></div><button className={`report-link ${selectedId === REPORT_ID ? 'active' : ''}`} onClick={() => setSelectedId(REPORT_ID)}><BarChart3 size={17} /><div><b>전체 채용 리포트</b><small>오픈 공고와 전형 진행 요약</small></div><ChevronRight size={15} /></button><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="공고·프로젝트 검색" />{query && <button onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="closed-toggle"><input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} /> 마감 공고 포함</label><div className="opening-list">{openings.map(opening => <button key={opening.id} className={selectedId === opening.id ? 'active' : ''} onClick={() => setSelectedId(opening.id)}><span className={`status-dot ${opening.status === '마감' ? 'closed' : ''}`} /><div><b>{opening.title}{isNewOpening(opening.postedAt) && <em className="new-badge">NEW</em>}</b><small>{opening.project || '프로젝트 미지정'} · 진행 {opening.candidates.length}명</small></div><ChevronRight size={15} /></button>)}</div></aside>
      <main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selectedId === REPORT_ID && data ? <OverviewReport data={data} /> : selected ? <OpeningBoard opening={selected} /> : <EmptyState />}</main></div>
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
  const issues = active.flatMap(opening => {
    const note = notes.get(opening.id)!
    const project = projectName(opening, note)
    const messages = []
    if (!opening.candidates.length) messages.push('진행 지원자 없음 · 이력서 검토 필요')
    if (!note.targetTo) messages.push('목표 TO 미입력')
    if (project === '프로젝트 미지정') messages.push('프로젝트 미지정')
    return messages.length ? [{ opening, project, message: messages.join(' / ') }] : []
  })
  const rows = [...active].sort((a, b) => Number(isNewOpening(b.postedAt)) - Number(isNewOpening(a.postedAt)) || b.candidates.length - a.candidates.length || a.title.localeCompare(b.title))
  const openReport = () => { setReportText(createSlackReport(active)); setCopied(false); setReportOpen(true) }
  const copyReport = async () => {
    try { await navigator.clipboard.writeText(reportText) }
    catch { const area = document.querySelector<HTMLTextAreaElement>('.report-textarea'); area?.select(); document.execCommand('copy') }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000)
  }
  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1><p>프로젝트별 오픈 직무와 현재 진행 상황을 한 화면에서 확인합니다.</p></div><div className="report-actions"><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div><button className="primary generate-report" onClick={openReport}><ClipboardCopy size={16} /> 리포트 생성하기</button></div></div>
    <div className="report-kpis"><Summary icon={BriefcaseBusiness} label="오픈 공고" value={`${active.length}개`} accent /><Summary icon={Target} label="목표 TO" value={targetTo ? `${targetTo}명` : '미입력'} /><Summary icon={UsersRound} label="진행 지원자" value={`${candidates.length}명`} /></div>
    {issues.length > 0 && <article className="attention-panel"><header><div><AlertTriangle size={17} /><span><b>확인 필요</b><small>지금 점검해야 할 공고 {issues.length}개</small></span></div></header><div>{issues.map(({ opening, project, message }) => <div className="attention-row" key={opening.id}><span><b>{project}</b><small>{roleName(opening, project)}</small></span><strong>{message}</strong></div>)}</div></article>}
    <article className="project-overview"><header><div><span>PROJECT OVERVIEW</span><h2>이번 채용 현황</h2></div><small>프로젝트별 TO와 핵심 진행 상황</small></header><div className="project-summary-table"><div className="project-summary-row project-summary-head"><span>프로젝트</span><span>오픈 공고</span><span>목표 TO</span><span>진행 지원자</span><span>현재 핵심 상황</span></div>{Array.from(projects.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([project, openings]) => { const projectCandidates = openings.reduce((sum, opening) => sum + opening.candidates.length, 0); const projectTo = openings.reduce((sum, opening) => sum + notes.get(opening.id)!.targetTo, 0); return <div className="project-summary-row" key={project}><span className="project-name"><b>{project}</b>{openings.some(opening => isNewOpening(opening.postedAt)) && <em className="new-badge">NEW</em>}</span><span><b>{openings.length}</b>개</span><span><b>{projectTo || '-'}</b>{projectTo ? '명' : ''}</span><span><b>{projectCandidates}</b>명</span><span className="key-situation">{[...openings].sort((a, b) => a.title.localeCompare(b.title, 'ko')).map(opening => <strong key={opening.id}><i>{roleName(opening, project)}</i>{openingSituation(opening, notes.get(opening.id)!)}</strong>)}</span></div> })}</div></article>
    <details className="opening-details"><summary><span><b>공고 상세 펼쳐보기</b><small>TO·전형 단계·채용 배경 전체 확인</small></span><ChevronDown size={18} /></summary><article className="opening-report"><header><div><span>OPEN POSITIONS</span><h2>오픈 공고별 진행 현황</h2></div><small>TO와 채용 배경은 이 브라우저에 저장된 메모 기준</small></header><div className="report-table"><div className="report-row report-header"><span>공고</span><span>TO 현황</span><span>진행 인원</span><span>현재 전형</span><span>채용 배경</span></div>{rows.map(opening => { const note = notes.get(opening.id)!; const remaining = Math.max(0, note.targetTo - opening.hiredCount); const counts = PIPELINE_STAGES.map(stage => ({ stage, count: opening.candidates.filter(candidate => candidate.stage === stage).length })).filter(item => item.count > 0); return <div className="report-row" key={opening.id}><span><b>{opening.title}{isNewOpening(opening.postedAt) && <em className="new-badge">NEW</em>}</b><small>{note.project || opening.project || '프로젝트 미지정'}</small></span><span><b>{note.targetTo ? `${opening.hiredCount}/${note.targetTo}명` : '미입력'}</b><small>{note.targetTo ? `잔여 ${remaining}명` : 'TO 메모 필요'}</small></span><span><b>{opening.candidates.length}명</b></span><span className="stage-chips">{counts.length ? counts.map(item => <i key={item.stage}>{item.stage} {item.count}</i>) : <small>진행 지원자 없음</small>}</span><span className="reason-cell">{note.reason || note.memo || <small>메모 없음</small>}</span></div> })}</div></article></details>
    {reportOpen && <div className="modal-backdrop" onMouseDown={() => setReportOpen(false)}><section className="modal report-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>SLACK REPORT</span><h2>슬랙 보고 문구</h2></div><button onClick={() => setReportOpen(false)}><X /></button></header><p className="local-help">현재 화면의 공고·지원자 현황과 이 브라우저의 TO·채용 배경·메모를 반영했습니다. 복사 전에 자유롭게 수정할 수 있습니다.</p><textarea className="report-textarea" value={reportText} onChange={e => setReportText(e.target.value)} /><div className="modal-actions"><span className="copy-status">{copied ? '복사했습니다.' : ''}</span><button className="outline" onClick={() => setReportOpen(false)}>닫기</button><button className="primary" onClick={copyReport}><ClipboardCopy size={15} /> Slack 문구 복사</button></div></section></div>}
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
