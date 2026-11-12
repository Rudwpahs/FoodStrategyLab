import { describe, expect, it } from 'vitest';
import { findHealthClaims } from './wordLists.ts';

describe('건강·효능 표현 (블로그·인스타·레시피 읽기가 함께 쓰는 한 목록)', () => {
  it('예전 레시피 읽기(서버) 목록에만 있던 말도 찾는다', () => {
    for (const [text, word] of [
      ['김치는 건강에 좋아요', '건강'],
      ['생강의 효능', '효능'],
      ['노화를 늦춰요', '노화'],
      ['콜레스테롤을 낮춰요', '콜레스테롤'],
      ['체중이 줄어요', '체중'],
      ['살이 빠지는 국', '살이 빠'],
      ['살이빠지는 국', '살이 빠'],
      ['소화가 좋아져요', '소화가 좋'],
      ['소화에좋은 무', '소화에 좋'],
      ['소화를 돕는 무', '소화를 돕'],
      ['소화를 도와줘요', '소화를 도와'],
      ['소화에 도움이 돼요', '소화에 도움'],
      ['암예방 식단', '암 예방'],
    ] as const) {
      expect(findHealthClaims(text), text).toContain(word);
    }
  });

  it('원래 공용 목록의 말도 그대로 찾는다 (띄어쓰기는 상관없이)', () => {
    expect(findHealthClaims('피부미용에 좋아요')).toEqual(['피부 미용']);
    expect(findHealthClaims('면역력과 혈당, 혈압')).toEqual(['면역', '혈당', '혈압']);
    expect(findHealthClaims('체중 감량 다이어트')).toEqual(['다이어트', '체중']);
    expect(findHealthClaims('살균 효과, 만병통치, 해독 디톡스, 항암')).toEqual(['항암', '해독', '디톡스', '살균', '만병']);
  });

  it('조리 설명에는 걸리지 않는다', () => {
    expect(findHealthClaims('팬을 달군 뒤 반죽을 얇게 펴면 바삭해져요. 찬물로 반죽하세요.')).toEqual([]);
  });
});
