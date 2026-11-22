import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '../samples.ts';
import { formatIngredient } from '../format.ts';
import { BRAND } from '../brand.ts';
import { DEFAULT_PERSONA, LIMIT_LINE_GAP, PERSONAS, PERSONA_IDS, SENSORY_RULE, findFakeExperience, hasLimitLine, isPersonaId, limitLineInstruction, personaProfile } from './persona.ts';
import { finalizeStory, storySystem, storyUser, type StoryDraft } from './story.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

describe('맛조수 성격 (페르소나)', () => {
  it('기본은 사용자가 고른 성격: 기록 담당 + 맛 한계 한마디 가끔 + 2030 대본은 살림 말투 (2026-11-22)', () => {
    expect(DEFAULT_PERSONA).toBe('lab-notes');
    const sys = storySystem();
    expect(sys).toContain(`이번 대본의 성격: ${PERSONAS['lab-notes'].label}`);
    expect(sys).toContain('노트를 가장 먼저 읽고 정리하는 기록 담당');
    expect(sys).toContain('2030 젊은 주부(young-home) 대본은 살림 옆자리 동료처럼');
    expect(sys).toContain('사용자 메시지가 허락할 때만');
    expect(sys).toContain(SENSORY_RULE);
  });

  it('예전 설정(calm-host)은 예전 글자 그대로 남아 있다 (되돌릴 때)', () => {
    const sys = storySystem('calm-host');
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

describe('맛조수 화면에 보이는 성격 요약 (캐릭터 페이지)', () => {
  it('기본 성격(lab-notes)의 한 줄 소개와 핵심 특징을 프롬프트와 같은 글로 보여 준다', () => {
    const p = personaProfile();
    expect(p.oneLine).toBe(PERSONAS['lab-notes'].oneLine);
    expect(p.label).toBe(PERSONAS['lab-notes'].label);
    const names = p.traits.map((t) => t.name);
    for (const n of ['정체', '원하는 것', '믿는 것', '잘하는 것', '관계', '말투', '시청 대상에 따라']) expect(names).toContain(n);
    // 화면 글은 프롬프트 글 그대로 (이름표만 떼고, 프롬프트에만 필요한 영어 이름표는 뺀다)
    for (const t of p.traits) expect(PERSONAS['lab-notes'].traits.some((src) => src.replace(/\s?\((?:young-home|hobby-learner)\)/g, '') === `${t.name}: ${t.text}`), t.name).toBe(true);
  });

  it('프롬프트 속 말("사용자 메시지", 영어 이름표)은 화면에 내보내지 않고, 늘 지키는 것을 쉬운 말로 알려 준다', () => {
    const p = personaProfile('lab-notes');
    const shown = [...p.traits.map((t) => `${t.name} ${t.text}`), ...p.rules].join('\n');
    expect(shown).not.toMatch(/사용자 메시지|young-home|hobby-learner/);
    expect(p.rules.join(' ')).toContain('실수하지 않아요');
    expect(p.rules.join(' ')).toContain('척하지 않아요');
    // 맛 한계 한마디는 가끔만 (lab-notes = rare)
    expect(p.rules.join(' ')).toContain(`최근 ${LIMIT_LINE_GAP}편`);
    expect(personaProfile('ai-honest').rules.join(' ')).toContain('대본마다 한 번');
    expect(personaProfile('recorder').rules.join(' ')).not.toContain('맛을 볼 수 없다는 한마디');
  });
});

describe('맛 한계 한마디는 가끔만 (4~5편에 한 번)', () => {
  it('한계 한마디를 찾는다', () => {
    expect(hasLimitLine('그 맛을 저는 확인할 수 없지만, 순서의 이유는 짚을 수 있어요.')).toBe(true);
    expect(hasLimitLine('저는 맛 대신 색을 보는데, 선명한 초록이면 잘 멈춘 거예요.')).toBe(true);
    expect(hasLimitLine('맛은 못 봐도 이유는 보여요.')).toBe(true);
    expect(hasLimitLine('데치면 떫은맛이 빠지고 고소한 맛이 살아나요.')).toBe(false);
  });
  it('최근 몇 편 안에 썼으면 이번에는 넣지 말라고, 아니면 대본 하나에만 넣어도 된다고 알린다', () => {
    const used = [['도시락 시금치예요.', '저는 맛 대신 색을 봐요.']];
    expect(limitLineInstruction('lab-notes', used)).toContain('이번 대본들에는 넣지 마');
    expect(limitLineInstruction('lab-notes', [['호두정과는 왜 데칠까요?']])).toContain('대본 하나에만');
    // LIMIT_LINE_GAP편보다 예전에 쓴 것은 세지 않는다
    const old = [...Array.from({ length: LIMIT_LINE_GAP }, () => ['평범한 대사예요.']), ['맛은 못 봐도 이유는 보여요.']];
    expect(limitLineInstruction('lab-notes', old)).toContain('대본 하나에만');
    // 다른 성격에는 이 안내가 없다
    expect(limitLineInstruction('recorder', used)).toBe('');
    expect(limitLineInstruction('ai-honest', used)).toBe('');
  });
  it('사용자 메시지에 들어간다 (기본 성격)', () => {
    const walnut2 = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
    const user = storyUser(walnut2, { count: 3, recent: [{ storyType: 'why', title: 't', firstLine: 'f', lines: ['맛은 못 봐도 이유는 보여요.'] }] });
    expect(user).toContain('이번 대본들에는 넣지 마');
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
