import React, { useEffect, useState } from 'react';
import { api, copyHtml, copyText } from '../api.ts';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

type Blog = Awaited<ReturnType<typeof api.blog>>;

export const PublishStep: React.FC<StepProps> = ({ project, go }) => {
  const { run } = useApp();
  const [blog, setBlog] = useState<Blog | null>(null);
  const done = project.renders.find((r) => r.status === 'done' && r.scriptVersion === project.latest?.version);
  const reviewed = project.approval !== null;

  useEffect(() => {
    run(() => api.blog(project.id)).then((b) => b && setBlog(b));
  }, [project.updatedAt, project.status]);

  if (!blog) return <div className="empty">불러오는 중…</div>;

  return (
    <div className="stack">
      {!reviewed && <div className="issue warning">검수 전 초안입니다. 승인 전에는 게시하지 마세요. ('검토한' 표현도 승인 후에만 들어갑니다.)</div>}
      <div className="grid2">
        <div className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>네이버 블로그 원고</h2>
            <div className="spacer" />
            <button className="btn small" onClick={() => run(() => copyText(blog.post.title), '제목을 복사했습니다')}>제목 복사</button>
            <button className="btn small primary" onClick={() => run(() => copyHtml(blog.post.html, blog.post.markdown), '본문을 서식째 복사했습니다')}>본문 복사</button>
          </div>
          <div className="muted small">네이버 블로그 글쓰기 API가 종료되어, 본문을 복사해 에디터에 붙여넣고 사진(썸네일·레시피 카드)을 직접 올립니다.</div>
          <div className="blog-preview" dangerouslySetInnerHTML={{ __html: blog.post.html }} />
          <div className="row">
            <button className="btn small" onClick={() => run(() => copyText(blog.post.markdown), '마크다운을 복사했습니다')}>마크다운 복사</button>
            <button className="btn small" onClick={() => run(() => copyText(blog.post.tags.map((t) => `#${t}`).join(' ')), '태그를 복사했습니다')}>태그 복사</button>
          </div>
        </div>
        <div className="stack">
          <div className="card stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>인스타그램 릴스 문구</h2>
              <div className="spacer" />
              <button className="btn small" onClick={() => run(() => copyText(blog.social.instagram), '복사했습니다')}>복사</button>
            </div>
            <pre className="copy">{blog.social.instagram}</pre>
          </div>
          <div className="card stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>유튜브 쇼츠</h2>
              <div className="spacer" />
              <button className="btn small" onClick={() => run(() => copyText(blog.social.youtubeTitle), '제목을 복사했습니다')}>제목 복사</button>
              <button className="btn small" onClick={() => run(() => copyText(blog.social.youtubeDescription), '설명을 복사했습니다')}>설명 복사</button>
            </div>
            <pre className="copy">{`${blog.social.youtubeTitle}\n\n${blog.social.youtubeDescription}`}</pre>
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>게시 묶음</h2>
            {done ? (
              <div className="row">
                <a className="btn primary" href={`/api/renders/${done.id}/download`}>ZIP 내려받기 (작업 #{done.id})</a>
                <span className="muted small">영상·커버·썸네일·레시피 카드·블로그·자막·게시 문구</span>
              </div>
            ) : (
              <div className="row">
                <span className="muted">최신 대본으로 제작한 완성본이 없습니다.</span>
                <button className="btn small" onClick={() => go('video')}>영상 제작으로 →</button>
              </div>
            )}
            <div className="muted small">게시는 사람이 직접 확인하고 올립니다 (SNS 자동 게시는 후속 단계).</div>
          </div>
        </div>
      </div>
    </div>
  );
};
