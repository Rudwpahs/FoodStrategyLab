import { describe, expect, it } from 'vitest';
import { findAiTells } from './aiTells.ts';
import { lintBlog } from './blogLint.ts';

describe('AI 티 탐지 (im-not-ai 규칙)', () => {
  it('AI 초안에 흔한 표현을 규칙 번호와 함께 찾는다', () => {
    const ai = [
      '청국장은 깊은 향을 가지고 있습니다. 이는 시사하는 바가 큽니다.',
      '조리에 있어서 가장 중요한 것은 불 조절입니다.',
      '맛이 판단되어집니다. 결론적으로 따라서 이를 통해 그러므로 맛이 좋아집니다.',
    ].join('\n\n');
    const rules = findAiTells(ai).map((t) => t.rule);
    expect(rules).toEqual(expect.arrayContaining(['A-7', 'D-2', 'A-3', 'D-8', 'A-8', 'D-1']));
  });

  it('사람이 쓴 평범한 레시피 문장은 조용하다', () => {
    const human = '청국장은 마지막에 넣어 살짝만 볶으세요. 오래 끓이면 향이 날아갑니다.\n\n두부는 칼 옆면으로 눌러 으깹니다. 배추를 먼저 볶아 단맛을 냅니다.';
    expect(findAiTells(human)).toEqual([]);
  });

  it('사람도 쓰는 표현은 반복될 때만 알린다 ("~할 수 있다" 4번 이상)', () => {
    expect(findAiTells('맛을 살릴 수 있다. 향을 살릴 수 있다. 짠맛을 줄일 수 있다.').map((t) => t.rule)).not.toContain('A-10');
    expect(findAiTells('맛을 살릴 수 있다. 향을 살릴 수 있다. 짠맛을 줄일 수 있다. 색을 낼 수 있다.').map((t) => t.rule)).toContain('A-10');
  });

  it('연구자 답변 원문은 검사하지 않는다 (원문 그대로 쓰는 원칙)', () => {
    const answer = '저는 청국장이 깊은 향을 가지고 있어서 마지막에 넣어요.';
    expect(findAiTells(`## 연구자 노트\n\n${answer}`, [answer])).toEqual([]);
    const issues = lintBlog(`## 노트\n\n${answer}`, { dish: '청국장덮밥', notes: { answers: { q1: answer } } as never });
    expect(issues.some((i) => i.message.includes('AI 티'))).toBe(false);
  });

  it('블로그 문체 검사에 AI 티 경고가 들어간다 (내부 표시 줄은 빼고)', () => {
    const md = '## 만드는 법\n\n이 과정은 매우 중요합니다.\n\n> ✍️ [연구자 답변 대기] 질문\n\n⚠️ 검수 전 초안입니다. 게시하지 마세요. ✍️⚠️📌🔬';
    const msgs = lintBlog(md, { dish: '청국장덮밥' }).map((i) => i.message);
    expect(msgs.some((m) => m.startsWith('AI 티 [D-2]'))).toBe(true);
    expect(msgs.some((m) => m.includes('[C-5]'))).toBe(false);
  });
});
