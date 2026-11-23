import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '../samples.ts';
import { formatIngredient } from '../format.ts';
import { BRAND } from '../brand.ts';
import type { RecipeInput } from '../types.ts';
import { GAG_STORY_TYPES, STORY_TYPES, STORY_TYPE_INFO, availableStoryTypes, finalizeStory, storyBlocked, storySystem, storyUser, type StoryCandidate, type StoryDraft, type StoryType } from './story.ts';
import { HUMOR_ROTATION, HUMOR_TYPES, LETTER_FICTION, LETTER_REAL, fictionStoryScenes, humorRotation, isHumorType, pickHumorType, wordplayWords } from './humor.ts';

const kimchi = SAMPLE_RECIPES.find((r) => r.dishName === '바삭한 김치전')!;
const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const NEW_HUMOR = HUMOR_TYPES.filter((t) => t !== 'deadpan');

/** 사용자 메시지에 '고를 수 있는 형식'으로 나온 형식 id */
function offered(user: string): string[] {
  const block = user.split('## 고를 수 있는 형식')[1]!.split('\n\n')[0]!;
  return [...block.matchAll(/^- ([a-z-]+)\(/gm)].map((m) => m[1]!);
}
const offeredHumor = (user: string) => offered(user).filter(isHumorType);

/** 김치전 대본 초안: 앞 장면만 바꿔 형식별로 쓴다 */
function kimchiDraft(storyType: StoryType, front: StoryDraft['scenes']): StoryDraft {
  const tail: StoryDraft['scenes'] = [
    { beat: 'point', type: 'explain', emotion: 'confident', place: 'lab', line: '김치 속 소금이 반죽 수분을 끌어내 질어져요.', cardTitle: BRAND.notePhrase, cardItems: [] },
    { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'kitchen', line: '재료는 이렇게 준비해요.', cardTitle: '재료', cardItems: kimchi.ingredients.map(formatIngredient) },
    { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '반죽은 부치기 직전에 섞어 주세요.', cardItems: kimchi.steps.slice(0, 5) },
    { beat: 'close', type: 'outro', emotion: 'joy', place: 'dining', line: `다 부친 전은 식힘망으로, ${BRAND.labName}의 정리예요.` },
  ];
  return { title: '김치전 시험 대본', storyType, audience: 'young-home', logline: '시험', scenes: [...front, ...tail] };
}
const ok = (c: ReturnType<typeof finalizeStory>): StoryCandidate => {
  if ('error' in c) throw new Error(c.error);
  return c;
};

describe('웃음 형식 정의', () => {
  it('웃음 형식은 모두 영상 형식이고, 이름·구성·지킬 것·맞는 시청자가 있다 (엉뚱 가이드는 그대로)', () => {
    for (const t of HUMOR_TYPES) {
      expect(STORY_TYPES).toContain(t);
      const info = STORY_TYPE_INFO[t];
      expect(info.label).toBeTruthy();
      expect(info.beats.length).toBeGreaterThan(40);
      expect(info.guide.length).toBeGreaterThan(80);
      expect(info.fits.length).toBeGreaterThan(0);
    }
    expect(STORY_TYPE_INFO.deadpan.label).toBe('진지한 엉뚱 가이드');
    expect(STORY_TYPE_INFO.wordplay.label).toBe('글자 그대로');
    expect(STORY_TYPE_INFO['listener-story'].label).toBe('사연 한 통');
    expect(STORY_TYPE_INFO['town-rules'].label).toBe('이 연구소에서는');
  });

  it('새 지시문은 예문 대신 설명으로 쓴다: 따옴표 안은 필드 값·카드 이름·원본 항목 이름뿐', () => {
    const allowed = new Set(['gag', 'sizzle', 'question', LETTER_FICTION, LETTER_REAL, '전문가답변', '흔한실수']);
    for (const t of NEW_HUMOR) {
      const quoted = [...`${STORY_TYPE_INFO[t].beats} ${STORY_TYPE_INFO[t].guide}`.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
      for (const q of quoted) expect(allowed, `${t}: "${q}"`).toContain(q);
    }
  });

  it('맛조수가 실수하는 구도·유치한 구도·맛을 느끼는 말은 지시문에 넣지 않고, 위험·지어낸 이야기·음식 고통을 막는 말을 넣는다', () => {
    const guides = NEW_HUMOR.map((t) => STORY_TYPE_INFO[t].guide).join(' ');
    expect(guides).not.toMatch(/탐정|미션|내기|맛있어요|먹어 봤/);
    expect(STORY_TYPE_INFO.wordplay.guide).toContain('일부러 보여 주는 말놀이');
    expect(STORY_TYPE_INFO.wordplay.guide).toContain('전환 줄 뒤에만');
    expect(STORY_TYPE_INFO.documentary.guide).toContain('아프거나 괴로워하는 생명처럼 그리지 마');
    expect(STORY_TYPE_INFO['listener-story'].guide).toContain(LETTER_FICTION);
    expect(STORY_TYPE_INFO['listener-story'].guide).toContain('진짜처럼 소개하지 마');
    expect(STORY_TYPE_INFO.relatable.guide).toContain('사람이 아니라 상황');
    expect(STORY_TYPE_INFO['vague-vs-note'].guide).toContain('특정 인물이 한 말로 지어내지 마');
  });

  it('농담 그림 장면은 엉뚱 가이드와 글자 그대로에만', () => {
    expect([...GAG_STORY_TYPES].sort()).toEqual(['deadpan', 'wordplay']);
    const sys = storySystem();
    expect(sys).toContain('글자 그대로(wordplay)의 다른 뜻 장면에만');
    expect(sys).toContain(`cardTitle "${LETTER_FICTION}"`);
    for (const g of ['mailbox', 'hand-fan', 'bedtime']) expect(sys).toContain(`- ${g}: `);
  });
});

describe('웃음 형식을 쓸 수 있는 조건 (원본에 웃음거리가 있을 때만)', () => {
  it('김치전은 새 웃음 형식을 모두 쓸 수 있다', () => {
    const types = availableStoryTypes(kimchi);
    for (const t of NEW_HUMOR) expect(types).toContain(t);
  });

  it('글자 그대로: 원본 순서·팁에 다른 뜻이 있는 요리 말이 있을 때만', () => {
    expect(wordplayWords(kimchi).map((w) => w.word)).toEqual(expect.arrayContaining(['부치다', '썰다', '식히다']));
    const plain: RecipeInput = { ...kimchi, steps: ['재료를 그릇에 담는다.', '접시에 올린다.'], tips: ['따뜻할 때 낸다.'], principle: '' };
    expect(availableStoryTypes(plain)).not.toContain('wordplay');
  });

  it('부엌 다큐: 원본 순서에 보이거나 들리는 익음 신호가 있을 때만', () => {
    expect(availableStoryTypes({ ...kimchi, steps: ['재료를 그릇에 담는다.', '접시에 올린다.'] })).not.toContain('documentary');
  });

  it('사연 한 통: 흔한 실수 또는 연구자 답변이 있을 때만, 이럴 때 꼭 있는 일: 흔한 실수가 있을 때만', () => {
    expect(walnut.commonMistake).toBe('');
    expect(availableStoryTypes(walnut)).not.toContain('listener-story');
    expect(availableStoryTypes(walnut)).not.toContain('relatable');
    expect(availableStoryTypes(walnut, { expertAnswers: ['수업에서 데치는 물을 넉넉히 잡으라고 자주 말해요.'] })).toContain('listener-story');
  });

  it('적당히의 나라: 숫자로 적힌 분량이 둘 이상일 때만', () => {
    const vague: RecipeInput = { ...kimchi, ingredients: kimchi.ingredients.map((i, k) => ({ ...i, amount: k === 0 ? '200g' : '적당량' })) };
    expect(availableStoryTypes(vague)).not.toContain('vague-vs-note');
  });

  it('이 연구소에서는: 규칙으로 선언할 원본 팁이 있을 때만', () => {
    expect(availableStoryTypes({ ...kimchi, tips: [] })).not.toContain('town-rules');
  });
});

describe('웃음 돌려쓰기', () => {
  const info = ['why', 'quick', 'standard', 'occasion', 'one-fix', 'season', 'leftover', 'qa', 'heritage', 'compare'];

  it('최근 기록이 없으면 모든 웃음 형식을 낼 수 있다', () => {
    expect(humorRotation([])).toEqual({ allowed: [...HUMOR_TYPES], blocked: null });
  });

  it('최근 10편 중 웃음 형식이 4편 이상이면 이번에는 내지 않는다 (3편이면 낸다)', () => {
    const three = ['why', 'wordplay', 'quick', 'documentary', 'standard', 'relatable', 'why', 'quick', 'occasion', 'why'];
    expect(humorRotation(three).allowed.length).toBeGreaterThan(0);
    const four = ['why', 'wordplay', 'quick', 'documentary', 'standard', 'relatable', 'why', 'town-rules', 'occasion', 'why'];
    expect(humorRotation(four).allowed).toEqual([]);
    expect(humorRotation(four).blocked).toContain('4편');
    // 10편 밖의 웃음 형식은 세지 않는다
    const old = [...info, 'wordplay', 'documentary', 'relatable', 'town-rules'];
    expect(humorRotation(old).allowed.length).toBeGreaterThan(0);
    expect(HUMOR_ROTATION.window).toBe(10);
  });

  it('바로 앞 영상이 웃음 형식이면 이번에는 내지 않는다 (연달아 금지)', () => {
    expect(humorRotation(['relatable', 'why', 'quick']).allowed).toEqual([]);
    expect(humorRotation(['relatable', 'why', 'quick']).blocked).toContain('바로 앞');
    expect(humorRotation(['why', 'relatable', 'quick']).allowed.length).toBeGreaterThan(0);
  });

  it('같은 웃음 형식은 최근 6편 안에 한 번까지', () => {
    const at = (t: string, i: number) => Array.from({ length: 10 }, (_, k) => (k === i ? t : info[k]!));
    expect(humorRotation(at('wordplay', 5)).allowed).not.toContain('wordplay');
    expect(humorRotation(at('wordplay', 6)).allowed).toContain('wordplay');
    expect(humorRotation(at('wordplay', 5)).allowed).toContain('documentary');
  });

  it('진지한 엉뚱 가이드는 최근 8편 안에 한 번까지', () => {
    const at = (i: number) => Array.from({ length: 10 }, (_, k) => (k === i ? 'deadpan' : info[k]!));
    expect(humorRotation(at(6)).allowed).not.toContain('deadpan');
    expect(humorRotation(at(7)).allowed).not.toContain('deadpan');
    expect(humorRotation(at(8)).allowed).toContain('deadpan');
  });

  it('웃음 형식은 한 묶음에 하나만 보여 주고, 나머지는 정보형이다', () => {
    const user = storyUser(kimchi, { count: 3 });
    expect(offeredHumor(user)).toHaveLength(1);
    expect(offered(user).filter((t) => !isHumorType(t)).length).toBeGreaterThanOrEqual(3);
    expect(user).toContain('웃음 형식은 이번 묶음에');
    expect(user).toContain('나머지 대본은 정보형');
  });

  it('돌려쓰기에 막히면 웃음 형식을 하나도 보여 주지 않는다', () => {
    const recent = [{ storyType: 'documentary', title: '다큐', firstLine: '지금 팬 위에서' }];
    const user = storyUser(kimchi, { count: 3, recent });
    expect(offeredHumor(user)).toEqual([]);
    expect(user).not.toContain('웃음 형식은 이번 묶음에');
  });

  it('돌려쓰기는 만든 영상 기록(recentVideos)이 있으면 그것으로 센다', () => {
    const recent = [{ storyType: 'documentary', title: '초안', firstLine: '지금' }];
    expect(offeredHumor(storyUser(kimchi, { count: 3, recent, recentVideos: ['why', 'quick'] }))).toHaveLength(1);
    expect(offeredHumor(storyUser(kimchi, { count: 3, recentVideos: ['wordplay'] }))).toEqual([]);
  });

  it('꼭 쓸 형식(견본 요청)은 돌려쓰기보다 앞선다: 웃음 형식이면 그것 하나만, 정보형이면 돌려쓰기 그대로', () => {
    const blocked = ['relatable', 'why'];
    const user = storyUser(kimchi, { count: 3, recentVideos: blocked, mustInclude: 'wordplay' });
    expect(offeredHumor(user)).toEqual(['wordplay']);
    expect(user).toContain('반드시 형식 wordplay');
    const deadpanTwice = storyUser(kimchi, { count: 3, recentVideos: ['why', 'deadpan'], mustInclude: 'deadpan' });
    expect(offeredHumor(deadpanTwice)).toEqual(['deadpan']);
    expect(offeredHumor(storyUser(kimchi, { count: 3, recentVideos: blocked, mustInclude: 'why' }))).toEqual([]);
  });

  it('고르는 순서: 연구자 답변이 있으면 사연 한 통, 아니면 오래 안 쓴 형식부터', () => {
    expect(pickHumorType(availableStoryTypes(kimchi), ['why'], { expertAnswers: ['반죽은 미리 만들지 말라고 수업마다 말해요.'] })).toBe('listener-story');
    const avail = ['wordplay', 'documentary', 'why'];
    expect(pickHumorType(avail, ['why', 'quick', 'standard', 'occasion', 'why', 'quick', 'documentary'])).toBe('wordplay');
    expect(pickHumorType(avail, ['why', 'quick', 'standard', 'occasion', 'why', 'quick', 'wordplay'])).toBe('documentary');
    // 둘 다 기록에 있으면 더 오래전에 쓴 것
    expect(pickHumorType(avail, ['why', 'quick', 'standard', 'occasion', 'why', 'quick', 'wordplay', 'standard', 'why', 'documentary'])).toBe('documentary');
    expect(pickHumorType(['why'], [])).toBeUndefined();
  });

  it('요리가 다르면 처음 고르는 웃음 형식도 달라질 수 있다 (늘 같은 형식이 먼저 오지 않게)', () => {
    const avail = [...HUMOR_TYPES];
    const picks = new Set(SAMPLE_RECIPES.concat(SAMPLE_RECIPES.map((r) => ({ ...r, dishName: `${r.dishName} 2` }))).map((r) => pickHumorType(avail, [], { seed: r.dishName })));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('글자 그대로를 낼 때는 원본에 나오는 말장난 후보와 맞는 그림을 알려 준다', () => {
    const user = storyUser(kimchi, { count: 3, mustInclude: 'wordplay' });
    expect(user).toContain('말장난 후보');
    expect(user).toMatch(/부치다 — [^/]+ \/ mailbox·hand-fan/);
  });
});

describe('글자 그대로: 다른 뜻 장면 정리 (안전망)', () => {
  const front = (over: Partial<StoryDraft['scenes'][number]>[] = []): StoryDraft['scenes'] =>
    (
      [
        { beat: 'hook', type: 'intro', emotion: 'curious', place: 'dining', line: '전은 부친다고 하죠.' },
        { beat: 'context', type: 'tip', emotion: 'confident', place: 'dining', line: '글자 그대로면 우체통에 넣어 보내는 일이에요.', cardTitle: BRAND.tipPhrase, cardItems: [kimchi.tips[0]!] },
        { beat: 'context', type: 'gag', emotion: 'confident', place: 'dining', line: '아니면 커다란 부채로 바람을 보내는 일이고요.', gag: 'hand-fan' },
        { beat: 'point', type: 'question', emotion: 'confident', place: 'lab', line: '물론 그 부치다는 아니에요. 요리에서 말하는 부치다는 팬에 익히는 거예요.' },
        { beat: 'point', type: 'gag', emotion: 'confident', place: 'lab', line: '이제 진짜 순서예요.', gag: 'moon' },
      ] as StoryDraft['scenes']
    ).map((s, i) => ({ ...s, ...over[i] }));

  it('전환 줄 앞의 팁 장면은 농담 그림 장면이 되고(우체통 그림), 전환 줄 뒤의 농담 장면은 질문 장면이 된다', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('wordplay', front()), 'w1'));
    const types = c.script.scenes.map((s) => s.type);
    expect(types.slice(0, 5)).toEqual(['intro', 'gag', 'gag', 'question', 'question']);
    expect(c.script.scenes[1]).toMatchObject({ gag: 'mailbox' });
    expect(c.script.scenes[1]!.cardTitle).toBeUndefined();
    expect(c.script.scenes[4]!.gag).toBeUndefined();
    expect(c.notes.join(' ')).toContain('농담이라고 밝힌 뒤의 장면이라');
    expect(c.warnings.join(' ')).not.toContain('그 뜻이 아니다');
    expect(storyBlocked(c)).toBe(false);
  });

  it('그 뜻이 아니라고 밝히는 줄이 없으면 경고한다', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('wordplay', front([{}, {}, {}, { line: '팬에 익히는 것도 부친다고 해요.' }])), 'w2'));
    expect(c.warnings.join(' ')).toContain('그 뜻이 아니다');
  });

  it('다른 형식의 농담 장면은 여전히 질문 장면으로 되돌린다', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('town-rules', front()), 'w3'));
    expect(c.script.scenes.some((s) => s.type === 'gag')).toBe(false);
  });
});

describe('사연 한 통: 지어낸 사연을 진짜처럼 보이지 않게', () => {
  const story = (letter: Partial<StoryDraft['scenes'][number]> = {}, hookLine = '오늘 사연은 명절 전날 부엌에서 왔어요.'): StoryDraft['scenes'] => [
    { beat: 'hook', type: 'intro', emotion: 'curious', place: 'dining', line: '명절 전날 김치전 이야기예요.' },
    { beat: 'context', type: 'question', emotion: 'curious', place: 'dining', line: hookLine, ...letter },
    { beat: 'context', type: 'mistake', emotion: 'curious', place: 'kitchen', line: '아침에 반죽을 미리 해 두니 오후 전이 자꾸 처졌대요.' },
  ];

  it('사연 카드가 없으면 첫 이야기 장면에 "가상 사연" 카드를 붙이고, 진짜 정보 전까지 표시가 보인다', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('listener-story', story()), 'l1'));
    expect(c.script.scenes[0]!.cardTitle).toBe(LETTER_FICTION);
    expect(c.notes.join(' ')).toContain('사연 카드가 없어');
    expect(fictionStoryScenes(c.script)).toEqual([0, 1, 2]);
  });

  it('"선생님이 받은 질문"은 카드 글이 연구자 답변 원문에 있을 때만, 아니면 "가상 사연"으로 바꾼다', () => {
    const answer = '반죽을 아침에 미리 만들어 두면 왜 질어지냐는 질문을 수업에서 자주 받아요.';
    const real = kimchiDraft('listener-story', story({ cardTitle: LETTER_REAL, cardItems: ['반죽을 아침에 미리 만들어 두면 왜 질어지냐는 질문'] }));
    expect(ok(finalizeStory(kimchi, real, 'l2', { expertAnswers: [answer] })).script.scenes[1]!.cardTitle).toBe(LETTER_REAL);
    const noAnswer = ok(finalizeStory(kimchi, real, 'l3'));
    expect(noAnswer.script.scenes[1]!.cardTitle).toBe(LETTER_FICTION);
    expect(noAnswer.notes.join(' ')).toContain('연구자 답변 원문에 없어');
    const made = kimchiDraft('listener-story', story({ cardTitle: LETTER_REAL, cardItems: ['반죽을 미리 만든 집이 있었대요'] }));
    expect(ok(finalizeStory(kimchi, made, 'l4', { expertAnswers: [answer] })).script.scenes[1]!.cardTitle).toBe(LETTER_FICTION);
    // 진짜 답변 카드에는 '가상 사연' 표시가 붙지 않는다
    expect(fictionStoryScenes(ok(finalizeStory(kimchi, real, 'l5', { expertAnswers: [answer] })).script)).toEqual([]);
  });

  it('가상 사연인데 보내 주셨다·실화처럼 말하면 만들 수 없다', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('listener-story', story({ cardTitle: LETTER_FICTION }, '청취자분이 보내 주신 실화예요.')), 'l6'));
    expect(storyBlocked(c)).toBe(true);
    expect(c.issues.some((i) => i.level === 'error' && i.code === 'claim')).toBe(true);
    const fine = ok(finalizeStory(kimchi, kimchiDraft('listener-story', story({ cardTitle: LETTER_FICTION })), 'l7'));
    expect(storyBlocked(fine)).toBe(false);
  });

  it('사연 카드 이름은 다른 형식에서 빠지고, 사연 카드는 하나만 남는다', () => {
    const other = ok(finalizeStory(kimchi, kimchiDraft('relatable', story({ cardTitle: LETTER_FICTION })), 'l8'));
    expect(other.script.scenes.some((s) => s.cardTitle === LETTER_FICTION)).toBe(false);
    const two = story({ cardTitle: LETTER_FICTION });
    two[2] = { ...two[2]!, cardTitle: LETTER_FICTION };
    const c = ok(finalizeStory(kimchi, kimchiDraft('listener-story', two), 'l9'));
    expect(c.script.scenes.filter((s) => s.cardTitle === LETTER_FICTION)).toHaveLength(1);
  });
});

describe('형식별 안전 검사', () => {
  it('부엌 다큐: 음식을 아파하는 생명처럼 그리면 경고 (요리 말 "숨이 죽다"는 괜찮다)', () => {
    const hurt = ok(finalizeStory(kimchi, kimchiDraft('documentary', [{ beat: 'hook', type: 'intro', emotion: 'curious', place: 'kitchen', line: '뜨거운 팬 위, 반죽이 비명을 지릅니다.' }]), 'd1'));
    expect(hurt.warnings.join(' ')).toContain('아파하는 생명');
    const calm = ok(finalizeStory(kimchi, kimchiDraft('documentary', [{ beat: 'hook', type: 'intro', emotion: 'curious', place: 'kitchen', line: '지금, 반죽 가장자리 색이 바뀝니다. 숨이 죽듯 가라앉아요.' }]), 'd2'));
    expect(calm.warnings.join(' ')).not.toContain('아파하는 생명');
  });

  it('이럴 때 꼭 있는 일: 사람을 유형으로 묶으면 경고', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('relatable', [{ beat: 'hook', type: 'intro', emotion: 'curious', place: 'kitchen', line: '김치전 부치는 사람 특징이 있어요.' }]), 'r1'));
    expect(c.warnings.join(' ')).toContain('유형으로 묶는');
  });

  it('적당히의 나라: 가족이 한 말처럼 지어낸 인용은 경고', () => {
    const c = ok(finalizeStory(kimchi, kimchiDraft('vague-vs-note', [{ beat: 'hook', type: 'intro', emotion: 'curious', place: 'kitchen', line: '엄마가 기름은 적당히라고 하셨죠.' }]), 'v1'));
    expect(c.warnings.join(' ')).toContain('지어낸 인용');
    const plain = ok(finalizeStory(kimchi, kimchiDraft('vague-vs-note', [{ beat: 'hook', type: 'intro', emotion: 'curious', place: 'kitchen', line: '기름은 적당히, 흔히 듣는 말이죠.' }]), 'v2'));
    expect(plain.warnings.join(' ')).not.toContain('지어낸 인용');
  });
});
