import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { SAMPLE_RECIPES, formatIngredient, generateTemplateScript } from '@mat-lab/recipe-core';
import { buildTimeline } from '@mat-lab/video/timeline';
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
    expect(buildSocialCopy(recipe, true, ['a'], '이희재').instagram).toContain('검토한');
    expect(buildSocialCopy(recipe, true, ['a'], '가족').youtubeDescription).not.toContain('이희재가 검토');
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

  it('ZIP에 파일이 그대로 들어간다', () => {
    const zip = buildZip({ 'blog.md': '# 안녕', 'a.bin': new Uint8Array([1, 2, 3]) });
    const files = unzipSync(zip);
    expect(strFromU8(files['blog.md']!)).toBe('# 안녕');
    expect([...files['a.bin']!]).toEqual([1, 2, 3]);
  });
});
