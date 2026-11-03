import type { RecipeInput, Script } from './types.ts';
import { BRAND } from './brand.ts';
import { formatIngredient } from './format.ts';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: 'quantity' | 'ingredient' | 'step' | 'safety' | 'claim' | 'branding';
  message: string;
  sceneId?: string;
}

const UNITS = [
  'kg', 'mg', 'g', 'ml', 'mL', 'L', 'l', 'cc',
  '컵', 'C', '큰술', '작은술', '스푼', '숟가락', '티스푼', 'T', 't',
  '개', '알', '장', '줌', '꼬집', '쪽', '대', '모',
  '시간', '분', '초', '도', '°C', '℃', '배', '%',
];
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:\/\d+)?|반|한|두|세|네|다섯)`;
const UNIT = `(?:${[...UNITS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`;
// "3~4분", "1/2컵", "두 큰술", "170도" 같은 분량·시간·온도 표현
const QUANTITY_RE = new RegExp(String.raw`(${NUM}(?:\s*[~\-]\s*${NUM})?)\s*(${UNIT})(?![a-zA-Z])`, 'g');

const KOREAN_NUMBERS: Record<string, string> = { 반: '0.5', 한: '1', 두: '2', 세: '3', 네: '4', 다섯: '5' };

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNumber(n: string): string {
  const k = KOREAN_NUMBERS[n];
  if (k) return k;
  if (n.includes('/')) {
    const [a, b] = n.split('/').map(Number);
    if (a !== undefined && b) return String(Math.round((a / b) * 1000) / 1000);
  }
  return String(Number(n));
}

function normalizeUnit(u: string): string {
  if (u === '°C' || u === '℃') return '도';
  if (u === 'mL' || u === 'cc') return 'ml';
  if (u === 'l') return 'L';
  if (u === 'T' || u === '스푼' || u === '숟가락') return '큰술';
  if (u === 'C') return '컵';
  if (u === 't' || u === '티스푼') return '작은술';
  return u;
}

export interface Quantity {
  raw: string;
  normalized: string;
}

/** 문장 속 분량·시간·온도 표현을 정규화해서 뽑는다. */
export function extractQuantities(text: string): Quantity[] {
  const result: Quantity[] = [];
  for (const m of text.matchAll(QUANTITY_RE)) {
    const numPart = m[1] ?? '';
    const unit = m[2] ?? '';
    // "한" "두" 같은 관형사는 단위와 붙어 있을 때만 분량으로 본다 (예: "한 번에"는 제외됨)
    const nums = numPart.split(/\s*[~\-]\s*/).map(normalizeNumber);
    result.push({ raw: m[0].trim(), normalized: `${nums.join('~')}${normalizeUnit(unit)}` });
  }
  return result;
}

export function recipeText(recipe: RecipeInput): string {
  return [
    ...recipe.ingredients.map(formatIngredient),
    ...recipe.steps,
    recipe.principle,
    ...recipe.tips,
    recipe.commonMistake,
    recipe.misconception ?? '',
    recipe.story ?? '',
  ].join('\n');
}

const SAFETY_WORDS = [
  '가열', '익혀', '익힌', '덜 익', '날것', '생으로', '보관', '냉장', '냉동', '해동', '실온', '상온',
  '위생', '식중독', '세균', '기름 온도', '발연점', '화상', '알레르기', '유통기한', '재가열',
];
const CLAIM_PATTERNS: { re: RegExp; hint: string }[] = [
  { re: /연구\s*결과|연구에\s*따르면|논문/, hint: '연구·논문 근거' },
  { re: /실험\s*결과|실험해\s*보니|실험했더니/, hint: '실험 결과 표현' },
  { re: /증명|입증|과학적으로\s*밝혀/, hint: '증명·입증 표현' },
  { re: /100\s*%|무조건|절대로?\s/, hint: '단정적 표현' },
];

/**
 * 대본을 원본 레시피와 대조한다.
 * 자동 검사는 검수 보조일 뿐이며, 최종 판단은 연구자 체크리스트로 한다.
 */
export function checkScript(recipe: RecipeInput, script: Script): Issue[] {
  const issues: Issue[] = [];
  const source = new Set(extractQuantities(recipeText(recipe)).map((q) => q.normalized));
  const ingredientLines = recipe.ingredients.map(formatIngredient);

  for (const scene of script.scenes) {
    const sceneText = [scene.line, scene.cardTitle ?? '', ...(scene.cardItems ?? [])].join('\n');

    for (const q of extractQuantities(sceneText)) {
      if (!source.has(q.normalized)) {
        issues.push({
          level: 'error',
          code: 'quantity',
          sceneId: scene.id,
          message: `원본에 없는 분량·시간·온도 "${q.raw}"가 있습니다.`,
        });
      }
    }

    if (scene.type === 'ingredients') {
      for (const item of scene.cardItems ?? []) {
        if (!ingredientLines.includes(item)) {
          issues.push({
            level: 'error',
            code: 'ingredient',
            sceneId: scene.id,
            message: `재료 카드의 "${item}"이(가) 원본 재료 목록과 다릅니다.`,
          });
        }
      }
    }

    if (scene.type === 'steps') {
      let lastIndex = -1;
      for (const item of scene.cardItems ?? []) {
        const idx = recipe.steps.findIndex((s) => s.includes(item) || item.includes(s));
        if (idx === -1) {
          issues.push({
            level: 'warning',
            code: 'step',
            sceneId: scene.id,
            message: `조리 단계 "${item}"을(를) 원문에서 찾지 못했습니다. 요약 표현이 맞는지 확인하세요.`,
          });
        } else if (idx < lastIndex) {
          issues.push({
            level: 'error',
            code: 'step',
            sceneId: scene.id,
            message: `조리 단계 순서가 원문과 다릅니다: "${item}"`,
          });
        } else {
          lastIndex = idx;
        }
      }
    }

    const safety = SAFETY_WORDS.filter((w) => sceneText.includes(w));
    if (safety.length > 0) {
      issues.push({
        level: 'warning',
        code: 'safety',
        sceneId: scene.id,
        message: `안전 관련 표현(${safety.join(', ')})이 있습니다. 가열·보관·위생 정보를 따로 확인하세요.`,
      });
    }

    for (const p of CLAIM_PATTERNS) {
      if (p.re.test(sceneText)) {
        issues.push({
          level: 'warning',
          code: 'claim',
          sceneId: scene.id,
          message: `${p.hint}이 있습니다. 실제 근거가 없으면 사실처럼 말하지 않도록 고치세요.`,
        });
      }
    }
  }

  // 훅이 맨 앞에 오는 대본은 두 번째 장면까지를 오프닝으로 본다
  const first = script.scenes.slice(0, 2).map((s) => s.line).join('\n');
  const last = script.scenes.at(-1)?.line ?? '';
  const all = script.scenes.map((s) => s.line).join('\n');
  if (!first.includes(BRAND.labName)) {
    issues.push({ level: 'info', code: 'branding', message: `오프닝에 "${BRAND.labName}"이 없습니다.` });
  }
  if (!all.includes(BRAND.notePhrase)) {
    issues.push({ level: 'info', code: 'branding', message: `중간에 "${BRAND.notePhrase}" 문구가 없습니다.` });
  }
  if (!script.scenes.some((s) => s.type === 'tip' && s.line.includes(BRAND.tipPhrase)) && !last.includes(BRAND.tipPhrase)) {
    issues.push({ level: 'info', code: 'branding', message: `엔딩에 "${BRAND.tipPhrase}" 문구가 없습니다.` });
  }
  return issues;
}
