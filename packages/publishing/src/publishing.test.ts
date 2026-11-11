import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { SAMPLE_RECIPES, formatIngredient, generateTemplateScript } from '@mat-lab/recipe-core';
import { buildTimeline, captionChunks } from '@mat-lab/video/timeline';
import { buildBlogPost, buildSocialCopy, buildSrt, buildZip, markdownToHtml } from './index.ts';

const recipe = SAMPLE_RECIPES[0]!;
const review = { reviewer: '이희재', reviewedAt: '2026-11-03T09:00:00.000Z' };

describe('블로그 원고', () => {
  it('원본 재료·분량과 조리 순서를 모두 그대로 싣는다', () => {
    const post = buildBlogPost({ recipe, review });
    for (const i of recipe.ingredients) expect(post.markdown).toContain(`- ${formatIngredient(i)}`);
    recipe.steps.forEach((s, i) => expect(post.markdown).toContain(`${i + 1}. ${s}`));
    expect(post.markdown).toContain('검토일 2026-11-03');
  });

  it('원리·실수 문단은 본문 문체(~습니다)에 맞추고, 순서·팁 목록과 분량은 원본 그대로 둔다', () => {
    const photo = { ...recipe, principle: '두부와 배추를 함께 볶으면 청국장의 짠맛이 희석된다', commonMistake: '청국장을 처음부터 오래 볶으면 냄새가 강해진다.', tips: ['청국장은 마지막에 넣는다'] };
    const md = buildBlogPost({ recipe: photo, review }).markdown;
    expect(md).toContain('두부와 배추를 함께 볶으면 청국장의 짠맛이 희석됩니다.');
    expect(md).toContain('청국장을 처음부터 오래 볶으면 냄새가 강해집니다.');
    expect(md).toContain('- 청국장은 마지막에 넣는다');
    recipe.steps.forEach((s, i) => expect(md).toContain(`${i + 1}. ${s}`));
    expect(md).not.toContain('30초 실험실, 오늘의 질문은');
  });

  it('검토 문구는 승인된 글에만, 연구소 연구자 이름으로 쓴다 (승인한 사람 이름에 연구자 직함을 붙이지 않는다)', () => {
    // 연구자 계정이 아닌 사람이 승인: 서버는 빈 검토자를 넘기고, 연구자 이름 없이 '검토를 마쳤습니다'
    const md = buildBlogPost({ recipe, review: { reviewer: '', reviewedAt: review.reviewedAt } }).markdown;
    expect(md).not.toContain('조리기능장 이희재가 검토했습니다');
    expect(md).toContain('조리 정보는 검토를 마쳤습니다');
    // 연구자 본인 승인
    expect(buildBlogPost({ recipe, review: { reviewer: '이희재', reviewedAt: review.reviewedAt } }).markdown).toContain('조리기능장 이희재가 검토했습니다');
  });

  it('검수 전이면 게시 금지 문구를 넣는다', () => {
    const post = buildBlogPost({ recipe, review: null });
    expect(post.markdown).toContain('검수 전 초안');
    expect(post.markdown).not.toContain('검토했습니다');
  });

  it('HTML은 태그를 이스케이프한다', () => {
    expect(markdownToHtml('a <b> & **c**')).toBe('<p>a &lt;b&gt; &amp; <strong>c</strong></p>');
    expect(markdownToHtml('- x\n- y\n\n1. z')).toBe('<ul>\n<li>x</li>\n<li>y</li>\n</ul>\n<ol>\n<li>z</li>\n</ol>');
  });
});

describe('SNS 문구', () => {
  it("승인된 콘텐츠에만 '검토한'을 쓰고 AI 고지를 넣는다", () => {
    expect(buildSocialCopy(recipe, true, ['a']).instagram).toContain('검토한');
    const draft = buildSocialCopy(recipe, false, ['a']);
    expect(draft.instagram).not.toContain('검토한');
    expect(draft.instagram).toContain('AI');
    expect(draft.youtubeTitle.length).toBeLessThanOrEqual(100);
  });
});

describe('자막·묶음', () => {
  it('SRT 타임코드가 순서대로 증가한다', () => {
    const script = generateTemplateScript(recipe);
    const srt = buildSrt(script, buildTimeline(script, script.scenes.map(() => null)));
    const stamps = [...srt.matchAll(/(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)/g)].map((m) => [m[1]!, m[2]!]);
    expect(stamps.length).toBeGreaterThan(script.scenes.length);
    stamps.forEach(([a, b]) => expect(a! < b!).toBe(true));
    expect(srt.startsWith('1\n00:00:00,000')).toBe(true);
  });

  it('SRT는 영상 자막과 같은 실측 어절 시간으로 나뉜다', () => {
    const script = generateTemplateScript(recipe);
    const timings = buildTimeline(script, script.scenes.map(() => null));
    const t = timings[0]!;
    const n = script.scenes[0]!.line.trim().split(/\s+/).length;
    // 앞쪽 어절은 빨리, 마지막 어절은 늦게 말한 실측 시간
    t.words = Array.from({ length: n }, (_, i) => [i * 2, i === n - 1 ? t.speechFrames - 1 : i * 2 + 2] as [number, number]);
    const first = buildSrt({ ...script, scenes: [script.scenes[0]!] }, [t]).split('\n\n')[0]!;
    const chunk = captionChunks(script.scenes[0]!.line, t.speechFrames, t.words)[0]!;
    expect(first).toContain(chunk.text);
    const end = Math.round(((t.from + chunk.to) / 30) * 1000);
    expect(first).toContain(`,${String(end % 1000).padStart(3, '0')}`);
  });

  it('ZIP에 파일이 그대로 들어간다', () => {
    const zip = buildZip({ 'blog.md': '# 안녕', 'a.bin': new Uint8Array([1, 2, 3]) });
    const files = unzipSync(zip);
    expect(strFromU8(files['blog.md']!)).toBe('# 안녕');
    expect([...files['a.bin']!]).toEqual([1, 2, 3]);
  });
});
