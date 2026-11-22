import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '../samples.ts';
import { formatIngredient } from '../format.ts';
import { BRAND } from '../brand.ts';
import { DEFAULT_PERSONA, PERSONAS, PERSONA_IDS, SENSORY_RULE, findFakeExperience, isPersonaId } from './persona.ts';
import { finalizeStory, storySystem, type StoryDraft } from './story.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

describe('맛조수 성격 (페르소나)', () => {
  it('기본은 지금 설정 그대로 (사용자가 고르기 전까지 스튜디오 대본이 바뀌지 않게)', () => {
    expect(DEFAULT_PERSONA).toBe('calm-host');
    const sys = storySystem();
    expect(sys).toContain(`- ${BRAND.character}: 연구소의 3D 진행자이자 조수. 차분하고 센스 있는 또래 진행자처럼 말한다.`);
    expect(sys).not.toContain('이번 대본의 성격');
    expect(sys).not.toContain(SENSORY_RULE);
  });

  it('세 가지 방향은 각자의 정체·관계와 공통 감각 규칙(맛은 노트로만)을 프롬프트에 넣는다', () => {
    for (const id of ['recorder', 'ai-honest', 'home-peer'] as const) {
      const sys = storySystem(id);
      expect(sys, id).toContain(`이번 대본의 성격: ${PERSONAS[id].label}`);
      expect(sys, id).toContain(SENSORY_RULE);
      for (const t of PERSONAS[id].traits) expect(sys, id).toContain(t);
      // 공통 규칙(해요체·실수 없음·출처 말하기)은 그대로
      expect(sys, id).toContain('두 시청자 모두 해요체');
      expect(sys, id).toContain('맛조수는 실수하지 않는다');
    }
    expect(storySystem('ai-honest')).toContain('맛을 볼 수 없는 AI 조수');
    expect(storySystem('home-peer')).toContain('경험은 지어내지 말고');
  });

  it('성격 설명에 따옴표로 든 예시 대사가 없다 (넣으면 그대로 베껴 모든 영상이 같은 말을 한다)', () => {
    for (const id of PERSONA_IDS) for (const t of PERSONAS[id].traits) expect(t, id).not.toMatch(/["“”'‘’]/);
  });

  it('성격 이름 확인', () => {
    expect(isPersonaId('recorder')).toBe(true);
    expect(isPersonaId('robot')).toBe(false);
    expect(isPersonaId(undefined)).toBe(false);
  });
});

describe('AI 캐릭터의 가짜 경험', () => {
  it('직접 해 보거나 맛본 것처럼 말하면 찾는다', () => {
    expect(findFakeExperience('제가 먹어 보니 훨씬 바삭했어요')).not.toEqual([]);
    expect(findFakeExperience('두 가지로 해 봤더니 차이가 컸어요')).not.toEqual([]);
    expect(findFakeExperience('저도 집에서 직접 해 보니 쉬웠어요')).not.toEqual([]);
    expect(findFakeExperience('맛을 봤는데 고소했어요')).not.toEqual([]);
  });
  it('권유·설명은 그대로 둔다', () => {
    expect(findFakeExperience('140도 정도로 맞춰 보세요. 간을 보고 소금을 더해 주세요.')).toEqual([]);
    expect(findFakeExperience('선생님은 들깨가루를 마지막에 넣어요. 한번 만들어 보세요.')).toEqual([]);
  });
  it('대본에 있으면 경고로 알린다', () => {
    const d: StoryDraft = {
      title: '호두정과, 왜 굳이 데칠까',
      storyType: 'why',
      audience: 'hobby-learner',
      logline: '데치기 한 단계',
      scenes: [
        { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'sizzle', place: 'kitchen', line: '호두정과, 왜 굳이 데칠까요?' },
        { beat: 'context', type: 'question', emotion: 'curious', place: 'pantry', line: '제가 먹어 보니 데친 쪽이 덜 떫었어요.' },
        { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'market', line: '호두 500g에 설탕, 물엿, 꿀을 준비해요.', cardTitle: '재료', cardItems: walnut.ingredients.map(formatIngredient) },
        { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '데치고, 말리고, 조리고, 140도 정도에서 튀겨요.', cardItems: walnut.steps.slice(0, 5) },
        { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: `떫은맛은 데치는 단계에서 잡혀요. ${BRAND.labName}의 정석이에요.` },
      ],
    };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.warnings.join(' ')).toContain('직접 해 보거나 맛본 것처럼');
  });
});
