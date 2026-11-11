import { describe, expect, it } from 'vitest';
import { buildStyledScript, checkScript, extractQuantities, quantityIssues, type RecipeInput, type Script } from './index.ts';

/** 원칙 1(원본 재료·분량·순서를 바꾸지 않음)을 지키는 검사. 감사에서 찾은 실제 한국어 입력을 그대로 고정한다. */
const base: RecipeInput = {
  topic: '불고기 양념, 왜 이 비율일까?',
  dishName: '불고기',
  category: 'science',
  format: 'explainer',
  ingredients: [
    { name: '소고기', amount: '300g' },
    { name: '간장', amount: '2큰술' },
    { name: '설탕', amount: '1큰술' },
    { name: '배추', amount: '1포기' },
    { name: '물', amount: '1과 1/2컵' },
  ],
  steps: ['간장 2큰술과 설탕 1큰술을 섞는다.', '소고기를 양념에 30분 재운다.', '센 불에서 3분 볶는다.'],
  principle: '설탕이 먼저 스며들어야 고기가 부드러워진다.',
  tips: ['양념은 하루 전에 만들어 두면 맛이 깊어진다.'],
  commonMistake: '',
  misconception: '고기는 200도에서 구워야 한다.',
  source: 'x',
  foodKind: 'auto',
};

const script = (line: string, extra: Partial<Script['scenes'][number]> = {}): Script => ({
  title: 't',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'joy', line: '이희재의 맛 연구소에서 오늘도 실험!' },
    { id: 's2', type: 'explain', emotion: 'joy', line, ...extra },
    { id: 's3', type: 'outro', emotion: 'joy', line: '끝!' },
  ],
});
const quantityErrors = (r: RecipeInput, s: Script) => checkScript(r, s).filter((i) => i.code === 'quantity' && i.level === 'error');

describe('분량은 재료마다 원본과 짝지어 대조한다', () => {
  it('간장 2큰술·설탕 1큰술을 서로 바꾸면 오류', () => {
    const errors = quantityErrors(base, script('간장 1큰술, 설탕 2큰술을 넣어요.'));
    expect(errors.map((e) => e.message).join(' ')).toContain('간장');
    expect(errors.map((e) => e.message).join(' ')).toContain('설탕');
    expect(errors).toHaveLength(2);
  });

  it('원본대로면 통과 (조사·순서가 달라도)', () => {
    expect(quantityErrors(base, script('간장은 2큰술, 설탕은 1큰술 넣어요.'))).toEqual([]);
    expect(quantityErrors(base, script('간장 2큰술과 설탕 1큰술을 섞어요.'))).toEqual([]);
  });

  it('흔한 오해 문장의 틀린 분량은 다른 장면에서 허용하지 않는다', () => {
    expect(quantityErrors(base, script('200도에서 구워요.'))).toHaveLength(1);
    expect(quantityErrors(base, script('고기는 200도에서 구워요.'))).toHaveLength(1);
    // 오해를 그대로 인용하는 훅 장면에서는 쓸 수 있다
    expect(quantityErrors(base, script('"고기는 200도에서 구워야 한다" 이렇게 알고 계셨죠? 사실은 달라요!'))).toEqual([]);
  });

  it('새 단위(포기)도 재료와 짝지어 잡는다', () => {
    expect(quantityErrors(base, script('배추는 2포기 준비해요.'))).toHaveLength(1);
    expect(quantityErrors(base, script('배추는 1포기 준비해요.'))).toEqual([]);
  });

  it('"1과 1/2컵"을 "1/2컵"으로 바꾸면 오류', () => {
    expect(quantityErrors(base, script('물은 1/2컵이면 돼요.'))).toHaveLength(1);
    expect(quantityErrors(base, script('물은 1과 1/2컵이에요.'))).toEqual([]);
  });

  it('quantityIssues: 훅 문장 검증에도 같은 규칙을 쓴다', () => {
    expect(quantityIssues(base, '180도에서 구워요')).toHaveLength(1);
    expect(quantityIssues(base, '30분 재워요')).toEqual([]);
  });
});

describe('흔한 말을 분량으로 잘못 읽지 않는다', () => {
  it.each(['반대로 뒤집어요', '재료를 한쪽으로 밀어요', '한 모금 마셔 보세요', '두 분이서 드세요', '한 장면씩 볼게요', '2분의 1만 넣어요', '두 대접에 나눠요', '딱 5단계면 끝!', '4개월 숙성'])('%s → 분량 없음', (t) => {
    expect(extractQuantities(t)).toEqual([]);
  });

  it('오탐 문장이 들어간 맞는 대본은 승인을 막지 않는다', () => {
    expect(quantityErrors(base, script('반대로 뒤집고 재료를 한쪽으로 밀어요. 두 분이서 드세요.'))).toEqual([]);
  });
});

describe('단위·수사 목록', () => {
  it.each([
    ['배추 1포기', '1포기'],
    ['마늘 3톨', '3톨'],
    ['밥 1공기', '1공기'],
    ['육수 1국자', '1국자'],
    ['고기 200그램', '200g'],
    ['여섯 개', '6개'],
    ['열 개', '10개'],
    ['새우 5마리', '5마리'],
    ['2인분', '2인분'],
    ['시금치 1단', '1단'],
    ['참기름 세 방울', '3방울'],
    ['물 1리터', '1L'],
    ['우유 200밀리리터', '200ml'],
    ['1과 1/2컵', '1.5컵'],
    ['1 1/2T', '1.5큰술'],
    ['한컵', '1컵'],
  ])('%s → %s', (t, n) => {
    expect(extractQuantities(t).map((q) => q.normalized)).toEqual([n]);
  });
});

describe('조리 단계 순서', () => {
  const repeat: RecipeInput = { ...base, misconception: undefined, steps: ['물 2컵을 붓는다.', '어묵을 넣는다.', '물 2컵을 붓는다.', '간을 본다.'] };

  it('같은 단계가 두 번 나오는 레시피도 엔진 대본은 순서 오류가 없다', () => {
    const { script: s } = buildStyledScript(repeat, { style: 'experiment', hookType: 'question' });
    expect(checkScript(repeat, s).filter((i) => i.code === 'step')).toEqual([]);
  });

  it('짧은 카드 항목이 앞 단계와 엉뚱하게 짝지어지지 않는다', () => {
    const r: RecipeInput = { ...base, steps: ['양파를 볶는다.', '고기를 넣고 볶는다.', '볶는다.'] };
    const s = script('순서예요', { type: 'steps', cardItems: ['양파를 볶는다.', '고기를 넣고 볶는다.', '볶는다.'] });
    expect(checkScript(r, s).filter((i) => i.code === 'step')).toEqual([]);
  });

  it('순서를 바꾸면 여전히 오류', () => {
    const s = script('순서예요', { type: 'steps', cardItems: [repeat.steps[1]!, repeat.steps[0]!, repeat.steps[3]!, repeat.steps[2]!] });
    expect(checkScript(repeat, s).some((i) => i.code === 'step' && i.level === 'error')).toBe(true);
  });
});
