import { describe, expect, it } from 'vitest';
import {
  BRAND,
  RecipeInputSchema,
  SAMPLE_RECIPES,
  brandDescription,
  buildAiPrompt,
  canApprove,
  canRender,
  checkScript,
  deriveStatus,
  estimateScriptSeconds,
  extractQuantities,
  formatIngredient,
  generateTemplateScript,
  parseAiScript,
  type Script,
} from './index.ts';

const kimchi = SAMPLE_RECIPES[0]!;
const spinach = SAMPLE_RECIPES[1]!;

describe('레시피 데이터 모델', () => {
  it('원본 재료·분량이 변경 없이 보존된다', () => {
    const parsed = RecipeInputSchema.parse(structuredClone(kimchi));
    expect(parsed.ingredients).toEqual(kimchi.ingredients);
    const script = generateTemplateScript(parsed);
    const card = script.scenes.find((s) => s.type === 'ingredients');
    expect(card?.cardItems).toEqual(kimchi.ingredients.map(formatIngredient));
    // 생성 과정에서 입력 객체가 바뀌지 않아야 한다
    expect(parsed).toEqual(RecipeInputSchema.parse(kimchi));
  });

  it('필수 항목이 없으면 거부한다', () => {
    expect(RecipeInputSchema.safeParse({ topic: '', principle: '' }).success).toBe(false);
  });
});

describe('분량 추출', () => {
  it('숫자·분수·한글 수사·범위를 정규화한다', () => {
    const q = extractQuantities('물 3/4컵, 소금 두 큰술, 170℃에서 3~4분, 반 컵');
    expect(q.map((x) => x.normalized)).toEqual(['0.75컵', '2큰술', '170도', '3~4분', '0.5컵']);
  });

  it('단위 없는 "한 번" 같은 표현은 분량으로 보지 않는다', () => {
    expect(extractQuantities('한 번에 섞어요')).toEqual([]);
  });
});

describe('템플릿 대본 생성', () => {
  it('브랜드 문구가 중간·팁·엔딩에 들어가고, 연구소 이름은 엔딩에서 한 번만 말한다 (연출 엔진과 같은 규칙)', () => {
    const script = generateTemplateScript(spinach);
    const lines = script.scenes.map((s) => s.line).join('\n');
    expect(lines.split(BRAND.labName).length - 1).toBe(1);
    expect(script.scenes.at(-1)!.line.endsWith(BRAND.signOff)).toBe(true);
    expect(script.scenes.some((s) => s.type === 'explain' && s.cardTitle === BRAND.notePhrase && s.line.startsWith(BRAND.noteLead))).toBe(true);
    expect(script.scenes.some((s) => s.type === 'tip' && s.cardTitle === BRAND.tipPhrase && s.line.startsWith(BRAND.tipLead))).toBe(true);
    expect(checkScript(spinach, script).filter((i) => i.code === 'branding')).toEqual([]);
  });

  it('코미디형은 실수 장면이 들어간다', () => {
    const script = generateTemplateScript(kimchi);
    expect(script.scenes.some((s) => s.type === 'mistake' && s.emotion === 'embarrassed')).toBe(true);
  });

  it('샘플 대본은 원본에 없는 분량 오류가 없고 30초 안팎이다', () => {
    for (const recipe of SAMPLE_RECIPES) {
      const script = generateTemplateScript(recipe);
      const errors = checkScript(recipe, script).filter((i) => i.level === 'error');
      expect(errors, recipe.topic).toEqual([]);
      expect(estimateScriptSeconds(script)).toBeLessThan(45);
    }
  });
});

describe('검수 보조 검사', () => {
  const base = generateTemplateScript(kimchi);

  it('원본에 없는 분량을 오류로 잡는다', () => {
    const bad: Script = structuredClone(base);
    bad.scenes[2]!.line = '소금 5큰술을 넣으세요';
    const issues = checkScript(kimchi, bad);
    expect(issues.some((i) => i.code === 'quantity' && i.level === 'error' && i.message.includes('5큰술'))).toBe(true);
  });

  it('재료 카드가 원본과 다르면 오류', () => {
    const bad: Script = structuredClone(base);
    bad.scenes.find((s) => s.type === 'ingredients')!.cardItems = ['잘 익은 김치 300g'];
    expect(checkScript(kimchi, bad).some((i) => i.code === 'ingredient')).toBe(true);
  });

  it('조리 단계 순서가 바뀌면 오류', () => {
    const bad: Script = structuredClone(base);
    const steps = bad.scenes.find((s) => s.type === 'steps')!;
    steps.cardItems = [kimchi.steps[2]!, kimchi.steps[0]!];
    expect(checkScript(kimchi, bad).some((i) => i.code === 'step' && i.level === 'error')).toBe(true);
  });

  it('근거 없는 실험·연구 표현과 안전 표현을 경고한다', () => {
    const bad: Script = structuredClone(base);
    bad.scenes[2]!.line = '실험 결과 100% 바삭해요. 반죽은 실온에 보관하세요.';
    const codes = checkScript(kimchi, bad).map((i) => i.code);
    expect(codes).toContain('claim');
    expect(codes).toContain('safety');
  });
});

describe('검수·승인 흐름', () => {
  it('미승인 대본은 최종 출력할 수 없다', () => {
    expect(canRender({ latestScriptVersion: null, approvedScriptVersion: null, renderedScriptVersion: null }).ok).toBe(false);
    expect(canRender({ latestScriptVersion: 2, approvedScriptVersion: null, renderedScriptVersion: null }).ok).toBe(false);
    expect(canRender({ latestScriptVersion: 2, approvedScriptVersion: 2, renderedScriptVersion: null }).ok).toBe(true);
  });

  it('승인 후 대본을 고치면 승인이 무효가 된다', () => {
    expect(deriveStatus({ latestScriptVersion: 3, approvedScriptVersion: 2, renderedScriptVersion: 2 })).toBe('review');
    expect(canRender({ latestScriptVersion: 3, approvedScriptVersion: 2, renderedScriptVersion: 2 }).ok).toBe(false);
  });

  it('상태를 버전으로 계산한다', () => {
    expect(deriveStatus({ latestScriptVersion: null, approvedScriptVersion: null, renderedScriptVersion: null })).toBe('draft');
    expect(deriveStatus({ latestScriptVersion: 1, approvedScriptVersion: 1, renderedScriptVersion: null })).toBe('approved');
    expect(deriveStatus({ latestScriptVersion: 1, approvedScriptVersion: 1, renderedScriptVersion: 1 })).toBe('rendered');
  });

  it('체크리스트를 모두 확인하고 검수자 이름이 있어야 승인된다', () => {
    const all = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
    expect(canApprove(all, '이희재').ok).toBe(true);
    expect(canApprove(all, ' ').ok).toBe(false);
    expect(canApprove({ ...all, safety: false }, '이희재').ok).toBe(false);
  });

  it("'검토한' 표현은 승인된 콘텐츠에만 쓴다", () => {
    expect(brandDescription(true)).toContain('검토한');
    expect(brandDescription(false)).not.toContain('검토한');
  });
});

describe('AI 붙여넣기 모드', () => {
  it('프롬프트에 원본과 규칙이 들어간다', () => {
    const prompt = buildAiPrompt(kimchi);
    expect(prompt).toContain('잘 익은 김치 200g');
    expect(prompt).toContain(BRAND.signOff);
    // 연구소 이름을 첫 대사에 넣으라는 규칙과 "이름은 엔딩에 한 번만" 규칙이 부딪히지 않는다
    expect(prompt).not.toContain(BRAND.openingLine);
    // 규칙 번호가 1부터 차례대로
    const numbers = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    // 흔한 오해·이야기도 원본 자료로 넘긴다
    const full = buildAiPrompt({ ...kimchi, misconception: '반죽은 미리 만들어 둬야 한다', story: '명절마다 부치던 전이에요.' });
    expect(full).toContain('반죽은 미리 만들어 둬야 한다');
    expect(full).toContain('명절마다 부치던 전이에요.');
  });

  it('AI가 바꿔 쓴 조리 순서 카드는 원본 순서 문장으로 되돌린다', () => {
    const answer = JSON.stringify({
      title: '김치전',
      scenes: [
        { type: 'intro', emotion: 'joy', line: '시작!' },
        { type: 'steps', emotion: 'confident', line: '순서!', cardItems: ['김치를 썬다', '반죽을 부친다'] },
        { type: 'outro', emotion: 'joy', line: BRAND.signOff },
      ],
    });
    const res = parseAiScript(answer, kimchi);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.script.scenes[1]!.cardItems).toEqual(kimchi.steps.slice(0, 5));
    expect(res.notes.join(' ')).toContain('조리 순서');
  });

  it('코드블록 응답을 파싱하고 재료 카드를 원본으로 고정한다', () => {
    const answer = '여기 대본이에요!\n```json\n' +
      JSON.stringify({
        title: '김치전',
        scenes: [
          { type: 'intro', emotion: 'joy', line: '시작해요!' },
          { type: 'ingredients', emotion: 'joy', line: '준비물!', cardItems: ['김치 1포기'] },
          { type: 'outro', emotion: 'joy', line: '또 만나요!' },
        ],
      }) + '\n```';
    const res = parseAiScript(answer, kimchi);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.script.scenes[0]?.id).toBe('s1');
    expect(res.script.scenes[1]?.cardItems).toEqual(kimchi.ingredients.map(formatIngredient));
    expect(res.notes.length).toBe(1);
  });

  it('잘못된 감정·형식은 거부한다', () => {
    expect(parseAiScript('대본 없음', kimchi).ok).toBe(false);
    const bad = JSON.stringify({ title: 't', scenes: [{ type: 'intro', emotion: 'angry', line: 'a' }, { type: 'outro', emotion: 'joy', line: 'b' }, { type: 'outro', emotion: 'joy', line: 'c' }] });
    expect(parseAiScript(bad, kimchi).ok).toBe(false);
  });
});
