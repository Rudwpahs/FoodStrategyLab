import { BRAND } from '../brand.ts';
import { formatIngredient } from '../format.ts';
import { EMOTIONS, SCENE_TYPES, ScriptSchema, type RecipeInput, type Script, CATEGORY_LABELS, FORMAT_LABELS } from '../types.ts';

/**
 * 무료 AI 채팅(ChatGPT·Claude·Gemini 웹)에 붙여넣을 프롬프트.
 * API 비용 없이 AI 대본을 받기 위한 '복사-붙여넣기' 방식이다.
 */
export function buildAiPrompt(recipe: RecipeInput): string {
  const source = {
    주제: recipe.topic,
    요리: recipe.dishName,
    분류: CATEGORY_LABELS[recipe.category],
    포맷: FORMAT_LABELS[recipe.format],
    재료: recipe.ingredients.map(formatIngredient),
    조리순서: recipe.steps,
    핵심원리: recipe.principle,
    전문가팁: recipe.tips,
    흔한실수: recipe.commonMistake || undefined,
  };

  return `너는 숏폼 요리 채널 "${BRAND.labName}"의 대본 작가야.
진행자는 캐릭터 "${BRAND.character}"(성급하고 궁금한 게 많은 연구소 조수, 가끔 요리 실수를 함)이고,
모든 전문 지식은 ${BRAND.researcherTitle} ${BRAND.researcher} 연구자의 원본 자료에서만 가져와.

## 반드시 지킬 규칙
1. 아래 원본 자료에 없는 분량·시간·온도·사실을 새로 만들지 마. 숫자는 원본 그대로 써.
2. 가상의 설명을 "실험 결과", "연구 결과", "증명됐다"처럼 사실로 표현하지 마.
3. 첫 장면 대사는 정확히 "${BRAND.openingLine}"로 시작해.
4. 원리를 설명할 때 "${BRAND.notePhrase}에 따르면…" 표현을 한 번 넣어.
5. 팁 장면은 "${BRAND.tipPhrase}!"로 시작해.
6. 전체 대사는 공백 제외 220자 안팎(약 30초). 한 장면 대사는 한두 문장.
7. 캐릭터는 시청자 대신 질문하는 역할이야. 반말 대신 친근한 존댓말을 써.
8. 포맷이 "캐릭터 코미디형"이면 캐릭터가 흔한 실수를 하는 장면(type "mistake")을 넣어.

## 출력 형식
설명 없이 JSON만 출력해.
{
  "title": "영상 제목",
  "scenes": [
    { "id": "s1", "type": "intro", "emotion": "joy", "line": "대사", "cardTitle": "화면 카드 제목(선택)", "cardItems": ["카드 항목(선택)"] }
  ]
}
- type: ${SCENE_TYPES.join(' | ')}
- emotion: ${EMOTIONS.join(' | ')}
- ingredients 장면의 cardItems는 원본 재료 문자열을 그대로 써.
- steps 장면의 cardItems는 원본 조리순서 문장을 순서대로 그대로 써.

## 원본 자료
${JSON.stringify(source, null, 2)}
`;
}

export type ParseResult = { ok: true; script: Script; notes: string[] } | { ok: false; error: string };

/** AI 응답(코드블록 포함 가능)에서 JSON을 꺼내 검증한다. */
export function parseAiScript(text: string, recipe: RecipeInput): ParseResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, error: 'JSON을 찾지 못했습니다. AI 응답 전체를 붙여넣었는지 확인하세요.' };

  let raw: unknown;
  try {
    raw = JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `JSON 형식 오류: ${(e as Error).message}` };
  }

  if (raw && typeof raw === 'object' && Array.isArray((raw as { scenes?: unknown }).scenes)) {
    (raw as { scenes: Record<string, unknown>[] }).scenes.forEach((s, i) => {
      if (s && typeof s === 'object' && !s.id) s.id = `s${i + 1}`;
    });
  }

  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `대본 구조 오류 (${first?.path.join('.') || '전체'}): ${first?.message ?? '알 수 없음'}` };
  }
  return enforceSourceData(recipe, parsed.data);
}

/** 재료 카드는 항상 원본 재료 목록으로 고정한다 (AI가 분량을 바꾸는 것을 막는다). */
export function enforceSourceData(recipe: RecipeInput, script: Script): { ok: true; script: Script; notes: string[] } {
  const notes: string[] = [];
  const original = recipe.ingredients.map(formatIngredient);
  const scenes = script.scenes.map((s) => {
    if (s.type !== 'ingredients') return s;
    const same = JSON.stringify(s.cardItems ?? []) === JSON.stringify(original);
    if (!same) notes.push(`${s.id} 장면의 재료 카드를 원본 재료 목록으로 되돌렸습니다.`);
    return { ...s, cardItems: original };
  });
  return { ok: true, script: { ...script, scenes }, notes };
}
