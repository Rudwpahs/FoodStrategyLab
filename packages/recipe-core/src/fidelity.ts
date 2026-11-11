import type { RecipeInput, Script } from './types.ts';
import { BRAND } from './brand.ts';
import { formatIngredient, splitSentences } from './format.ts';
import { normalizeText } from './text.ts';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: 'quantity' | 'ingredient' | 'step' | 'safety' | 'claim' | 'branding';
  message: string;
  sceneId?: string;
}

/** 숫자 뒤에 오는 단위 (TTS용 한글 표기 포함) */
const UNITS = [
  'kg', 'mg', 'g', 'ml', 'mL', 'L', 'l', 'cc', '그램', '킬로그램', '리터', '밀리리터',
  '컵', 'C', '큰술', '작은술', '스푼', '숟가락', '티스푼', 'T', 't',
  '개', '알', '장', '줌', '꼬집', '쪽', '대', '모', '포기', '톨', '공기', '국자', '마리', '인분', '단', '방울', '봉지', '봉', '캔',
  '시간', '분', '초', '도', '°C', '℃', '배', '%',
];
/** 한글 수사(한·두·세…) 뒤에 오는 단위. '두 분'(사람), '세 도'처럼 다른 뜻이 되는 분·초·도와 영문 단위는 뺀다 */
const NATIVE_UNITS = UNITS.filter((u) => /^[가-힣]+$/.test(u) && !['분', '초', '도', '그램', '킬로그램', '리터', '밀리리터'].includes(u));
/** 한글 수사에 붙여 써도 다른 낱말이 되지 않는 단위 ("한컵", "반공기"). '반대로', '한쪽으로', '한장면'은 띄어 써야만 분량으로 본다 */
const NATIVE_TIGHT_UNITS = ['컵', '큰술', '작은술', '스푼', '숟가락', '티스푼', '꼬집', '줌', '포기', '톨', '공기', '국자', '마리', '방울', '시간', '개'];
const NATIVE_NUMBERS: Record<string, number> = { 반: 0.5, 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

const alt = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
const ARABIC = String.raw`\d+(?:\s*과\s*|\s+)\d+\/\d+|\d+(?:\.\d+)?(?:\/\d+)?`;
const NATIVE = alt(Object.keys(NATIVE_NUMBERS));
/**
 * 단위 뒤: 끝·한글 아닌 글자·조사만 온다. "5단계", "4개월", "한 장면", "두 대접", "한 모금"처럼 단위 글자로 시작하는 다른 낱말은 뺀다.
 * "2분의 1"(분수)도 뺀다.
 */
const PARTICLES = ['을', '를', '이', '가', '은', '는', '에', '의', '도', '만', '씩', '과', '와', '로', '으로', '쯤', '정도', '간', '동안', '부터', '까지', '짜리', '째', '당', '만큼', '보다', '랑', '하고', '요', '예요', '나', '엔', '반', '밖에', '뿐'];
const AFTER = String.raw`(?![a-zA-Z])(?!의\s*\d)(?=$|[^가-힣]|${alt(PARTICLES)})`;
// "3~4분", "1/2컵", "1과 1/2컵", "1 1/2T", "170도" (아라비아 숫자)
const ARABIC_RE = new RegExp(String.raw`(?<![\d.\/])((?:${ARABIC})(?:\s*[~\-]\s*(?:${ARABIC}))?)\s*(${alt(UNITS)})${AFTER}`, 'g');
// "두 큰술", "반 컵", "여섯 개", "한컵" (한글 수사: 낱말 첫머리에서만)
const NATIVE_RE = new RegExp(String.raw`(?<![가-힣])((?:${NATIVE})(?:\s*[~\-]\s*(?:${NATIVE}))?)(?:\s+(${alt(NATIVE_UNITS)})|(${alt(NATIVE_TIGHT_UNITS)}))${AFTER}`, 'g');

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNumber(n: string): string {
  const t = n.trim();
  if (t in NATIVE_NUMBERS) return String(NATIVE_NUMBERS[t]);
  const mixed = t.match(/^(\d+)(?:\s*과\s*|\s+)(\d+)\/(\d+)$/);
  const value = mixed
    ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
    : t.includes('/')
      ? Number(t.split('/')[0]) / Number(t.split('/')[1])
      : Number(t);
  return String(Math.round(value * 1000) / 1000);
}

function normalizeUnit(u: string): string {
  if (u === '°C' || u === '℃') return '도';
  if (u === 'mL' || u === 'cc' || u === '밀리리터') return 'ml';
  if (u === 'l' || u === '리터') return 'L';
  if (u === '그램') return 'g';
  if (u === '킬로그램') return 'kg';
  if (u === 'T' || u === '스푼' || u === '숟가락') return '큰술';
  if (u === 'C') return '컵';
  if (u === 't' || u === '티스푼') return '작은술';
  if (u === '봉지') return '봉';
  return u;
}

export interface Quantity {
  raw: string;
  normalized: string;
  /** 정규화한 단위 (예: 큰술, 도) */
  unit: string;
  /** 글 속 위치 */
  index: number;
}

/** 문장 속 분량·시간·온도 표현을 정규화해서 뽑는다 (글 속 순서대로). */
export function extractQuantities(text: string): Quantity[] {
  const found: Quantity[] = [];
  for (const re of [ARABIC_RE, NATIVE_RE]) {
    for (const m of text.matchAll(re)) {
      const unit = normalizeUnit(m[2] ?? m[3] ?? '');
      const nums = (m[1] ?? '').split(/\s*[~\-]\s*/).map(normalizeNumber);
      found.push({ raw: m[0].trim(), normalized: `${nums.join('~')}${unit}`, unit, index: m.index ?? 0 });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// ── 분량을 재료와 짝지어 대조한다 ──

/** 재료가 아니라 조리 과정(시간·온도·배수)에 붙는 단위: 재료와 짝짓지 않고 원본 어딘가에 있는지만 본다 */
const PROCESS_UNITS = new Set(['시간', '분', '초', '도', '%', '배']);
/** 재료 이름 뒤에 올 수 있는 글자 (조사). "물엿"의 "물", "국간장"의 "간장"은 다른 재료다 */
const NAME_END = /^(?:$|[^가-힣]|[은는이가을를과와도만에의로랑])/;

/** 분량 바로 앞(같은 구절)에 나온 재료 이름. 여러 개면 분량에 가장 가까운 것 */
function attachedIngredient(text: string, q: Quantity, from: number, names: string[]): string | null {
  const clause = Math.max(from, ...[',', '.', '!', '?', '\n', '·', ';'].map((d) => text.lastIndexOf(d, q.index - 1) + 1));
  const segment = text.slice(clause, q.index);
  let best: { name: string; end: number } | null = null;
  for (const name of names) {
    for (let at = segment.indexOf(name); at >= 0; at = segment.indexOf(name, at + 1)) {
      const before = segment[at - 1];
      if (before && /[가-힣]/.test(before)) continue;
      if (!NAME_END.test(segment.slice(at + name.length))) continue;
      const end = at + name.length;
      if (!best || end > best.end || (end === best.end && name.length > best.name.length)) best = { name, end };
    }
  }
  return best?.name ?? null;
}

/** 글 속 분량마다 짝지어진 재료 이름 */
function attachments(text: string, names: string[]): { q: Quantity; name: string | null }[] {
  let from = 0;
  return extractQuantities(text).map((q) => {
    const name = PROCESS_UNITS.has(q.unit) ? null : attachedIngredient(text, q, from, names);
    from = q.index + q.raw.length;
    return { q, name };
  });
}

interface SourceIndex {
  names: string[];
  /** 재료 이름 → 원본이 그 재료에 붙인 분량 (재료 목록 + 단계·원리·팁에서 그 재료와 함께 나온 분량) */
  byIngredient: Map<string, Set<string>>;
  /** 재료·단계·원리·팁의 모든 분량 (흔한 실수·오해·이야기는 뺀다) */
  general: Set<string>;
  /** 흔한 실수·오해·이야기 문장: 그 문장을 인용한 장면에서만 그 분량을 허용한다 */
  quoted: { key: string; quantities: string[] }[];
}

function sourceIndex(recipe: RecipeInput): SourceIndex {
  const names = [...new Set(recipe.ingredients.map((i) => i.name.trim()).filter(Boolean))];
  const byIngredient = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  const general = new Set<string>();
  for (const i of recipe.ingredients) {
    for (const q of extractQuantities(i.amount)) {
      byIngredient.get(i.name.trim())?.add(q.normalized);
      general.add(q.normalized);
    }
  }
  for (const text of [...recipe.steps, recipe.principle, ...recipe.tips]) {
    for (const { q, name } of attachments(text, names)) {
      general.add(q.normalized);
      if (name) byIngredient.get(name)!.add(q.normalized);
    }
  }
  const quoted = [recipe.commonMistake, recipe.misconception ?? '', recipe.story ?? '']
    .flatMap((t) => splitSentences(t))
    .map((s) => ({ s: normalizeText(s.replace(/[.!?。]+$/, '')), quantities: extractQuantities(s).map((q) => q.normalized) }))
    .filter((x) => x.quantities.length && x.s.length >= 4)
    // 끝맺음 두 글자(~한다 → ~해요/~합니다)만 달라도 인용으로 본다
    .map((x) => ({ key: x.s.slice(0, Math.max(4, x.s.length - 2)), quantities: x.quantities }));
  return { names, byIngredient, general, quoted };
}

export interface QuantityIssue {
  quantity: Quantity;
  /** 짝지어진 재료 (재료 분량이 원본과 다를 때) */
  ingredient?: string;
  message: string;
}

/**
 * 글(대사·카드·훅 문장·블로그 한 줄)의 분량이 원본과 맞는지 본다.
 * - 재료 이름과 함께 나온 분량은 원본이 그 재료에 붙인 분량이어야 한다 (간장 2큰술·설탕 1큰술을 서로 바꾸면 오류).
 * - 재료와 짝지어지지 않은 분량·시간·온도는 재료·단계·원리·팁 어딘가에 있어야 한다.
 * - 흔한 실수·오해·이야기 속 분량은 그 문장을 인용한 글에서만 허용한다 (오해 속 틀린 온도가 다른 장면을 통과시키지 않게).
 * extra: 그대로 허용할 글 (예: 연구자 답변 원문)
 */
export function quantityIssues(recipe: RecipeInput, text: string, opts: { extra?: string[] } = {}): QuantityIssue[] {
  const src = sourceIndex(recipe);
  const extra = new Set(extractQuantities((opts.extra ?? []).join('\n')).map((q) => q.normalized));
  const squashed = normalizeText(text);
  const quoted = new Set(src.quoted.filter((x) => squashed.includes(x.key)).flatMap((x) => x.quantities));
  const issues: QuantityIssue[] = [];
  for (const { q, name } of attachments(text, src.names)) {
    if (quoted.has(q.normalized) || extra.has(q.normalized)) continue;
    if (name) {
      const allowed = src.byIngredient.get(name)!;
      if (!allowed.has(q.normalized)) {
        const want = allowed.size ? [...allowed].join(', ') : '분량 없음';
        issues.push({ quantity: q, ingredient: name, message: `원본에서 "${name}"의 분량은 ${want}인데 "${q.raw}"로 되어 있습니다.` });
      }
    } else if (!src.general.has(q.normalized)) {
      issues.push({ quantity: q, message: `원본에 없는 분량·시간·온도 "${q.raw}"가 있습니다.` });
    }
  }
  return issues;
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
  const ingredientLines = recipe.ingredients.map(formatIngredient);

  for (const scene of script.scenes) {
    const sceneText = [scene.line, scene.cardTitle ?? '', ...(scene.cardItems ?? [])].join('\n');

    for (const q of quantityIssues(recipe, sceneText)) {
      issues.push({ level: 'error', code: 'quantity', sceneId: scene.id, message: q.message });
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
        // 같은 단계가 되풀이되는 레시피(물을 붓는다 … 물을 붓는다)도 있으므로 앞 단계 다음부터, 같은 문장을 먼저 찾는다
        const find = (from: number) => {
          const at = (ok: (s: string) => boolean) => recipe.steps.findIndex((s, k) => k >= from && ok(s));
          const exact = at((s) => s === item);
          return exact >= 0 ? exact : at((s) => s.includes(item) || item.includes(s));
        };
        const next = find(lastIndex + 1);
        const idx = next >= 0 ? next : find(0);
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

  // 훅이 맨 앞에 오는 대본은 두 번째 장면까지를 오프닝으로 보고, 연출 엔진 대본은 엔딩 서명의 브랜드 문구도 인정한다
  const first = script.scenes.slice(0, 2).map((s) => s.line).join('\n');
  const last = script.scenes.at(-1)?.line ?? '';
  const all = script.scenes.map((s) => s.line).join('\n');
  // 연구자 이름·직함은 대사가 아니라 화면 카드 제목으로 보여도 된다 (대사에서 매번 말하면 어색하다)
  const cards = script.scenes.map((s) => s.cardTitle ?? '').join('\n');
  const engine = Boolean(script.style);
  if (!first.includes(BRAND.labName) && !(engine && all.includes(BRAND.labName))) {
    issues.push({ level: 'info', code: 'branding', message: `오프닝에 "${BRAND.labName}"이 없습니다.` });
  }
  // 원리 장면이 없는 연출(감각 중심형)은 노트 문구를, 팁 장면을 넣지 않는 연출(코미디·스토리형)은 팁 문구를 검사하지 않는다
  const noNote = script.style === 'sensory';
  const noTip = script.style === 'comedy' || script.style === 'story' || recipe.tips.length === 0;
  if (!noNote && !all.includes(BRAND.notePhrase) && !all.includes(BRAND.noteLead) && !cards.includes(BRAND.notePhrase)) {
    issues.push({ level: 'info', code: 'branding', message: `중간에 "${BRAND.notePhrase}" 문구가 없습니다.` });
  }
  if (!noTip && !script.scenes.some((s) => s.type === 'tip' && (s.line.includes(BRAND.tipPhrase) || s.cardTitle === BRAND.tipPhrase)) && !last.includes(BRAND.tipPhrase)) {
    issues.push({ level: 'info', code: 'branding', message: `엔딩에 "${BRAND.tipPhrase}" 문구가 없습니다.` });
  }
  return issues;
}
