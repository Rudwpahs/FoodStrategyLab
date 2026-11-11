import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, buildStyledScript, formatIngredient } from '@mat-lab/recipe-core';
import { kstDate, BLOG_STYLES, blogQuantityIssues, buildBlogPost, buildExpertBlog, buildSocialCopy, checkConsistency, lintBlog, questionsFor } from './index.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const review = { reviewer: '이희재', reviewedAt: '2026-11-03T00:00:00Z' };

describe('전문가 노트 블로그', () => {
  it('네 가지 글 유형마다 필수 질문이 있고, 답이 없으면 "답변 대기"로 남기며 게시 준비가 아니다', () => {
    for (const style of BLOG_STYLES) {
      const { required } = questionsFor(style);
      expect(required.length, style).toBeGreaterThan(0);
      const post = buildExpertBlog({ recipe: walnut, style, notes: { answers: {} }, review });
      expect(post.ready).toBe(false);
      expect(post.pending).toHaveLength(required.length);
      expect(post.markdown).toContain('[연구자 답변 대기]');
    }
  });

  it('경험 문장은 연구자 답변을 그대로 옮기고, 지어낸 경험 문장을 넣지 않는다', () => {
    const answers = {
      'key-step': '데친 뒤 찬물에 여러 번 헹구는 단계가 가장 중요해요.',
      failure: '시럽을 너무 오래 졸이면 딱딱해져요.',
      fix: '시럽이 실처럼 늘어나기 직전에 불을 끕니다.',
    };
    const empty = buildExpertBlog({ recipe: walnut, style: 'expert-note', notes: { answers: {} }, review });
    const full = buildExpertBlog({ recipe: walnut, style: 'expert-note', notes: { answers, confirmedBy: '이희재', confirmedAt: '2026-11-03' }, review });
    for (const a of Object.values(answers)) expect(full.markdown).toContain(a);
    expect(full.ready).toBe(true);
    // 답이 없을 때 생성기가 덧붙인 문장에는 1인칭 경험 표현이 없다
    const generated = empty.markdown.split('\n').filter((l) => !l.startsWith('- ') && !/^\d+\./.test(l) && !l.includes(walnut.principle.slice(0, 10)));
    expect(generated.join(' ')).not.toMatch(/제가|저는|저희 집|해 봤|만들어 봤|먹어 봤/);
  });

  it('연구자 본인 확인 전 답변이 있으면 게시 준비가 아니다', () => {
    const post = buildExpertBlog({ recipe: walnut, style: 'expert-note', notes: { answers: { 'key-step': 'a', failure: 'b', fix: 'c' } }, review });
    expect(post.ready).toBe(false);
    expect(post.blockers.join(' ')).toContain('본인');
  });

  it('검토 문구에 승인한 사람 이름을 쓰지 않고, 연구자 이름은 연구자가 승인했을 때만 쓴다', () => {
    const other = buildExpertBlog({ recipe: walnut, style: 'everyday', notes: { answers: {} }, review: { reviewer: '', reviewedAt: review.reviewedAt } }).markdown;
    expect(other).not.toContain('조리기능장 이희재 (');
    expect(other).toContain('조리 정보 검토 완료');
    const byResearcher = buildExpertBlog({ recipe: walnut, style: 'everyday', notes: { answers: {} }, review: { reviewer: '이희재', reviewedAt: review.reviewedAt } }).markdown;
    expect(byResearcher).toContain('조리 정보 검토: 조리기능장 이희재');
  });

  it('음식문화·실험형에도 연구자 팁이 들어가 일관성 경고가 뜨지 않는다', () => {
    const { script } = buildStyledScript(walnut, { style: 'experiment' });
    for (const style of ['culture', 'experiment'] as const) {
      const post = buildExpertBlog({ recipe: walnut, style, notes: { answers: {} }, review });
      expect(post.markdown, style).toContain(walnut.tips[0]!);
      expect(checkConsistency({ recipe: walnut, script, blogMarkdown: post.markdown, social: '', reviewed: true }).filter((i) => i.message.includes('팁')), style).toEqual([]);
    }
  });

  it('이 글 유형에 쓰지 않는 답변만 있으면 "답변을 옮겼습니다" 꼬리말·확인 요구를 붙이지 않는다', () => {
    const post = buildExpertBlog({ recipe: walnut, style: 'culture', notes: { answers: { history: '정과는 잔칫상에 오르던 과자입니다.', 'student-question': '시럽은 언제 끄나요? 실처럼 늘어나기 직전에요.' }, confirmedBy: undefined }, review });
    expect(post.markdown).not.toContain('시럽은 언제 끄나요');
    expect(post.blockers.join(' ')).toContain('본인');
    const unused = buildExpertBlog({ recipe: walnut, style: 'experiment', notes: { answers: { 'student-question': '시럽은 언제 끄나요? 실처럼 늘어나기 직전에요.' } }, review });
    expect(unused.blockers.join(' ')).not.toContain('본인');
    expect(unused.markdown).not.toContain('연구자 본인 확인 전');
  });

  it('승인 전에는 검토 문구 없이 경고만 넣는다', () => {
    const post = buildExpertBlog({ recipe: walnut, style: 'everyday', notes: { answers: {} }, review: null });
    expect(post.markdown).toContain('검수 전 초안');
    expect(post.markdown).not.toContain('조리 정보 검토:');
  });

  it('원본 재료·분량·순서를 그대로 쓰고, 원본·답변에 없는 분량을 찾아낸다', () => {
    const post = buildExpertBlog({ recipe: walnut, style: 'everyday', notes: { answers: {} }, review });
    for (const i of walnut.ingredients) expect(post.markdown).toContain(formatIngredient(i));
    expect(blogQuantityIssues(walnut, { answers: {} }, post.markdown)).toEqual([]);
    expect(blogQuantityIssues(walnut, { answers: {} }, post.markdown + '\n설탕 2컵')).toHaveLength(1);
    expect(blogQuantityIssues(walnut, { answers: { failure: '설탕 2컵이면 너무 달아요' } }, post.markdown + '\n설탕 2컵')).toEqual([]);
  });

  it('재료끼리 분량을 바꿔 쓴 원고도 잡는다 (물 3컵·설탕 1컵 → 물 1컵·설탕 3컵)', () => {
    const post = buildExpertBlog({ recipe: walnut, style: 'everyday', notes: { answers: {} }, review });
    const issues = blogQuantityIssues(walnut, { answers: {} }, `${post.markdown}\n시럽은 물 1컵, 설탕 3컵으로 만듭니다.`);
    expect(issues).toHaveLength(2);
    expect(issues.join(' ')).toContain('설탕');
  });
});

describe('영상·블로그·SNS 일관성 검사', () => {
  const { script } = buildStyledScript(walnut, { style: 'experiment' });
  const blog = buildBlogPost({ recipe: walnut, review });
  const social = buildSocialCopy(walnut, true, blog.tags).instagram;

  it('같은 원본으로 만든 결과물은 통과한다', () => {
    expect(checkConsistency({ recipe: walnut, script, blogMarkdown: blog.markdown, social, reviewed: true }).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('블로그 분량이 바뀌거나 재료가 빠지면 잡아낸다', () => {
    const changed = blog.markdown.replace('호두 500g', '호두 300g');
    const issues = checkConsistency({ recipe: walnut, script, blogMarkdown: changed, social, reviewed: true });
    expect(issues.some((i) => i.where === '블로그' && i.message.includes('호두 500g'))).toBe(true);
    expect(issues.some((i) => i.message.includes('300g'))).toBe(true);
  });

  it('블로그에서 조리 순서를 바꾸면 잡아낸다', () => {
    const [a, , c] = walnut.steps;
    const swapped = blog.markdown.replace(a!, '@@A@@').replace(c!, a!).replace('@@A@@', c!);
    const issues = checkConsistency({ recipe: walnut, script, blogMarkdown: swapped, social, reviewed: true });
    expect(issues.some((i) => i.where === '블로그' && i.level === 'error' && i.message.includes('순서'))).toBe(true);
  });

  it('승인 전 "검토한" 표현을 막는다', () => {
    const issues = checkConsistency({ recipe: walnut, script, blogMarkdown: blog.markdown, social: '이희재가 검토한 레시피', reviewed: false });
    expect(issues.some((i) => i.where === 'SNS')).toBe(true);
  });
});

describe('블로그 문체 검사', () => {
  it('상투구·효능 표현·연구자 답변에 없는 1인칭 경험을 잡아낸다', () => {
    const md = '오늘은 호두정과에 대해 알아보겠습니다.\n제가 직접 해보니 정말 바삭했어요.\n면역에 좋아요.';
    const issues = lintBlog(md, { dish: '호두정과', notes: { answers: {} } });
    expect(issues.some((i) => i.message.includes('알아보겠습니다'))).toBe(true);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('1인칭'))).toBe(true);
    expect(issues.some((i) => i.message.includes('면역'))).toBe(true);
  });

  it('띄어쓰기가 달라도 상투구·효능 표현을 잡는다 (황금 레시피, 피부 미용)', () => {
    const issues = lintBlog('이건 황금 레시피예요.\n피부 미용에도 좋아요.', { dish: '호두정과' }).map((i) => i.message);
    expect(issues.some((m) => m.includes('황금 레시피'))).toBe(true);
    expect(issues.some((m) => m.includes('피부 미용'))).toBe(true);
  });

  it.each(['어머니께서 명절마다 이렇게 부쳐 주셨어요.', '수강생들이 늘 이 부분에서 실패합니다.', '우리 집에서는 꼭 들기름을 써요.', '할머니는 항상 들기름을 쓰셨어요.', '처음 만들었을 때 시럽이 굳어 버렸어요.'])('가족·수강생·우리 집 이야기도 답변에 없으면 지어낸 경험으로 본다: %s', (sentence) => {
    expect(lintBlog(`## 이야기\n\n${sentence}`, { dish: '호두정과', notes: { answers: {} } }).some((i) => i.level === 'error')).toBe(true);
    expect(lintBlog(`## 이야기\n\n${sentence}`, { dish: '호두정과', notes: { answers: { memory: sentence } } }).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('연구자가 직접 답한 1인칭 문장은 허용한다', () => {
    const answer = '제가 처음 만들었을 때는 시럽이 하얗게 굳었어요.';
    const issues = lintBlog(`## 만들면서 있었던 일\n\n${answer}`, { dish: '호두정과', notes: { answers: { memory: answer } } });
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('생성기가 만든 원고에는 오류가 없다', () => {
    for (const style of BLOG_STYLES) {
      const post = buildExpertBlog({ recipe: walnut, style, notes: { answers: {} }, review });
      expect(lintBlog(post.markdown, { dish: '호두정과' }).filter((i) => i.level === 'error'), style).toEqual([]);
    }
  });
});

describe('날짜', () => {
  it('한국 시간 기준 날짜를 쓴다 (UTC 저녁은 한국 다음 날)', () => {
    expect(kstDate('2026-11-03T20:00:00Z')).toBe('2026-11-04');
    expect(kstDate('2026-11-03T01:00:00Z')).toBe('2026-11-03');
  });
});
