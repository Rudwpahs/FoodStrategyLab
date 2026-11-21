import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND, AI_CLIP_CHECK, CHECKLIST_ITEMS, SLOT_STATUS_LABELS, WEEKDAY_LABELS, addDays, slotTimeLabel, type SlotStatus } from '@mat-lab/recipe-core';
import { api, planApi, type PlanResponse, type PlanSlotView, type QueueCard } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { dragOffset, swipeAction } from '../swipe.ts';

/** 칸 상태 → 기존 배지 색 */
const BADGE: Record<SlotStatus, string> = { planned: 'draft', waiting: 'review', approved: 'approved', 'change-requested': 'error', posted: 'rendered', skipped: 'draft' };

/** 저장 형식('2026-11-24T18:00:00+09:00')은 이미 한국 시간이라 글자만 잘라 쓴다 */
const dateOf = (at: string) => at.slice(0, 10);
const timeOf = (at: string) => at.slice(11, 16);
const weekdayOf = (date: string) => WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const longDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const whenLabel = (at: string) => `${weekdayOf(dateOf(at))} ${md(dateOf(at))} ${timeOf(at)}`;

const EXAMPLES = ['첫 장면을 더 궁금하게', '대사를 더 짧고 쉽게', '맛조수 반응을 더 크게', '마지막을 더 따뜻하게'];

const weekFromHash = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('week') ?? undefined;

export const PlanPage: React.FC = () => {
  const { run, notify, user, researcherSet } = useApp();
  const [week, setWeek] = useState<string | undefined>(weekFromHash());
  const [data, setData] = useState<PlanResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [approving, setApproving] = useState<QueueCard | null>(null);
  const [changing, setChanging] = useState<QueueCard | null>(null);
  const [moving, setMoving] = useState<PlanSlotView | null>(null);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const r = await run(() => planApi.get(week));
    if (r) setData(r);
    else setFailed(true);
  }, [run, week]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const on = () => setWeek(weekFromHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  // 연구자 계정이 정해져 있으면 승인은 연구자 계정만 (서버도 같은 규칙으로 막는다)
  const canApprove = !user || !researcherSet || user.role === 'researcher';

  const planNext = async () => {
    setPlanning(true);
    const r = await run(() => planApi.planNextWeek());
    setPlanning(false);
    if (!r) return;
    setData(r);
    navigate(`/plan?week=${r.weekStart}`);
    notify(r.created.length ? `다음 주 칸 ${r.created.length}개에 콘텐츠를 넣었어요` : r.unplanned ? '다음 주에 빈 날이 없어요' : '계획에 넣을 콘텐츠가 없어요. 새 콘텐츠를 만들어 주세요');
  };

  if (!data)
    return failed ? (
      <div className="card empty">
        <h2>계획을 불러오지 못했어요</h2>
        <div>인터넷 연결을 확인하고 다시 불러와 주세요.</div>
        <button className="btn primary" onClick={() => void load()}>다시 불러오기</button>
      </div>
    ) : (
      <div className="loading">계획을 불러오는 중…</div>
    );

  const thisWeek = addDays(data.today, -((new Date(`${data.today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const weekLabel = data.weekStart === thisWeek ? '이번 주' : data.weekStart === addDays(thisWeek, 7) ? '다음 주' : data.weekStart === addDays(thisWeek, -7) ? '지난 주' : '';

  return (
    <div className="stack plan">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>주간 계획</h1>
          <p className="lead">올릴 날과 시간을 정하고, 완성된 영상은 밀어서 승인하거나 고쳐 달라고 해요.</p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={planNext} disabled={planning}>
          {planning ? '계획 세우는 중…' : '다음 주 계획 세우기'}
        </button>
      </div>

      <QueueSection data={data} canApprove={canApprove} onApprove={setApproving} onChange={setChanging} />

      <section className="stack" aria-label="주간 달력">
        <div className="plan-nav">
          <button className="btn small" onClick={() => navigate(`/plan?week=${addDays(data.weekStart, -7)}`)} aria-label="이전 주 보기">‹ 이전</button>
          <h2 className="week num">
            {weekLabel && <span className="badge">{weekLabel}</span>} {longDay(data.days[0]!)} – {longDay(data.days[6]!)}
          </h2>
          <button className="btn small" onClick={() => navigate(`/plan?week=${addDays(data.weekStart, 7)}`)} aria-label="다음 주 보기">다음 ›</button>
        </div>
        {data.weekStart !== thisWeek && (
          <div>
            <button className="btn small ghost" onClick={() => navigate('/plan')}>이번 주로 돌아가기</button>
          </div>
        )}
        <div className="small muted">
          올리는 시간 <b className="num">{data.times.times.map(slotTimeLabel).join(' · ')}</b> — {data.times.reason}
          {data.unplanned > 0 && <> · 아직 계획에 없는 콘텐츠 <b className="num">{data.unplanned}</b>개</>}
        </div>
        <div className="plan-week">
          {data.days.map((d) => {
            const slots = data.slots.filter((s) => dateOf(s.at) === d);
            return (
              <div key={d} className={`plan-day${d === data.today ? ' today' : ''}${slots.length ? '' : ' empty'}`} aria-label={`${weekdayOf(d)}요일 ${longDay(d)}`}>
                <div className="plan-day-head">
                  <b>{weekdayOf(d)}</b>
                  <span className="num">{md(d)}</span>
                  {d === data.today && <span className="today-mark">오늘</span>}
                </div>
                {slots.map((s) => (
                  <SlotItem key={s.id} slot={s} onMove={() => setMoving(s)} onRemove={async () => {
                    if (!confirm(`${s.dishName || s.topic}을(를) 계획에서 뺄까요? 콘텐츠는 지워지지 않아요.`)) return;
                    if (await run(() => planApi.removeSlot(s.id), '계획에서 뺐어요')) void load();
                  }} />
                ))}
                {!slots.length && <div className="plan-empty-day">비어 있음</div>}
              </div>
            );
          })}
        </div>
      </section>

      {approving && <ApproveSheet card={approving} canApprove={canApprove} onClose={() => setApproving(null)} onDone={() => { setApproving(null); void load(); }} />}
      {changing && <ChangeSheet card={changing} available={data.revise.available} onClose={() => setChanging(null)} onDone={() => { setChanging(null); void load(); }} />}
      {moving && <MoveSheet slot={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); void load(); }} />}
    </div>
  );
};

const Thumb: React.FC<{ url: string | null; className: string }> = ({ url, className }) =>
  url ? <img className={className} src={url} alt="" loading="lazy" /> : <div className={className} aria-hidden="true">영상 전</div>;

const SlotItem: React.FC<{ slot: PlanSlotView; onMove: () => void; onRemove: () => void }> = ({ slot, onMove, onRemove }) => (
  <article className="plan-slot" data-slot={slot.id} data-project={slot.projectId}>
    <Thumb url={slot.coverUrl} className="plan-thumb" />
    <div style={{ minWidth: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className="time">{timeOf(slot.at)}</span>
        <span className={`badge ${BADGE[slot.status]}`}>{SLOT_STATUS_LABELS[slot.status]}</span>
      </div>
      <a className="dish" href={`#/p/${slot.projectId}`}>{slot.dishName || slot.topic}</a>
    </div>
    {slot.status !== 'posted' && (
      <div className="actions">
        <button className="btn small ghost" onClick={onMove}>옮기기</button>
        <button className="btn small ghost danger" onClick={onRemove}>빼기</button>
      </div>
    )}
  </article>
);

const QueueSection: React.FC<{ data: PlanResponse; canApprove: boolean; onApprove: (c: QueueCard) => void; onChange: (c: QueueCard) => void }> = ({ data, canApprove, onApprove, onChange }) => (
  <section className="card stack" aria-label="승인 대기">
    <div className="card-head">
      <h2>승인 대기</h2>
      <span className="muted num">{data.queue.length}개</span>
    </div>
    {data.queue.length === 0 ? (
      <div className="small muted">승인을 기다리는 영상이 없어요. 계획에 넣은 콘텐츠의 영상이 완성되면 여기에 나와요.</div>
    ) : (
      <>
        <div className="small muted">
          카드를 <b>오른쪽으로 밀면 승인</b>(확인 항목을 본 뒤), <b>왼쪽으로 밀면 수정 요청</b>이에요. 아래 버튼으로도 할 수 있어요.
          {!canApprove && ' 승인은 연구자 계정만 할 수 있어요. 수정 요청은 누구나 보낼 수 있어요.'}
        </div>
        <div className="queue">
          {data.queue.map((c) => (
            <SwipeCard key={c.slotId} card={c} canApprove={canApprove} onApprove={() => onApprove(c)} onChange={() => onChange(c)} />
          ))}
        </div>
      </>
    )}
  </section>
);

const SOURCE_LABEL: Record<string, string> = { template: '템플릿', 'ai-paste': 'AI 붙여넣기', 'ai-story': 'AI 이야기', 'ai-revise': 'AI 수정', edit: '직접 수정' };

/** 밀어서 고르는 카드 (손가락·마우스로 끌기, 버튼으로도) */
const SwipeCard: React.FC<{ card: QueueCard; canApprove: boolean; onApprove: () => void; onChange: () => void }> = ({ card, canApprove, onApprove, onChange }) => {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [video, setVideo] = useState(false);
  const blocked = card.fidelityErrors.length > 0 || card.aiPending;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, video, input, textarea')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDx(dragOffset(e.clientX - start.current.x, e.clientY - start.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDx(0);
    if (!s || s.id !== e.pointerId) return;
    const action = swipeAction(e.clientX - s.x, e.clientY - s.y);
    if (action === 'approve') onApprove();
    if (action === 'change') onChange();
  };

  return (
    <div className="swipe" data-dir={dx > 20 ? 'right' : dx < -20 ? 'left' : ''}>
      <div className="swipe-hint" aria-hidden="true">
        <span className="hint-left">수정 요청</span>
        <span className="hint-right">승인</span>
      </div>
      <article
        className={`swipe-card${dx ? ' dragging' : ''}`}
        data-project={card.projectId}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <div className="queue-media">
          {video ? <video className="queue-thumb" src={card.videoUrl} poster={card.coverUrl ?? undefined} controls playsInline autoPlay /> : <Thumb url={card.coverUrl} className="queue-thumb" />}
          <button className="btn small ghost queue-play" onClick={() => setVideo((v) => !v)}>{video ? '영상 닫기' : '▶ 영상 보기'}</button>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="small muted num">{whenLabel(card.at)} 올릴 예정</div>
          <div className="queue-title">{card.dishName || card.topic}</div>
          <div className="small">{card.title}</div>
          <div className="small muted queue-line">“{card.firstLine}”</div>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">대본 v{card.version} · {SOURCE_LABEL[card.source] ?? card.source}</span>
            <a className="small" href={`#/p/${card.projectId}/review`}>자세히 검수</a>
          </div>
          {card.fidelityErrors.length > 0 && <div className="issue error small">원본 레시피와 다른 곳 {card.fidelityErrors.length}건: 고쳐야 승인할 수 있어요.</div>}
          {card.aiPending && <div className="issue warning small">AI가 채운 칸(주제·원리)을 검수 화면에서 먼저 확인해 주세요.</div>}
          {card.qaErrors.length > 0 && <div className="issue warning small">영상 자동 검사 문제 {card.qaErrors.length}건: 직접 보고 확인한 뒤 승인할 수 있어요.</div>}
        </div>
        <div className="queue-actions">
          <button className="btn" onClick={onChange}>← 고쳐 주세요</button>
          <button className="btn primary" onClick={onApprove} disabled={!canApprove || blocked} title={!canApprove ? '승인은 연구자 계정만 할 수 있어요' : blocked ? '검수 화면에서 먼저 확인할 것이 있어요' : ''}>
            승인 →
          </button>
        </div>
      </article>
    </div>
  );
};

/** 승인 확인창: 검수 화면과 같은 확인 항목 4개를 모두 체크해야 승인 (같은 검수 API를 부른다) */
const ApproveSheet: React.FC<{ card: QueueCard; canApprove: boolean; onClose: () => void; onDone: () => void }> = ({ card, canApprove, onClose, onDone }) => {
  const { run, user, notify } = useApp();
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [qaSeen, setQaSeen] = useState(false);
  const [reviewer, setReviewer] = useState(user?.displayName ?? BRAND.researcher);
  const [busy, setBusy] = useState(false);
  const blocked = card.fidelityErrors.length > 0 || card.aiPending;
  const items = [...CHECKLIST_ITEMS, ...(card.aiClips ? [AI_CLIP_CHECK] : [])];
  const ready = canApprove && !blocked && items.every((c) => checklist[c.key]) && (card.qaErrors.length === 0 || qaSeen) && reviewer.trim().length > 0;

  const approve = async () => {
    setBusy(true);
    const p = await run(
      () => api.review(card.projectId, { version: card.version, reviewer, checklist, decision: 'approved', note: '계획 화면에서 승인', acceptQa: card.qaErrors.length > 0 }),
      `승인했어요. ${whenLabel(card.at)}에 올릴 준비가 됐어요`,
    );
    setBusy(false);
    if (!p) return;
    if (p.warning) notify(p.warning, true);
    onDone();
  };

  return (
    <Sheet title="승인 전 확인" onClose={onClose} busy={busy}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <video className="sheet-video" src={card.videoUrl} poster={card.coverUrl ?? undefined} controls playsInline />
        <div className="stack small" style={{ flex: '1 1 160px', gap: 4 }}>
          <b style={{ fontSize: 16 }}>{card.dishName || card.topic}</b>
          <div>{card.title}</div>
          <div className="muted num">대본 v{card.version} · {whenLabel(card.at)} 올릴 예정</div>
          <a href={`#/p/${card.projectId}/review`}>검수 화면에서 원본과 나란히 보기</a>
        </div>
      </div>
      {card.fidelityErrors.map((m, i) => (
        <div key={i} className="issue error small"><b>원본과 다름</b> {m}</div>
      ))}
      {card.aiPending && <div className="issue warning small">사진에서 읽을 때 AI가 채운 칸을 먼저 확인해야 승인할 수 있어요. [검수 화면]에서 확인해 주세요.</div>}
      {!canApprove && <div className="issue warning small">승인은 연구자 계정만 할 수 있어요. 연구자 계정으로 로그인해 주세요.</div>}
      {items.map((c) => (
        <label key={c.key} className={`check ${checklist[c.key] ? 'on' : ''}`}>
          <input type="checkbox" checked={!!checklist[c.key]} onChange={(e) => setChecklist((p) => ({ ...p, [c.key]: e.target.checked }))} />
          {c.label}
        </label>
      ))}
      {card.qaErrors.length > 0 && (
        <div className="issue warning small stack" style={{ gap: 6 }}>
          <div>영상 자동 검사에서 문제 {card.qaErrors.length}건이 나왔어요. 영상을 다시 만드는 편을 권해요.</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{card.qaErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={qaSeen} onChange={(e) => setQaSeen(e.target.checked)} />
            영상을 직접 보고 들어서 괜찮다고 확인했어요
          </label>
        </div>
      )}
      {!user && (
        <label className="field">
          검수자
          <input type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </label>
      )}
      <div className="small muted">승인은 이 대본(v{card.version})에만 해당해요. 대본·원본을 고치면 다시 승인받아야 해요.</div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose} disabled={busy}>취소</button>
        <button className="btn primary big" onClick={approve} disabled={!ready || busy}>{busy ? '승인하는 중…' : '승인하기'}</button>
      </div>
    </Sheet>
  );
};

/** 쉬운 말로 수정 요청: Claude가 고친 대본은 새 버전이 되고, 검수용 영상을 다시 만든다 */
const ChangeSheet: React.FC<{ card: QueueCard; available: boolean; onClose: () => void; onDone: () => void }> = ({ card, available, onClose, onDone }) => {
  const { run, notify } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const editHref = `#/p/${card.projectId}/script?edit`;

  const send = async () => {
    setBusy(true);
    const r = await run(() => planApi.revise(card.projectId, text, card.version));
    setBusy(false);
    if (!r) return;
    notify(`고친 대본(v${r.version})으로 영상을 다시 만들기 시작했어요. ${r.changes}`.trim());
    onDone();
  };

  return (
    <Sheet title="무엇을 바꿀까요?" onClose={onClose} busy={busy}>
      <div className="small">
        <b>{card.dishName || card.topic}</b> · {card.title} <span className="muted num">(대본 v{card.version})</span>
      </div>
      {available ? (
        <>
          <label className="field">
            <span className="sr-only">무엇을 바꿀까요?</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={300} placeholder="예: 첫 장면을 더 궁금하게, 대사를 더 짧게" disabled={busy} />
          </label>
          <div className="chips" aria-label="예시">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => setText(ex)} disabled={busy}>{ex}</button>
            ))}
          </div>
          <div className="small muted">재료·분량·순서는 원본 그대로 둬요. 고친 대본은 새 버전이 되어 다시 승인받아야 하고, 검수용 영상을 새로 만들어요 (몇 분 걸려요). Claude 사용료가 조금 들어요.</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <a className="small" href={editHref}>대본 직접 고치기</a>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={onClose} disabled={busy}>취소</button>
              <button className="btn primary" onClick={send} disabled={busy || text.trim().length < 2}>{busy ? '고치는 중… (1분쯤)' : '고쳐 달라고 하기'}</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="issue info">말로 고치기는 서버에 Claude API가 설정돼야 쓸 수 있어요. 대본을 직접 고칠 수 있어요 (고치면 새 버전이 되어 다시 승인받아요).</div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>닫기</button>
            <a className="btn primary" href={editHref}>대본 직접 고치기</a>
          </div>
        </>
      )}
    </Sheet>
  );
};

/** 다른 날·시간으로 옮기기 (한국 시간) */
const MoveSheet: React.FC<{ slot: PlanSlotView; onClose: () => void; onDone: () => void }> = ({ slot, onClose, onDone }) => {
  const { run } = useApp();
  const [at, setAt] = useState(slot.at.slice(0, 16));
  const save = async () => {
    if (await run(() => planApi.moveSlot(slot.id, at), '옮겼어요')) onDone();
  };
  return (
    <Sheet title="올릴 날·시간 바꾸기" onClose={onClose}>
      <div className="small"><b>{slot.dishName || slot.topic}</b> · 지금 {whenLabel(slot.at)}</div>
      <label className="field">
        새 날짜·시간 (한국 시간)
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn primary" onClick={save} disabled={!at}>옮기기</button>
      </div>
    </Sheet>
  );
};
