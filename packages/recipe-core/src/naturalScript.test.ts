import { describe, expect, it } from 'vitest';
import { BRAND, SAMPLE_RECIPES, STYLE_IDS, buildStyledScript, contentCandidates, formal, plainDishName, spoken, type RecipeInput } from './index.ts';

/**
 * 대본이 사람이 말하는 것처럼 들리는지 (맛조수 말투, 이름 반복, 앞뒤 연결).
 * 화면 카드에는 원본 문장을 그대로 두고, 대사만 말투로 바꾼다.
 */
describe('말하는 문장으로 바꾸기 (끝맺음만)', () => {
  it.each([
    ['두부와 배추를 함께 볶으면 청국장의 짠맛이 희석된다', '두부와 배추를 함께 볶으면 청국장의 짠맛이 희석돼요.'],
    ['떫은맛이 줄어듭니다.', '떫은맛이 줄어들어요.'],
    ['반죽이 질어집니다.', '반죽이 질어져요.'],
    ['겉면이 다시 젖습니다.', '겉면이 다시 젖어요.'],
    ['초록색이 살아 있습니다.', '초록색이 살아 있어요.'],
    ['껍질과 떨어지기 쉬워집니다.', '껍질과 떨어지기 쉬워져요.'],
    ['고소하고 걸쭉하게 만듭니다.', '고소하고 걸쭉하게 만들어요.'],
    ['찬물로 반죽하면 바삭해진다', '찬물로 반죽하면 바삭해져요.'],
    ['팬이 뜨겁다', '팬이 뜨거워요.'],
    ['맛이 다르다', '맛이 달라요.'],
    ['국자로 젓는다', '국자로 저어요.'],
    ['물을 붓는다', '물을 부어요.'],
    ['면이 붇는다', '면이 불어요.'],
    ['설탕을 녹인다', '설탕을 녹여요.'],
    ['고기를 굽는다', '고기를 구워요.'],
    ['향이 좋다!', '향이 좋아요!'],
  ])('%s → %s', (from, to) => expect(spoken(from)).toBe(to));

  it('확실하지 않으면 합니다체로, 이미 말투거나 끝맺음이 없으면 그대로', () => {
    expect(spoken('이것이 핵심이다')).toBe('이것이 핵심입니다.');
    expect(spoken('식힘망에 올리세요.')).toBe('식힘망에 올리세요.');
    expect(spoken('반죽은 꼭 찬물!')).toBe('반죽은 꼭 찬물!');
  });

  it('숫자·분량은 건드리지 않는다', () => {
    expect(spoken('140도 정도의 기름에 튀기면 바삭해집니다.')).toBe('140도 정도의 기름에 튀기면 바삭해져요.');
  });
});

describe('요리 이름에서 꾸미는 말 빼기', () => {
  it('실패 장면에서 "제 바삭한 김치전이 왜 이렇죠?"가 되지 않게', () => {
    expect(plainDishName('바삭한 김치전')).toBe('김치전');
    expect(plainDishName('부드러운 계란찜')).toBe('계란찜');
    expect(plainDishName('반숙 달걀')).toBe('반숙 달걀');
    expect(plainDishName('청국장 덮밥')).toBe('청국장 덮밥');
  });
});

const cheonggukjang: RecipeInput = {
  topic: '짠 청국장, 덮밥으로 만들면 왜 덜 짤까?',
  dishName: '청국장 덮밥',
  category: 'science',
  format: 'explainer',
  ingredients: [
    { name: '청국장', amount: '100g' },
    { name: '두부', amount: '1/2모' },
  ],
  steps: ['팬에 들기름을 두르고 배추를 볶는다.', '두부와 청국장을 넣고 으깨며 볶는다.'],
  principle: '두부와 배추를 함께 볶으면 청국장의 짠맛이 희석된다',
  tips: ['청국장은 마지막에 넣는다'],
  commonMistake: '',
  source: 'x',
  foodKind: 'auto',
};

describe('연출 엔진 대본이 자연스럽게 들린다', () => {
  const recipes = [...SAMPLE_RECIPES, cheonggukjang];

  it('대사 끝맺음에 글말(~한다, ~된다)이 남지 않고, 화면 카드는 원본 문장 그대로다', () => {
    for (const r of recipes)
      for (const style of STYLE_IDS) {
        let script;
        try {
          script = buildStyledScript(r, { style }).script;
        } catch {
          continue;
        }
        for (const s of script.scenes) {
          expect(s.line, `${r.dishName}/${style}: ${s.line}`).not.toMatch(/[가-힣](?:는|ㄴ)?다[.!]?$/);
          if (s.type === 'explain' && s.cardTitle === BRAND.notePhrase) expect(r.principle).toContain(s.cardItems![0]!);
        }
      }
  });

  it('연구소 이름은 대사에서 한 번만 말하고(엔딩), 연구자 이름·직함은 화면 카드로 보여 준다', () => {
    for (const r of recipes)
      for (const c of contentCandidates(r, { count: 5 }).candidates) {
        const lines = c.script.scenes.map((s) => s.line).join('\n');
        expect(lines.split(BRAND.labName).length - 1, `${r.dishName}/${c.key}`).toBe(1);
        expect(lines).not.toContain('에 따르면');
        expect(lines).not.toContain(BRAND.tipPhrase);
        // 엔딩은 매번 같은 말로 끝난다 (고정 엔딩)
        expect(c.script.scenes.at(-1)!.line.endsWith(BRAND.signOff)).toBe(true);
      }
  });

  it('훅에서 말한 문장(시간 절약 팁, 놀라운 사실)을 본문에서 다시 말하지 않는다', () => {
    const pasta = SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!;
    const { script } = buildStyledScript(pasta, { style: 'sensory', hookType: 'time-saver' });
    expect(script.scenes.filter((s) => s.line.includes('4통으로 나눠'))).toHaveLength(1);
    const egg = SAMPLE_RECIPES.find((r) => r.dishName === '반숙 달걀')!;
    const fact = buildStyledScript(egg, { style: 'experiment', hookType: 'surprising-fact' }).script;
    expect(fact.scenes.filter((s) => s.line.includes('신선한 달걀일수록'))).toHaveLength(1);
  });

  it('코미디형: 실패 장면이 없으면 "왜 이렇게 된 거죠?"·"이번엔 제대로!"라고 하지 않는다', () => {
    const spinach = SAMPLE_RECIPES.find((r) => r.dishName === '시금치나물')!;
    const q = buildStyledScript(spinach, { style: 'comedy', hookType: 'question' }).script.scenes.map((s) => s.line).join(' ');
    expect(q).not.toContain('이렇게 된 거죠');
    expect(q).not.toContain('이번엔 제대로');
    expect(q).not.toContain('대성공');
    const skit = buildStyledScript(spinach, { style: 'comedy', hookType: 'skit' }).script.scenes.map((s) => s.line).join(' ');
    expect(skit).toContain('대체 왜 이렇게 된 거죠');
  });

  it('주제를 훅에서 이미 말했으면 다음 장면에서 다시 읽지 않는다', () => {
    const spinach = SAMPLE_RECIPES.find((r) => r.dishName === '시금치나물')!;
    const { script } = buildStyledScript(spinach, { style: 'experiment', hookType: 'question' });
    expect(script.scenes.filter((s) => s.line.includes(spinach.topic))).toHaveLength(1);
  });
});

describe('블로그 문단: 글말 끝맺음만 합니다체로', () => {
  it.each([
    ['청국장의 짠맛이 희석된다', '청국장의 짠맛이 희석됩니다.'],
    ['냄새가 강해진다.', '냄새가 강해집니다.'],
    ['물을 붓는다', '물을 붓습니다.'],
    ['반죽을 만든다', '반죽을 만듭니다.'],
    ['이것이 핵심이다', '이것이 핵심입니다.'],
    ['떫은맛이 줄어듭니다', '떫은맛이 줄어듭니다.'],
    ['전이 눅눅해졌어요.', '전이 눅눅해졌어요.'],
    ['반죽은 꼭 찬물!', '반죽은 꼭 찬물!'],
  ])('%s → %s', (from, to) => expect(formal(from)).toBe(to));
});
