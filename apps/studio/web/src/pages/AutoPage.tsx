import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { POST_STATUS, REPLY_STATUS, autoApi, whenKst, type AutoOverview, type AutoPost, type DryRun, type RuleDraft } from '../autoApi.ts';
import { useApp } from '../App.tsx';

const newRule = (): RuleDraft => ({ id: `n${Date.now().toString(36)}`, keywords: '', reply: '', dmText: '', dmLink: '', enabled: true });
const toDrafts = (o: AutoOverview): RuleDraft[] => o.rules.map((r) => ({ ...r, keywords: r.keywords.join(', ') }));

/**
 * 자동 게시(예약)·댓글 답장 (#/auto).
 * 두 기능 모두 기본은 꺼짐이고, 켜면 실제 인스타그램 계정에서 움직인다. '먼저 시험'은 Meta를 부르지 않고 무엇이 일어날지만 보여 준다.
 */
export const AutoPage: React.FC = () => {
  const { run, user, researcherSet } = useApp();
  const [o, setO] = useState<AutoOverview | null>(null);
  const [failed, setFailed] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [sample, setSample] = useState('');
  const [sampleResult, setSampleResult] = useState<Awaited<ReturnType<typeof autoApi.testComment>> | null>(null);
  const canControl = !user || !researcherSet || user.role === 'researcher';

  const apply = useCallback((next: AutoOverview, resetRules = false) => {
    setO(next);
    if (resetRules) {
      setRules(toDrafts(next));
      setDirty(false);
    }
  }, []);
  const load = useCallback(
    (resetRules = false) =>
      autoApi.overview().then(
        (next) => {
          setFailed('');
          apply(next, resetRules);
        },
        (e: Error) => setFailed(e.message),
      ),
    [apply],
  );
  useEffect(() => {
    void load(true);
    // 기록이 바뀌는 것을 보도록 30초마다 다시 읽는다 (고치던 규칙은 그대로 둔다)
    const t = setInterval(() => void load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!o)
    return failed ? (
      <div className="card empty stack">
        <div>자동 게시 설정을 불러오지 못했어요. {failed}</div>
        <button className="btn primary" onClick={() => void load(true)}>다시 불러오기</button>
      </div>
    ) : (
      <div className="loading">자동 게시 설정을 불러오는 중…</div>
    );

  const ig = o.instagram;
  const account = ig.connected ? `@${ig.username}` : '연결된 계정';

  const toggle = async (key: 'autoPost' | 'commentReplies', on: boolean) => {
    if (on) {
      const what = key === 'autoPost' ? `예약한 시각에 승인된 영상을 실제 인스타그램 계정(${account})에 올려요.` : `규칙에 맞는 새 댓글에 실제 인스타그램 계정(${account})으로 답글을 달고 DM을 보내요.`;
      if (!confirm(`${what}\n올라간 글·답글은 인스타그램 앱에서만 지울 수 있어요. 켤까요?`)) return;
    }
    const next = await run(() => autoApi.setSettings({ [key]: on, confirm: on }), on ? '켰어요' : '껐어요');
    if (next) apply(next);
  };

  const saveRules = async () => {
    const next = await run(() => autoApi.setRules(rules), '댓글 규칙을 저장했어요');
    if (next) apply(next, true);
  };
  const edit = (i: number, patch: Partial<RuleDraft>) => {
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  return (
    <div className="stack auto-page">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>자동 게시 · 댓글 답장</h2>
        <div className="muted small">
          두 기능 모두 처음에는 꺼져 있어요. 켜면 스튜디오가 <b>실제 인스타그램 계정</b>에서 직접 움직여요. 켜기 전에 아래 <b>먼저 시험</b>으로 무엇이 일어날지 확인해 보세요.
        </div>
        {!ig.configured ? (
          <div className="issue info">인스타그램 앱 정보가 서버에 아직 없어요 (관리자 설정 전). 켜 두어도 아무것도 올라가지 않아요.</div>
        ) : ig.connected ? (
          <div className="row small">
            <span className="badge approved">{account} 연결됨</span>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {ig.problem && <div className="issue warning">{ig.problem}</div>}
            <div className="issue warning">인스타그램 계정이 연결되지 않았어요. 켜 두어도 연결될 때까지 쉬어요.</div>
            <div className="row">
              <button
                className="btn small primary"
                onClick={async () => {
                  const r = await run(() => api.instagramConnect());
                  if (r) window.location.href = r.url;
                }}
              >
                인스타그램 계정 연결
              </button>
            </div>
          </div>
        )}
        {!canControl && <div className="issue info">켜기·끄기와 댓글 규칙은 연구자 계정만 바꿀 수 있어요. 예약 확인과 기록은 볼 수 있어요.</div>}
      </div>

      {/* ───── 예약 게시 ───── */}
      <div className="card stack">
        <div className="card-head">
          <h2>예약 게시</h2>
          <span className="muted">게시 화면에서 날짜·시간을 고르거나, 주간 계획에서 승인된 칸</span>
        </div>
        <label className={`check${o.settings.autoPost ? ' on' : ''}`}>
          <input type="checkbox" aria-label="예약 게시 켜기" checked={o.settings.autoPost} disabled={!canControl} onChange={(e) => void toggle('autoPost', e.target.checked)} />
          <span className="stack" style={{ gap: 2 }}>
            <b>예약 게시 {o.settings.autoPost ? '켜짐' : '꺼짐'}</b>
            <span className="small muted">켜면 예약 시각에 실제 인스타그램 계정({account})에 릴스가 올라가요. 올리기 직전에 연구자 승인·최신 대본·설명 글을 다시 확인하고, 하나라도 안 맞으면 올리지 않아요.</span>
          </span>
        </label>
        <label className="field small">
          24시간에 자동으로 올릴 최대 개수
          <select
            value={o.settings.dailyMax}
            disabled={!canControl}
            onChange={async (e) => {
              const next = await run(() => autoApi.setSettings({ dailyMax: Number(e.target.value) }), '바꿨어요');
              if (next) apply(next);
            }}
          >
            {Array.from({ length: o.maxDaily }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </label>
        <div className="muted small">최근 24시간 자동 게시 {o.postedLast24h}개. 인스타그램 자체 한도(24시간 50개 안팎)에 닿으면 한 시간씩 미뤄요.</div>
        {o.last.posts && <div className="small muted">마지막 확인 {whenKst(o.last.posts.at)}: {o.last.posts.message}</div>}

        <b className="small">다가오는 예약</b>
        {o.scheduled.length === 0 && o.planSlots.length === 0 && <div className="muted small">예약이 없어요. 콘텐츠의 [게시] 화면에서 “예약 게시”로 날짜·시간을 고르세요.</div>}
        {o.scheduled.map((p) => (
          <PostRow key={p.id} post={p} onChange={() => void load(false)} />
        ))}
        {o.planSlots.map((s) => (
          <div key={`slot-${s.id}`} className="panel row small">
            <span className="badge">주간 계획</span>
            <b>{whenKst(s.at)}</b>
            <a href={`#/p/${s.projectId}/publish`}>콘텐츠 #{s.projectId}</a>
          </div>
        ))}
        <div className="issue info small">
          클라우드 서버는 20분 동안 아무도 쓰지 않으면 잠들어요. 잠든 동안에는 예약을 올리지 못하니, 예약 시각 30분 안쪽에 스튜디오를 한 번 열어 주세요 (열면 올릴 때까지 깨어 있어요). 6시간 넘게 지난 예약은 늦게 올리지 않고 ‘실패’로 남겨요.
        </div>
      </div>

      {/* ───── 댓글 답장 ───── */}
      <div className="card stack">
        <div className="card-head">
          <h2>댓글 답장</h2>
          <span className="muted">정한 단어가 들어간 새 댓글에 답글 + DM</span>
        </div>
        <label className={`check${o.settings.commentReplies ? ' on' : ''}`}>
          <input type="checkbox" aria-label="댓글 답장 켜기" checked={o.settings.commentReplies} disabled={!canControl} onChange={(e) => void toggle('commentReplies', e.target.checked)} />
          <span className="stack" style={{ gap: 2 }}>
            <b>댓글 답장 {o.settings.commentReplies ? '켜짐' : '꺼짐'}</b>
            <span className="small muted">켜면 실제 인스타그램 계정({account})으로 공개 답글을 달고, 적어 둔 DM을 보내요. 켠 뒤에 달린 댓글에만, 한 댓글에 한 번만 답해요 (5분마다 확인).</span>
          </span>
        </label>
        {ig.connected && ig.commentScopes !== 'yes' && (
          <div className="issue warning stack" style={{ gap: 6 }}>
            <div>{ig.commentScopes === 'no' ? '지금 연결에는 댓글·DM 권한이 없어요.' : '지금 연결에 댓글·DM 권한이 있는지 알 수 없어요.'} 댓글 답장을 쓰려면 권한을 더해 다시 연결해야 해요.</div>
            <div>
              <button
                className="btn small"
                disabled={!canControl}
                onClick={async () => {
                  const r = await run(() => autoApi.connectComments());
                  if (r) window.location.href = r.url;
                }}
              >
                댓글 권한까지 다시 연결
              </button>
            </div>
          </div>
        )}
        {o.last.comments && <div className="small muted">마지막 확인 {whenKst(o.last.comments.at)}: {o.last.comments.message}</div>}
        <div className="muted small">답글·DM은 여기 적은 글 그대로 나가요 (AI가 쓰지 않아요). 연구자 경험이나 분량처럼 확인되지 않은 내용은 적지 마세요.</div>
        {rules.map((r, i) => (
          <div key={r.id} className="panel stack rule-edit" style={{ gap: 8 }}>
            <div className="row">
              <b className="small">규칙 {i + 1}</b>
              <div className="spacer" />
              <label className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={r.enabled} disabled={!canControl} onChange={(e) => edit(i, { enabled: e.target.checked })} /> 사용
              </label>
              <button className="btn small ghost" disabled={!canControl} onClick={() => (setRules((rs) => rs.filter((_, j) => j !== i)), setDirty(true))}>
                지우기
              </button>
            </div>
            <label className="field small">
              댓글에서 찾을 단어 (쉼표로 여러 개, 띄어쓰기·대소문자 무시)
              <input type="text" value={r.keywords} placeholder="예: 레시피, 재료" disabled={!canControl} onChange={(e) => edit(i, { keywords: e.target.value })} />
            </label>
            <label className="field small">
              공개 답글 ({r.reply.length}/300)
              <textarea rows={2} value={r.reply} placeholder="예: DM으로 레시피 카드를 보내 드렸어요!" disabled={!canControl} onChange={(e) => edit(i, { reply: e.target.value })} />
            </label>
            <label className="field small">
              DM 문구 (비우면 DM은 보내지 않아요)
              <textarea rows={2} value={r.dmText} disabled={!canControl} onChange={(e) => edit(i, { dmText: e.target.value })} />
            </label>
            <label className="field small">
              DM에 붙일 링크 (선택, https://)
              <input type="url" value={r.dmLink} placeholder="https://blog.naver.com/…" disabled={!canControl} onChange={(e) => edit(i, { dmLink: e.target.value })} />
            </label>
          </div>
        ))}
        <div className="row">
          <button className="btn small" disabled={!canControl || rules.length >= 20} onClick={() => (setRules((rs) => [...rs, newRule()]), setDirty(true))}>
            규칙 더하기
          </button>
          <button className="btn small primary" disabled={!canControl || !dirty} onClick={saveRules}>
            규칙 저장
          </button>
          {dirty && <span className="small muted">저장하지 않은 변경이 있어요</span>}
        </div>
      </div>

      {/* ───── 먼저 시험 ───── */}
      <div className="card stack">
        <div className="card-head">
          <h2>먼저 시험</h2>
          <span className="muted">인스타그램에는 아무것도 보내지 않아요</span>
        </div>
        <div className="row">
          <button className="btn primary small" onClick={async () => setDry((await run(() => autoApi.dryRun())) ?? null)}>
            예약 게시 미리 보기
          </button>
        </div>
        {dry && (
          <div className="stack dry-run" style={{ gap: 6 }}>
            {dry.blockers.map((b, i) => (
              <div key={i} className="issue warning small">{b}</div>
            ))}
            {dry.posts.length === 0 && <div className="muted small">14일 안에 올릴 예약이 없어요.</div>}
            {dry.posts.map((p, i) => (
              <div key={i} className={`check-item small ${p.verdict === 'ok' ? 'ok' : p.verdict === 'wait' ? 'warn' : 'error'}`}>
                {p.verdict === 'ok' ? '✓ 올라감' : p.verdict === 'wait' ? '! 미룸' : '✕ 안 올라감'} · {whenKst(p.when)} · {p.title} — {p.reason}
              </div>
            ))}
            {dry.comments.blockers.map((b, i) => (
              <div key={`c${i}`} className="muted small">댓글 답장: {b}</div>
            ))}
          </div>
        )}
        <form
          className="stack"
          style={{ gap: 6 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setSampleResult((await run(() => autoApi.testComment(sample, rules))) ?? null);
          }}
        >
          <label className="field small">
            이런 댓글이 달리면? (저장 전 규칙으로도 시험해요)
            <input type="text" value={sample} placeholder="예: 레시피 알려주세요!" onChange={(e) => setSample(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn small" type="submit" disabled={!sample.trim()}>
              답글 미리 보기
            </button>
          </div>
        </form>
        {sampleResult &&
          (sampleResult.matched ? (
            <div className="issue ok small stack comment-preview" style={{ gap: 4 }}>
              <div>‘{sampleResult.keyword}’ 규칙에 맞아요.</div>
              <div>
                <b>공개 답글:</b> {sampleResult.reply}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                <b>DM:</b> {sampleResult.dm || '(보내지 않음)'}
              </div>
            </div>
          ) : (
            <div className="issue small comment-preview">맞는 규칙이 없어요. 답하지 않아요.</div>
          ))}
      </div>

      {/* ───── 기록 ───── */}
      <div className="card stack">
        <h2 style={{ margin: 0 }}>최근 자동 게시</h2>
        {o.recentPosts.length === 0 && <div className="muted small">아직 기록이 없어요.</div>}
        {o.recentPosts.map((p) => (
          <PostRow key={p.id} post={p} canRetry={canControl} onChange={() => void load(false)} />
        ))}
      </div>
      <div className="card stack">
        <h2 style={{ margin: 0 }}>최근 댓글 답장</h2>
        {o.recentReplies.length === 0 && <div className="muted small">아직 기록이 없어요.</div>}
        {o.recentReplies.map((r) => (
          <div key={r.id} className="panel stack small" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge${r.status === 'failed' ? ' error' : r.status === 'done' ? ' approved' : ''}`}>{REPLY_STATUS[r.status]}</span>
              <span>{whenKst(r.createdAt)}</span>
              <span className="muted">@{r.commenter || '알 수 없음'}</span>
              {r.mediaPermalink && (
                <a href={r.mediaPermalink} target="_blank" rel="noreferrer">
                  게시물
                </a>
              )}
            </div>
            <div className="muted">“{r.commentText}” → ‘{r.keyword}’</div>
            <div>답글: {r.replyText}</div>
            {r.dmText && <div className="muted">DM 보냄{r.status === 'partial' ? ' 실패' : ''}</div>}
            {r.reason && <div className="issue warning">{r.reason}</div>}
          </div>
        ))}
      </div>
      {!o.publicUrl && <div className="muted small">참고: 서버에 공개 주소(PUBLIC_URL)가 없으면 예약할 때 연 주소로 영상을 보내요.</div>}
    </div>
  );
};

/** 예약 한 줄 (취소·다시 시도) */
const PostRow: React.FC<{ post: AutoPost; canRetry?: boolean; onChange: () => void }> = ({ post: p, canRetry, onChange }) => {
  const { run } = useApp();
  return (
    <div className="panel stack small auto-post" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge${p.status === 'failed' ? ' error' : p.status === 'posted' ? ' approved' : p.status === 'scheduled' || p.status === 'posting' ? ' review' : ''}`}>{POST_STATUS[p.status]}</span>
        <b>{whenKst(p.at)}</b>
        <a href={`#/p/${p.projectId}/publish`} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {p.title}
        </a>
        {p.slotId !== null && <span className="muted">주간 계획</span>}
        {p.scriptVersion !== null && <span className="muted">대본 v{p.scriptVersion}</span>}
      </div>
      {p.reason && <div className={p.status === 'failed' ? 'issue error' : 'muted'}>{p.reason}</div>}
      {p.permalink && (
        <a href={p.permalink} target="_blank" rel="noreferrer">
          올린 릴스 보기
        </a>
      )}
      <div className="row">
        {p.status === 'scheduled' && (
          <button
            className="btn small ghost"
            onClick={async () => {
              if (!confirm('이 예약을 취소할까요?')) return;
              if (await run(() => autoApi.cancel(p.id), '예약을 취소했어요')) onChange();
            }}
          >
            예약 취소
          </button>
        )}
        {p.status === 'failed' && canRetry && (
          <button
            className="btn small"
            onClick={async () => {
              if (!confirm('지금 다시 시도할까요? 실패 이유가 “결과를 확인하지 못했어요”라면, 인스타그램 앱에서 이미 올라갔는지 먼저 확인해 주세요.')) return;
              if (await run(() => autoApi.retry(p.id), '다시 시도하도록 예약했어요')) onChange();
            }}
          >
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
};
