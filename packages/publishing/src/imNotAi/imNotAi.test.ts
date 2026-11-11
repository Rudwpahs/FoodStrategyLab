import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { buildBlogPost, buildExpertBlog } from '../index.ts';
import { applyPolish, changeRate, polishPost, polishableBlogLines, rewriteProblems, totalChangeRate } from './gates.ts';
import { humanizeSystem, humanizeUser } from './prompt.ts';
import { QUICK_RULES } from './rules.ts';
import { humanizeSystem as sys } from '../index.ts';

describe('im-not-ai 게이트 (프로그램 검사)', () => {
  it('변경률: 같으면 0, 전부 다르면 1, 조금 고치면 작다', () => {
    expect(changeRate('같은 문장', '같은 문장')).toBe(0);
    expect(changeRate('가나다', '라마바')).toBe(1);
    const r = changeRate('이 방법은 매우 중요합니다.', '이 방법이 중요합니다.');
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.3);
    expect(totalChangeRate([])).toBe(0);
  });

  it('통과: 뜻·숫자·말투를 지키고 AI 티만 덜어낸 문장', () => {
    expect(rewriteProblems('140도 정도의 기름에 튀기면 시럽이 굳는 것이 매우 중요합니다.', '140도 정도의 기름에 튀기면 시럽이 굳습니다.')).toEqual([]);
    expect(rewriteProblems('선생님 노트를 보면요, 반죽이 질어져요.', '선생님 노트를 보면, 반죽이 질어져요.', { spoken: true })).toEqual([]);
  });

  it.each([
    ['140도에서 튀겨요.', '160도에서 튀겨요.', 'number_injected'],
    ['설탕 1컵을 넣어요.', '설탕을 넣어요.', 'number_injected'],
    ['"반죽은 꼭 찬물!"이라고 하셨어요.', '반죽은 찬물로 하라고 하셨어요.', 'quote_altered'],
    ['반죽을 섞어요.', '반죽을 섞는다.', 'colloquial_erased'],
    ['반죽을 섞었다.', '반죽을 섞하였다.', 'hayeot_injection'],
    ['반죽을 섞어요.', '반죽을 섞는 것은 황금레시피예요.', 'cliche_injection'],
    ['반죽을 섞어요.', '', 'empty_output'],
    ['반죽을 섞어요.', '반죽을 섞는 것은 황금 레시피예요.', 'cliche_injection'],
    // 뜻이 뒤집히는 윤문 (아라비아 숫자가 없어도 잡는다)
    ['두 번 뒤집어요.', '세 번 뒤집어요.', 'count_changed'],
    ['한 번에 식히세요.', '두 번에 나눠 식히세요.', 'count_changed'],
    ['센 불에서 빠르게 볶아요.', '약한 불에서 빠르게 볶아요.', 'heat_changed'],
    ['중불로 줄여요.', '강불로 줄여요.', 'heat_changed'],
    ['소금은 마지막까지 넣지 않습니다.', '소금은 마지막까지 넣습니다.', 'negation_flipped'],
    ['소금을 넣어요.', '소금을 넣지 마세요.', 'negation_flipped'],
    ['뚜껑을 열지 못하게 해요.', '뚜껑을 열게 해요.', 'negation_flipped'],
  ])('실패: %s → %s (%s)', (before, after, code) => {
    expect(rewriteProblems(before, after).join(' ')).toContain(code);
  });

  it('요리 이름·연구자 이름이 빠지면 실패, 50% 넘게 바뀌면 실패, 대사가 길어지면 실패', () => {
    expect(rewriteProblems('바삭한 김치전은 찬물로 반죽해요.', '전은 찬물로 반죽해요.', { keep: ['바삭한 김치전'] }).join()).toContain('바삭한 김치전');
    expect(rewriteProblems('반죽은 찬물로 해요.', '오늘은 날씨가 맑고 기분이 좋아요.').join()).toContain('변경률');
    expect(rewriteProblems('찬물로 해요.', '반드시 아주 차가운 찬물로 반죽을 해야 해요.', { spoken: true }).join()).toContain('길어졌어요');
  });

  it('재료 이름이 빠지면 실패, 불 세기·부정·횟수를 지키면 통과', () => {
    expect(rewriteProblems('간장과 설탕을 함께 섞어 주세요.', '설탕을 함께 섞어 주세요.', { ingredients: ['간장', '설탕'] }).join()).toContain('ingredient_dropped');
    expect(rewriteProblems('센 불에서 두 번 볶는 것이 매우 중요하고 소금은 넣지 않아요.', '센 불에서 두 번 볶고 소금은 넣지 않아요.')).toEqual([]);
  });
});

describe('블로그: 다듬을 문단만 고르고, 저장한 윤문을 적용', () => {
  const recipe = SAMPLE_RECIPES[0]!;
  const review = { reviewer: '이희재', reviewedAt: '2026-11-07T00:00:00Z' };

  it('재료·순서·팁 목록, 제목, 꼬리말, 연구자 답변은 다듬지 않는다', () => {
    const answer = '반죽은 꼭 부치기 직전에 섞어요. 미리 섞으면 질어져요.';
    const post = buildExpertBlog({ recipe, style: 'expert-note', notes: { answers: { 'key-step': answer } }, review });
    const lines = polishableBlogLines(post.markdown, [answer]);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).not.toMatch(/^(#|- |\d+\. |>)/);
      expect(answer).not.toContain(l);
      for (const s of recipe.steps) expect(l).not.toContain(s);
    }
    expect(lines.join('\n')).not.toContain('출처:');
  });

  it('원문 문단이 그대로일 때만 바꾸고, 원고가 바뀌면 원래 문장으로 돌아간다', () => {
    const post = buildBlogPost({ recipe, review });
    // 원리 문단 줄을 직접 고른다 (원리가 바뀌면 이 줄이 원고에서 사라진다)
    const principleLine = polishableBlogLines(post.markdown).find((l) => l.includes(recipe.principle.slice(0, 10)))!;
    expect(principleLine).toBeTruthy();
    const polished = polishPost(post, { [principleLine]: '다듬은 문장입니다.' });
    expect(polished.polished).toBe(1);
    expect(polished.markdown).toContain('다듬은 문장입니다.');
    expect(polished.html).toContain('다듬은 문장입니다.');
    const changed = buildBlogPost({ recipe: { ...recipe, principle: '완전히 다른 원리 문장입니다.' }, review });
    const reverted = applyPolish(changed.markdown, { [principleLine]: '다듬은 문장입니다.' });
    expect(reverted.applied).toBe(0);
    expect(reverted.markdown).not.toContain('다듬은 문장입니다.');
    expect(reverted.markdown).toContain('완전히 다른 원리 문장입니다.');
    expect(applyPolish(changed.markdown, { '없는 문장입니다만 길게': 'x' }).applied).toBe(0);
  });
});

describe('윤문 요청문', () => {
  it('im-not-ai 룰북(quick-rules.md)과 역할(monolith.md)을 원문 그대로 넣고, 우리 규칙을 덧붙인다', () => {
    expect(QUICK_RULES).toContain('## A. 번역투');
    expect(QUICK_RULES).toContain('## 자체검증 체크리스트');
    const s = humanizeSystem('script');
    expect(s).toBe(sys('script'));
    expect(s).toContain(QUICK_RULES);
    expect(s).toContain('# Monolith role');
    expect(s).toContain('맛조수');
    expect(humanizeSystem('blog')).toContain('네이버 블로그');
    const u = humanizeUser('blog', [{ id: 'p1', text: '매우 중요합니다.' }], [{ rule: 'D-2', severity: 'S1', found: 'x', fix: 'y' }]);
    expect(u).toContain('[D-2 S1]');
    expect(u).toContain('"id": "p1"');
  });
});
