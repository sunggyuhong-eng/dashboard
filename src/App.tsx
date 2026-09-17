import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, Check, ChevronRight, Clock3, ExternalLink, FileText, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
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
const ASSESSMENT_STAGES: PipelineStage[] = ['온라인 과제', '코딩테스트', '역량검사']
const OFFER_STAGES: PipelineStage[] = ['면접합격', '처우단계', 'Offer']

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
  const active = data.openings.filter(opening => opening.status === '진행중')
  const notes = new Map(active.map(opening => [opening.id, loadNote(opening)]))
  const candidates = active.flatMap(opening => opening.candidates)
  const stageCounts = PIPELINE_STAGES.map(stage => ({ stage, count: candidates.filter(candidate => candidate.stage === stage).length })).filter(item => item.count > 0)
  const newCount = active.filter(opening => isNewOpening(opening.postedAt)).length
  const assessmentCount = candidates.filter(candidate => ASSESSMENT_STAGES.includes(candidate.stage)).length
  const interviewCount = candidates.filter(candidate => candidate.stage.includes('면접')).length
  const offerCount = candidates.filter(candidate => OFFER_STAGES.includes(candidate.stage)).length
  const maxStage = Math.max(1, ...stageCounts.map(item => item.count))
  const rows = [...active].sort((a, b) => Number(isNewOpening(b.postedAt)) - Number(isNewOpening(a.postedAt)) || b.candidates.length - a.candidates.length || a.title.localeCompare(b.title))
  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1><p>오픈 공고와 지원자의 현재 전형 단계를 한 화면에서 확인합니다.</p></div><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div></div>
    <div className="report-kpis"><Summary icon={BriefcaseBusiness} label="오픈 공고" value={`${active.length}개`} accent /><Summary icon={UsersRound} label="진행 지원자" value={`${candidates.length}명`} /><Summary icon={Target} label="과제·검사" value={`${assessmentCount}명`} /><Summary icon={Clock3} label="면접 진행" value={`${interviewCount}명`} /><Summary icon={Check} label="합격·처우" value={`${offerCount}명`} /></div>
    <div className="report-panels"><article className="report-panel"><header><div><span>PIPELINE</span><h2>단계별 진행 인원</h2></div><small>현재 단계 기준</small></header><div className="stage-bars">{stageCounts.length ? stageCounts.map(item => <div className="stage-bar" key={item.stage}><span>{item.stage}</span><div><i style={{ width: `${Math.max(8, item.count / maxStage * 100)}%` }} /></div><b>{item.count}명</b></div>) : <p className="muted">진행 중인 지원자가 없습니다.</p>}</div></article><article className="report-panel signals"><header><div><span>SUMMARY</span><h2>이번 채용 현황</h2></div></header><div><p><b>{active.length}개</b><span>현재 오픈 공고</span></p><p><b>{newCount}개</b><span>최근 7일 신규 공고</span></p><p><b>{active.filter(opening => opening.candidates.length === 0).length}개</b><span>진행 지원자 없는 공고</span></p><p><b>{active.filter(opening => opening.candidates.length > 0).length}개</b><span>전형 진행 중 공고</span></p></div></article></div>
    <article className="opening-report"><header><div><span>OPEN POSITIONS</span><h2>오픈 공고별 진행 현황</h2></div><small>TO와 채용 배경은 이 브라우저에 저장된 메모 기준</small></header><div className="report-table"><div className="report-row report-header"><span>공고</span><span>TO 현황</span><span>진행 인원</span><span>현재 전형</span><span>채용 배경</span></div>{rows.map(opening => { const note = notes.get(opening.id)!; const remaining = Math.max(0, note.targetTo - opening.hiredCount); const counts = PIPELINE_STAGES.map(stage => ({ stage, count: opening.candidates.filter(candidate => candidate.stage === stage).length })).filter(item => item.count > 0); return <div className="report-row" key={opening.id}><span><b>{opening.title}{isNewOpening(opening.postedAt) && <em className="new-badge">NEW</em>}</b><small>{note.project || opening.project || '프로젝트 미지정'}</small></span><span><b>{note.targetTo ? `${opening.hiredCount}/${note.targetTo}명` : '미입력'}</b><small>{note.targetTo ? `잔여 ${remaining}명` : 'TO 메모 필요'}</small></span><span><b>{opening.candidates.length}명</b></span><span className="stage-chips">{counts.length ? counts.map(item => <i key={item.stage}>{item.stage} {item.count}</i>) : <small>진행 지원자 없음</small>}</span><span className="reason-cell">{note.reason || note.memo || <small>메모 없음</small>}</span></div> })}</div></article>
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
