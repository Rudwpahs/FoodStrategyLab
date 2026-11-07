import { extractQuantities } from '@mat-lab/recipe-core';
import { findAiTells } from '../aiTells.ts';
import { markdownToHtml } from '../blog.ts';

/**
 * 윤문 결과 검증 게이트 (AI를 믿지 않고 프로그램이 판정한다).
 * im-not-ai의 scripts/checks.py·verify_gates.py·verify_change_rate.py에서 옮겼고, 레시피 콘텐츠에 맞게 더 엄격하게 했다:
 * - 수치: 원본은 "새 숫자 주입"만 실패로 보지만, 우리는 분량·온도·시간이 빠져도 실패다 (레시피 정보가 바뀌므로).
 * - 변경률: 원본과 같이 50% 이상이면 채택하지 않는다 (30% 이상은 경고).
 * 하나라도 걸린 문장은 원래 문장으로 되돌린다.
 */

export const CHANGE_RATE_WARN = 0.3;
export const CHANGE_RATE_ABORT = 0.5;

/**
 * 문자 단위 변경률 (0 = 같음, 1 = 전부 바뀜).
 * 원본은 Python difflib.SequenceMatcher의 1 - ratio를 쓴다. 여기서는 최장 공통 부분열(LCS)로 2·M/(a+b)를 계산한다 (거의 같은 값).
 */
export function changeRate(before: string, after: string): number {
  const a = [...before];
  const b = [...after];
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return 1;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    [prev, cur] = [cur, prev];
  }
  const lcs = prev[b.length]!;
  return 1 - (2 * lcs) / (a.length + b.length);
}

/** 여러 문장의 변경률을 길이로 가중해 합친다 */
export function totalChangeRate(pairs: { before: string; after: string }[]): number {
  const total = pairs.reduce((s, p) => s + p.before.length + p.after.length, 0);
  if (!total) return 0;
  return pairs.reduce((s, p) => s + changeRate(p.before, p.after) * (p.before.length + p.after.length), 0) / total;
}

const NUM_TOKEN = /\d+(?:[.,/]\d+)*/g;
const numbers = (t: string) => (t.match(NUM_TOKEN) ?? []).sort();
const quantities = (t: string) => extractQuantities(t).map((q) => q.normalized).sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 윤문이 새로 넣으면 안 되는 상투구 (checks.py CLICHE_PATTERNS + 블로그 문체 점검 목록). 원문에 있던 만큼은 괜찮다 */
const CLICHES: RegExp[] = [
  /기록적인\s*성과/g,
  /괄목할\s*만한/g,
  /로\s*평가(?:된다|받|되)/g,
  /주목받/g,
  /크게\s*기여/g,
  /중요한\s*역할을\s*(?:한다|했다|할)/g,
  /시사하는\s*바가\s*크/g,
  /의미가\s*크다/g,
  /알아보겠습니다/g,
  /황금\s*레시피/g,
  /실패\s*없는/g,
  /도움이\s*되셨길/g,
  /소개해\s*드릴게요/g,
];
const count = (re: RegExp, t: string) => (t.match(re) ?? []).length;
/** 직접 인용 (큰따옴표·겹낫표) */
const QUOTE = /["“]([^"”\n]{2,})["”]|「([^」\n]{2,})」/g;
const quotes = (t: string) => [...t.matchAll(QUOTE)].map((m) => (m[1] ?? m[2] ?? '').trim());
/** 해요체 끝맺음 (구어). 원문이 구어면 윤문도 구어여야 한다 */
const endsColloquial = (t: string) => /요[.!?…~]*["”']?$/.test(t.trim());
const endsFormal = (t: string) => /니다[.!?…]*["”']?$/.test(t.trim());

export interface GateOptions {
  /** 원문에 있으면 윤문에도 그대로 있어야 하는 말 (요리 이름, 연구자 이름 등) */
  keep?: string[];
  /** 대사처럼 길이가 시간이 되는 글: 원문보다 30% 넘게 길어지면 실패 */
  spoken?: boolean;
}

/**
 * 원문 한 문장(문단)과 윤문을 비교해, 채택하면 안 되는 이유를 돌려준다. 빈 배열이면 통과.
 * 실패 이유 코드는 im-not-ai checks.py의 실패 코드와 같은 이름을 쓴다 (괄호 안).
 */
export function rewriteProblems(before: string, after: string, opts: GateOptions = {}): string[] {
  const b = before.trim();
  const a = after.trim();
  const out: string[] = [];
  if (!a) return ['빈 문장이 됐어요 (empty_output)'];
  if (!sameList(numbers(b), numbers(a))) out.push('숫자가 바뀌었거나 빠졌어요 (number_injected)');
  else if (!sameList(quantities(b), quantities(a))) out.push('분량·온도·시간 표기가 바뀌었어요 (number_injected)');
  for (const q of quotes(b)) if (!a.includes(q)) out.push(`인용 "${q.slice(0, 20)}"이(가) 바뀌었어요 (quote_altered)`);
  for (const k of opts.keep ?? []) if (k && b.includes(k) && !a.includes(k)) out.push(`"${k}"이(가) 빠졌어요`);
  if (count(/하였/g, a) > count(/하였/g, b)) out.push('"하였"으로 격식을 올렸어요 (hayeot_injection)');
  for (const re of CLICHES) if (count(re, a) > count(re, b)) out.push(`상투구를 새로 넣었어요 (cliche_injection: ${re.source.replace(/\\s\*/g, ' ')})`);
  if (endsColloquial(b) && !endsColloquial(a)) out.push('말투(~요)가 바뀌었어요 (colloquial_erased)');
  if (endsFormal(b) && !endsFormal(a) && !endsColloquial(a)) out.push('끝맺음(~습니다)이 바뀌었어요');
  if (findAiTells(a).length > findAiTells(b).length) out.push('AI 티 패턴이 오히려 늘었어요');
  const rate = changeRate(b, a);
  if (rate >= CHANGE_RATE_ABORT) out.push(`너무 많이 바뀌었어요 (변경률 ${Math.round(rate * 100)}%, 50% 이상은 채택 안 함)`);
  if (opts.spoken && [...a].length > [...b].length * 1.3 + 4) out.push('대사가 30% 넘게 길어졌어요 (영상 길이가 늘어남)');
  return out;
}

// ── 블로그: 다듬을 수 있는 줄 ──

/**
 * 블로그 원고에서 윤문해도 되는 줄인지.
 * 제목·목록(재료·순서·팁)·인용·사진 자리·내부 표시는 빼고, 연구자 답변 원문(원칙 4)도 뺀다.
 */
export function isPolishableLine(line: string, protectedTexts: string[] = []): boolean {
  const t = line.trim();
  if (t.length < 8) return false;
  if (/^(?:#|- |\d+\. |> |\[|!\[|---|⚠️|✍️|출처:|조리 정보 검토:|이 글의 조리 정보는|캐릭터 )/.test(t)) return false;
  if (/^#\S/.test(t)) return false;
  for (const p of protectedTexts) {
    for (const pl of p.split('\n').map((x) => x.trim()).filter((x) => x.length >= 4)) {
      if (t.includes(pl) || pl.includes(t)) return false;
    }
  }
  return true;
}

/** 블로그 원고에서 윤문 대상 줄 (구분선 '---' 아래 꼬리말은 빼고) */
export function polishableBlogLines(markdown: string, protectedTexts: string[] = []): string[] {
  const lines = markdown.split('\n');
  const end = lines.indexOf('---');
  const body = end >= 0 ? lines.slice(0, end) : lines;
  return [...new Set(body.filter((l) => isPolishableLine(l, protectedTexts)).map((l) => l.trim()))];
}

/**
 * 저장해 둔 윤문을 원고에 적용한다. 원문 줄이 그대로 있을 때만 바꾸므로,
 * 레시피·답변이 바뀌어 원고가 달라지면 자연히 원래 문장으로 돌아간다.
 */
export function applyPolish(markdown: string, map: Record<string, string>, protectedTexts: string[] = []): { markdown: string; applied: number } {
  let applied = 0;
  const lines = markdown.split('\n');
  const end = lines.indexOf('---');
  const out = lines.map((l, i) => {
    if (end >= 0 && i >= end) return l;
    const next = map[l.trim()];
    if (next && isPolishableLine(l, protectedTexts)) {
      applied++;
      return next;
    }
    return l;
  });
  return { markdown: out.join('\n'), applied };
}

/** 블로그 글(제목·본문·HTML)에 저장된 윤문을 적용한다 */
export function polishPost<T extends { markdown: string; html: string }>(post: T, map: Record<string, string>, protectedTexts: string[] = []): T & { polished: number } {
  if (!Object.keys(map).length) return { ...post, polished: 0 };
  const { markdown, applied } = applyPolish(post.markdown, map, protectedTexts);
  return { ...post, markdown, html: applied ? markdownToHtml(markdown) : post.html, polished: applied };
}
