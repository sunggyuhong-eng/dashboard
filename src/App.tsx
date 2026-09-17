import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Check, ChevronRight, Clock3, ExternalLink, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
import { api } from './api'
import { PIPELINE_STAGES, type DashboardData, type Opening } from './types'

type OpeningNote = { targetTo: number; reason: string; project: string; memo: string }
const NOTE_PREFIX = 'kong-recruiting-note:'
const NEW_DAYS = 7

function noteKey(openingId: string) { return `${NOTE_PREFIX}${openingId}` }
function loadNote(opening: Opening): OpeningNote {
  const fallback = { targetTo: opening.targetTo, reason: opening.reason, project: opening.project, memo: '' }
  try { const saved = localStorage.getItem(noteKey(opening.id)); return saved ? { ...fallback, ...JSON.parse(saved) } : fallback }
  catch { return fallback }
}
function isNewOpening(postedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return false
  const age = Date.now() - new Date(`${postedAt}T00:00:00+09:00`).getTime()
  return age >= 0 && age < NEW_DAYS * 24 * 60 * 60 * 1000
}

export default function App() { return <Dashboard /> }

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const load = async () => {
    setLoading(true); setError('')
    try {
      const next = await api.dashboard(); setData(next)
      setSelectedId(id => id && next.openings.some(x => x.id === id) ? id : next.openings.find(x => x.status === '진행중')?.id || next.openings[0]?.id || '')
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const openings = useMemo(() => (data?.openings || []).filter(x => (includeClosed || x.status === '진행중') && `${x.title} ${x.project}`.toLowerCase().includes(query.toLowerCase())), [data, query, includeClosed])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  return <div className="shell"><header className="topbar"><div><div className="brand-mark">KS</div><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></div><nav><button onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> 새로고침</button></nav></header>
    <div className="workspace"><aside className="opening-sidebar"><div className="sidebar-title"><span>OPEN POSITIONS</span><h2>채용 공고</h2></div><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="공고·프로젝트 검색" />{query && <button onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="closed-toggle"><input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} /> 마감 공고 포함</label><div className="opening-list">{openings.map(opening => <button key={opening.id} className={selectedId === opening.id ? 'active' : ''} onClick={() => setSelectedId(opening.id)}><span className={`status-dot ${opening.status === '마감' ? 'closed' : ''}`} /><div><b>{opening.title}{isNewOpening(opening.postedAt) && <em className="new-badge">NEW</em>}</b><small>{opening.project || '프로젝트 미지정'} · 진행 {opening.candidates.length}명</small></div><ChevronRight size={15} /></button>)}</div></aside>
      <main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selected ? <OpeningBoard opening={selected} /> : <EmptyState />}</main></div>
    <footer><span>마지막 동기화 {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</span><span>진행 지원자 {data?.candidateCount || 0}명</span></footer>
  </div>
}

function OpeningBoard({ opening }: { opening: Opening }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState<OpeningNote>(() => loadNote(opening))
  const [form, setForm] = useState<OpeningNote>(() => loadNote(opening))
  useEffect(() => { const next = loadNote(opening); setNote(next); setForm(next); setEditing(false) }, [opening])
  const remaining = Math.max(0, note.targetTo - opening.hiredCount)
  const save = () => {
    const next = { ...form, targetTo: Math.max(0, Number(form.targetTo) || 0) }
    localStorage.setItem(noteKey(opening.id), JSON.stringify(next)); setNote(next); setEditing(false); setNotice('이 브라우저에 메모를 저장했어요')
    window.setTimeout(() => setNotice(''), 2500)
  }
  return <section className="opening-view"><div className="opening-head"><div><span className="eyebrow">{opening.status === '진행중' ? 'ACTIVE OPENING' : 'CLOSED OPENING'}{isNewOpening(opening.postedAt) && <em className="new-badge head-badge">NEW</em>}</span><h1>{opening.title}</h1><p>{note.project || opening.project || '프로젝트 미지정'}{opening.url && <a href={opening.url} target="_blank" rel="noreferrer">게임잡 공고 <ExternalLink size={13} /></a>}</p></div><button className="outline" onClick={() => { setForm(note); setEditing(true) }}><Settings2 size={16} /> TO·메모 편집</button></div>
    <div className="summary-grid"><Summary icon={Target} label="목표 TO" value={`${note.targetTo}명`} /><Summary icon={Check} label="충원 완료" value={`${opening.hiredCount}명`} /><Summary icon={BriefcaseBusiness} label="잔여 TO" value={`${remaining}명`} accent /><Summary icon={UsersRound} label="진행 지원자" value={`${opening.candidates.length}명`} /></div>
    <div className="note-grid"><article className="reason-card"><span>채용 배경</span><p>{note.reason || '채용 배경을 입력해 주세요.'}</p></article><article className="reason-card"><span>메모</span><p>{note.memo || '이 공고에 대한 메모를 입력해 주세요.'}</p></article></div>
    <div className="board-title"><div><span>HIRING PIPELINE</span><h2>전형 진행 현황</h2></div><p><Clock3 size={14} /> Google Sheet의 최신 진행 단계를 표시합니다.</p></div>
    <div className="kanban">{PIPELINE_STAGES.map(stage => { const candidates = opening.candidates.filter(x => x.stage === stage); return <section className="lane" key={stage}><header><b>{stage}</b><span>{candidates.length}</span></header><div className="lane-body">{candidates.map(candidate => <article className="candidate" key={candidate.id}><b>{candidate.name}</b><small>{candidate.project || note.project || opening.project || '프로젝트 미지정'}</small></article>)}{!candidates.length && <div className="lane-empty">지원자 없음</div>}</div></section> })}</div>
    {notice && <div className="toast">{notice}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><section className="modal" onMouseDown={e => e.stopPropagation()}><header><div><span>LOCAL NOTE</span><h2>TO·채용 메모</h2></div><button onClick={() => setEditing(false)}><X /></button></header><p className="local-help">이 내용은 현재 브라우저에만 저장되며 Google Sheet에는 반영되지 않습니다.</p><label>프로젝트<input value={form.project} onChange={e => setForm({ ...form, project: e.target.value })} /></label><label>목표 TO<input type="number" min="0" value={form.targetTo} onChange={e => setForm({ ...form, targetTo: Number(e.target.value) })} /></label><label>채용 배경<textarea rows={4} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label><label>메모<textarea rows={4} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={() => setEditing(false)}>취소</button><button className="primary" onClick={save}>이 브라우저에 저장</button></div></section></div>}
  </section>
}

function Summary({ icon: Icon, label, value, accent = false }: { icon: typeof Target; label: string; value: string; accent?: boolean }) { return <article className={`summary ${accent ? 'accent' : ''}`}><Icon size={18} /><div><span>{label}</span><b>{value}</b></div></article> }
function Loading({ label }: { label: string }) { return <div className="state"><RefreshCw className="spin" /><b>{label}</b></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state"><b>데이터를 불러오지 못했어요</b><p>{message}</p><button onClick={retry}>다시 시도</button></div> }
function EmptyState() { return <div className="state"><BriefcaseBusiness /><b>표시할 공고가 없어요</b><p>GitHub Actions에서 데이터 동기화를 실행해 주세요.</p></div> }
