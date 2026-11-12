import React, { useEffect, useState } from 'react';
import type { BlogStyle } from '@mat-lab/publishing';
import { api, copyHtml, copyText } from '../api.ts';
import { ExpertNotesPanel } from '../components/ExpertNotesPanel.tsx';
import { HumanizePanel } from '../components/HumanizePanel.tsx';
import { PublicationsPanel } from '../components/PublicationsPanel.tsx';
import { Fold } from '../components/Fold.tsx';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

type Blog = Awaited<ReturnType<typeof api.blog>>;

export const PublishStep: React.FC<StepProps> = ({ project, setProject, go, reload }) => {
  const { run } = useApp();
  const [blog, setBlog] = useState<Blog | null>(null);
  // 글 유형은 서버에 저장된 값 하나만 쓴다 (복사하는 원고·ZIP 안 원고·검수 화면이 같은 원고를 말하도록)
  const style = (project.blogStyle as BlogStyle) || '';
  const [savingStyle, setSavingStyle] = useState(false);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const done = project.renders.find((r) => r.status === 'done' && r.scriptVersion === project.latest?.version);
  const approvedLatest = project.latest !== null && project.versionState.approvedScriptVersion === project.latest.version;
  const reviewed = project.approval !== null;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    run(() => api.blog(project.id, style || undefined)).then((b) => {
      if (!alive) return;
      if (b) setBlog(b);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [project.updatedAt, project.status, style, tick]);

  if (!blog)
    return failed ? (
      <div className="card empty">
        <h2>원고를 불러오지 못했어요</h2>
        <div>인터넷 연결을 확인하고 다시 불러와 주세요.</div>
        <button className="btn primary" onClick={() => setTick((t) => t + 1)}>다시 불러오기</button>
      </div>
    ) : (
      <div className="loading">원고를 불러오는 중…</div>
    );

  return (
    <div className="stack">
      {!reviewed && <div className="issue warning">검수 전 초안이에요. 승인 전에는 게시하지 마세요. '검토한' 표현도 승인 뒤에만 들어가요.</div>}
      <div className="grid2 publish-grid">
        <div className="card stack">
          <div className="card-head">
            <h2>네이버 블로그 원고</h2>
            <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
              <button className="btn small" onClick={() => run(() => copyText(blog.post.title), '제목을 복사했습니다')}>제목 복사</button>
              <button className="btn small primary" onClick={() => run(() => copyHtml(blog.post.html, blog.post.markdown), '본문을 서식째 복사했습니다')}>본문 복사</button>
            </div>
          </div>
          <div className="muted small">네이버 블로그 글쓰기 API가 종료되어, 본문을 복사해 에디터에 붙여넣고 사진(썸네일·레시피 카드)을 직접 올립니다.</div>
          <label className="field">
            글 유형
            <select
              value={style}
              disabled={savingStyle}
              onChange={async (e) => {
                const next = e.target.value as BlogStyle | '';
                setSavingStyle(true);
                const p = await run(() => api.setBlogStyle(project.id, next), '글 유형을 바꿨어요 (내보내기 원고도 같이 바뀌어요)');
                setSavingStyle(false);
                if (p) setProject(p);
              }}
            >
              <option value="">기본 자동 원고 (레시피만)</option>
              {Object.entries(blog.styles).map(([k, v]) => (
                <option key={k} value={k}>{v.label}: {v.summary}</option>
              ))}
            </select>
          </label>
          {blog.expert && (
            <div className={`issue ${blog.expert.ready ? 'ok' : 'warning'}`}>
              {blog.expert.ready ? '게시 준비 완료: 연구자 답변과 승인이 모두 확인됐어요.' : `아직 게시하지 마세요. ${blog.expert.blockers.join(' ')}`}
            </div>
          )}
          {blog.consistency.length > 0 ? (
            <div className="stack" style={{ gap: 4 }}>
              {blog.consistency.map((c, i) => (
                <div key={i} className={`issue ${c.level}`}>[{c.where}] {c.message}</div>
              ))}
            </div>
          ) : (
            project.latest && <div className="small note-ok">영상·블로그·SNS의 재료·분량·순서가 원본과 같아요</div>
          )}
          {blog.lint.length > 0 && (
            <details>
              <summary className="small">문체 점검 {blog.lint.length}건 (상투구·반복·지어낸 경험)</summary>
              {blog.lint.map((l, i) => (
                <div key={i} className={`issue ${l.level}`}>{l.message}</div>
              ))}
            </details>
          )}
          <HumanizePanel project={project} target="blog" style={style || undefined} polished={blog.polished} onApplied={() => setTick((t) => t + 1)} />
          {blog.polished > 0 && <div className="muted small">AI 티 다듬기로 고친 문단 {blog.polished}개가 반영된 원고예요 (복사·내보내기에도 같이 들어가요).</div>}
          <div className="blog-preview" dangerouslySetInnerHTML={{ __html: blog.post.html }} />
          <div className="row">
            <button className="btn small" onClick={() => run(() => copyText(blog.post.markdown), '마크다운을 복사했습니다')}>마크다운 복사</button>
            <button className="btn small" onClick={() => run(() => copyText(blog.post.tags.map((t) => `#${t}`).join(' ')), '태그를 복사했습니다')}>태그 복사</button>
          </div>
        </div>
        <div className="stack">
          {style && <ExpertNotesPanel projectId={project.id} style={style} onSaved={() => setTick((t) => t + 1)} />}
          <div className="card stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>인스타그램 릴스 문구</h2>
              <div className="spacer" />
              <button className="btn small" onClick={() => run(() => copyText(blog.social.instagram), '복사했습니다')}>복사</button>
            </div>
            <pre className="copy">{blog.social.instagram}</pre>
          </div>
          <div className="card stack">
            <div className="card-head">
              <h2>유튜브 쇼츠 문구</h2>
              <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
                <button className="btn small" onClick={() => run(() => copyText(blog.social.youtubeTitle), '제목을 복사했습니다')}>제목 복사</button>
                <button className="btn small" onClick={() => run(() => copyText(blog.social.youtubeDescription), '설명을 복사했습니다')}>설명 복사</button>
              </div>
            </div>
            <pre className="copy">{`${blog.social.youtubeTitle}\n\n${blog.social.youtubeDescription}`}</pre>
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>게시 묶음</h2>
            {done && approvedLatest ? (
              <div className="row">
                <a className="btn primary" href={`/api/renders/${done.id}/download`}>게시 묶음 ZIP 내려받기</a>
                <span className="muted small num">작업 #{done.id}</span>
              </div>
            ) : (
              <div className="row">
                <span className="muted">{done ? '승인 후 내려받을 수 있어요.' : '최신 대본으로 만든 영상이 아직 없어요.'}</span>
                <button className="btn small" onClick={() => go('video')}>영상 만들러 가기</button>
              </div>
            )}
            <div className="muted small">묶음에는 영상·커버·썸네일·레시피 카드·고른 블로그 원고·자막·게시 문구가 들어가요.</div>
          </div>
          <PublicationsPanel project={project} reload={reload} />
          <Fold title="AI 영상 프롬프트 팩 (선택)">
            <ReelPrompts projectId={project.id} approved={reviewed} />
          </Fold>
        </div>
      </div>
    </div>
  );
};

type Pack = Awaited<ReturnType<typeof api.reelPrompts>>;

/** 선택: 이미지·영상 생성 AI로 장면을 직접 만들고 싶을 때 쓰는 프롬프트 */
const ReelPrompts: React.FC<{ projectId: number; approved: boolean }> = ({ projectId, approved }) => {
  const { run } = useApp();
  const [pack, setPack] = useState<Pack | null>(null);
  return (
    <div className="stack">
      <div className="row">
        <div className="spacer" />
        <button className="btn small" disabled={!approved} onClick={async () => setPack((await run(() => api.reelPrompts(projectId))) ?? null)}>
          {pack ? '다시 만들기' : '만들기'}
        </button>
      </div>
      <div className="muted small">
        ChatGPT(이미지)·Gemini(영상)로 장면을 직접 만들 때 쓰는 프롬프트입니다. 캐릭터 시트 → 주방 배경 → 클립별(약 8초) 첫 프레임 → 영상 순서로, 같은 채팅에서 이어서 쓰세요. 만든 클립은 [영상·블로그]의 "생성 AI 클립 올리기"에서 같은 번호에 올리세요.
        서비스별로 무료 사용량이 다르고 유료일 수 있으며, 생성 영상이 대사·분량을 바꾸면 쓰지 마세요. {approved ? '' : '(승인된 대본만)'}
      </div>
      {pack && (
        <div className="stack">
          <div className="row">
            <button className="btn small" onClick={() => run(() => copyText(pack.characterSheet), '캐릭터 시트 프롬프트를 복사했습니다')}>캐릭터 시트 복사</button>
            <button className="btn small" onClick={() => run(() => copyText(pack.environment), '주방 배경 프롬프트를 복사했습니다')}>주방 배경 복사</button>
            <button className="btn small" onClick={() => run(() => copyText(pack.markdown), '전체를 복사했습니다')}>전체 복사</button>
          </div>
          {pack.clips.map((c, i) => (
            <div key={i} className="row small">
              <b>클립 {i + 1}</b>
              <span className="muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.line}</span>
              <button className="btn small" onClick={() => run(() => copyText(c.framePrompt), `클립 ${i + 1} 첫 프레임 프롬프트 복사`)}>A 첫 프레임</button>
              <button className="btn small" onClick={() => run(() => copyText(c.videoPrompt), `클립 ${i + 1} 영상 프롬프트 복사`)}>B 영상</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
