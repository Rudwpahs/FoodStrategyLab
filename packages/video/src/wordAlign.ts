/**
 * 받아쓰기 어절 시간을 대본 어절에 맞추기 (순수 함수).
 *
 * 받아쓰기(Whisper 계열)는 띄어쓰기를 대본과 다르게 하거나("맛 연구소" → "맛연구소"), 숫자·기호가 든 낱말("500g")은
 * 시간을 빼고 돌려준다. 예전에는 받아쓴 단어 수가 대본 어절 수와 같을 때만 시간을 썼고, 다르면 글자 수 비율로 나눠서
 * 문장 사이 쉼을 모른 채 자막이 앞서거나 늦었다 (2026-11 견본: 끝 장면 "이희재의 맛 연구소"는 매번 단어 수가 달랐다).
 *
 * 그래서 글자 단위로 맞춘다: 대본 글자와 받아쓴 글자를 편집 거리(삽입·삭제·바꿈)로 짝지은 뒤,
 * 대본 어절마다 짝지어진 받아쓴 글자들의 시간 범위를 쓴다. 짝이 없는 어절(숫자 등)은 앞뒤 어절 사이를 글자 수로 나눈다.
 * (자막을 원고에 맞추는 일반적인 방법: 인식 결과와 원고를 정렬한 뒤 시간을 옮긴다)
 */

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/** 소리로 읽히는 글자만 남긴다 (한글·영문·숫자) */
function letters(s: string): string[] {
  return [...s.normalize('NFC').toLowerCase()].filter((c) => /[\p{L}\p{N}]/u.test(c));
}

/** 같은 글자로 볼 만큼 맞아떨어진 비율이 이보다 낮으면 받아쓰기를 믿지 않는다 */
const MIN_MATCH_RATIO = 0.5;

/**
 * 대본 어절별 [시작, 끝] (초). 받아쓰기를 믿을 수 없으면 undefined.
 * @param line 대본 대사 (화면 자막과 같은 글)
 * @param heard 받아쓴 단어들 (시간 순서)
 */
export function alignWords(line: string, heard: TimedWord[]): [number, number][] | undefined {
  const scriptWords = line.trim().split(/\s+/).filter(Boolean);
  if (!scriptWords.length) return undefined;
  const timed = heard.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
  // 대본 글자 (어절 번호와 함께)
  const s: { c: string; w: number }[] = scriptWords.flatMap((w, i) => letters(w).map((c) => ({ c, w: i })));
  // 받아쓴 글자: 단어 시간을 글자 수로 나눠 글자마다 시간을 준다
  const t: { c: string; start: number; end: number }[] = timed.flatMap((w) => {
    const cs = letters(w.word);
    const step = cs.length ? (w.end - w.start) / cs.length : 0;
    return cs.map((c, k) => ({ c, start: w.start + step * k, end: w.start + step * (k + 1) }));
  });
  if (!s.length || !t.length) return undefined;

  // 편집 거리 표 (대사 한 줄은 100자 안팎이라 n·m 표로 충분하다)
  const n = s.length;
  const m = t.length;
  const d: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1]![j - 1]! + (s[i - 1]!.c === t[j - 1]!.c ? 0 : 1);
      d[i]![j] = Math.min(sub, d[i - 1]![j]! + 1, d[i]![j - 1]! + 1);
    }
  }
  // 뒤에서부터 짝을 찾는다 (같은 글자·바뀐 글자 모두 '같은 자리'로 본다: 잘못 들은 글자도 그 자리에서 났다)
  const pair: number[] = new Array(n).fill(-1);
  let same = 0;
  for (let i = n, j = m; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (s[i - 1]!.c === t[j - 1]!.c ? 0 : 1)) {
      pair[i - 1] = j - 1;
      if (s[i - 1]!.c === t[j - 1]!.c) same++;
      i--;
      j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) i--;
    else j--;
  }
  if (same / n < MIN_MATCH_RATIO) return undefined;

  // 어절별 시간: 짝지어진 글자들의 처음·끝
  const out: ([number, number] | null)[] = scriptWords.map(() => null);
  s.forEach((x, i) => {
    const j = pair[i]!;
    if (j < 0) return;
    const cur = out[x.w];
    out[x.w] = cur ? [Math.min(cur[0], t[j]!.start), Math.max(cur[1], t[j]!.end)] : [t[j]!.start, t[j]!.end];
  });
  // 짝이 없는 어절: 앞 어절 끝 ~ 뒤 어절 시작을 글자 수로 나눈다
  const first = t[0]!.start;
  const last = t[m - 1]!.end;
  for (let i = 0; i < out.length; ) {
    if (out[i]) {
      i++;
      continue;
    }
    let k = i;
    while (k < out.length && !out[k]) k++;
    const from = i > 0 ? out[i - 1]![1] : first;
    const to = k < out.length ? out[k]![0] : last;
    const weights = scriptWords.slice(i, k).map((w) => Math.max(1, letters(w).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = from;
    for (let x = i; x < k; x++) {
      const len = ((to - from) * weights[x - i]!) / total;
      out[x] = [cursor, cursor + len];
      cursor += len;
    }
    i = k;
  }
  // 시간이 거꾸로 가지 않게 (바뀐 글자 짝이 엇갈린 경우)
  const res = out as [number, number][];
  for (let i = 1; i < res.length; i++) {
    if (res[i]![0] < res[i - 1]![0]) res[i]![0] = res[i - 1]![0];
    if (res[i]![1] < res[i]![0]) res[i]![1] = res[i]![0];
  }
  return res;
}

/** 어절 시작 근처(앞쪽 이 비율·이 초 안)에 있는 쉼은 그 어절 앞의 쉼으로 본다 */
const HEAD_SHARE = 0.4;
const HEAD_SECONDS = 0.25;
/** 이보다 긴 쉼은 낱말 안의 막힘(된소리 등, 0.1~0.2초)이 아니라 낱말 사이 쉼으로 본다 */
const LONG_PAUSE = 0.3;

/**
 * 어절 시작을 실제 쉼에 맞춰 다듬는다.
 * Whisper 계열 받아쓰기는 낱말 앞의 쉼을 그 낱말 시간에 넣는 일이 잦다 (2026-11 측정: 문장 사이 쉼 뒤 첫 낱말이 0.2~0.4초 이르게 잡힘).
 * 소리 크기로 찾은 쉼(speech.ts speechPauses) 안에서, 또는 어절 앞머리에 쉼이 있으면 쉼이 끝나는 곳에서 시작하게 한다
 * (받아쓰기 시간을 무음 구간에 맞추는 흔한 방법: stable-ts의 silence suppression).
 * 자막은 어절 시작으로 바뀌므로 시작만 고친다 (끝은 시작보다 앞서지 않게만).
 */
export function snapToSpeech(words: [number, number][], pauses: [number, number][]): [number, number][] {
  const out = words.map(([s, e]): [number, number] => {
    let start = s;
    for (const [a, b] of pauses) {
      const inside = start > a + 1e-6 && start < b - 1e-6;
      // 앞머리의 쉼, 또는 긴 쉼 앞의 말소리가 뒤의 말소리보다 짧으면(받아쓰기가 앞 낱말 꼬리를 이 낱말에 붙인 경우) 쉼 뒤에서 시작
      const before = a - start;
      const head = a >= start - 1e-6 && b < e && (before <= Math.min(HEAD_SECONDS, HEAD_SHARE * (e - start)) || (b - a >= LONG_PAUSE && before < e - b));
      if (inside || head) start = b;
    }
    return [start, Math.max(start, e)];
  });
  for (let i = 1; i < out.length; i++) {
    if (out[i]![0] < out[i - 1]![0]) out[i]![0] = out[i - 1]![0];
    if (out[i]![1] < out[i]![0]) out[i]![1] = out[i]![0];
  }
  return out;
}

/** 문장·쉼표가 끝나는 어절 뒤 (쉼이 올 만한 자리) */
const BREAK_AFTER = /[.,!?…~]$/;
/** 쉼과 짝짓지 못한 문장 끝 하나의 벌점(초): 이보다 멀리 떨어진 쉼과는 짝짓지 않는다 */
const UNMATCHED_BREAK = 0.6;

/**
 * 받아쓰기가 없을 때 어절 시간 어림 (예전: 쉼까지 포함한 전체 구간을 글자 수로 나눠, 문장 사이 쉼 앞에서는 자막이 앞서고 뒤에서는 늦었다).
 * 1) 쉼을 뺀 말하는 시간에 글자 수 비율로 나눠 문장 끝(.,!?…)마다 어림 시각을 구하고
 * 2) 문장 끝을 실제 쉼과 순서대로 짝짓고(가까운 것끼리, 동적 계획법)
 * 3) 짝지은 쉼 사이마다 다시 글자 수로 나눈다.
 * @param start·end 말소리 구간 (초), pauses 그 안의 쉼
 */
export function estimateWords(line: string, start: number, end: number, pauses: [number, number][]): [number, number][] {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const gaps = pauses.filter(([a, b]) => a > start && b < end).sort((x, y) => x[0] - y[0]);
  const weights = words.map((w) => Math.max(1, letters(w).length) + 0.6);
  // 말하는 시간 축(쉼을 뺀 시간) ↔ 실제 시간
  const voicedTotal = Math.max(0.01, end - start - gaps.reduce((s, [a, b]) => s + (b - a), 0));
  const toReal = (v: number) => {
    let t = start + v;
    for (const [a, b] of gaps) if (t >= a) t += b - a;
    return Math.min(end, t);
  };
  const total = weights.reduce((a, b) => a + b, 0);
  const breaks = words.flatMap((w, i) => (i < words.length - 1 && BREAK_AFTER.test(w) ? [i + 1] : []));
  const expected = breaks.map((wi) => toReal((weights.slice(0, wi).reduce((a, b) => a + b, 0) / total) * voicedTotal));
  // 문장 끝 ↔ 쉼 짝짓기 (순서 유지, 짝 없는 문장 끝은 벌점)
  const B = breaks.length;
  const P = gaps.length;
  const cost: number[][] = Array.from({ length: B + 1 }, () => new Array(P + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: B + 1 }, () => new Array(P + 1).fill(0));
  for (let j = 0; j <= P; j++) cost[0]![j] = 0;
  for (let i = 1; i <= B; i++) {
    for (let j = 0; j <= P; j++) {
      // i번째 문장 끝을 짝짓지 않음
      let best = cost[i - 1]![j]! + UNMATCHED_BREAK;
      let how = 0;
      // j번째 쉼과 짝지음
      if (j > 0) {
        const [a, b] = gaps[j - 1]!;
        // 어림 시각과 쉼 사이 거리 (쉼 안이면 0): 말줄임표처럼 긴 쉼도 가장자리로 잰다
        const x = expected[i - 1]!;
        const d = x < a ? a - x : x > b ? x - b : 0;
        if (d < UNMATCHED_BREAK && cost[i - 1]![j - 1]! + d < best) {
          best = cost[i - 1]![j - 1]! + d;
          how = 1;
        }
      }
      // j번째 쉼은 건너뜀 (문장 중간의 숨)
      if (j > 0 && cost[i]![j - 1]! < best) {
        best = cost[i]![j - 1]!;
        how = 2;
      }
      cost[i]![j] = best;
      from[i]![j] = how;
    }
  }
  const anchors: { word: number; at: [number, number] }[] = [];
  for (let i = B, j = P; i > 0; ) {
    const how = from[i]![j]!;
    if (how === 1) {
      anchors.unshift({ word: breaks[i - 1]!, at: gaps[j - 1]! });
      i--;
      j--;
    } else if (how === 2) j--;
    else i--;
  }
  // 짝지은 쉼 사이마다 글자 수로 나눈다 (그 사이의 다른 쉼은 빼고)
  const out: [number, number][] = [];
  const pieces: { from: number; to: number; w0: number; w1: number }[] = [];
  let w0 = 0;
  let t0 = start;
  for (const a of anchors) {
    pieces.push({ from: t0, to: a.at[0], w0, w1: a.word });
    w0 = a.word;
    t0 = a.at[1];
  }
  pieces.push({ from: t0, to: end, w0, w1: words.length });
  for (const p of pieces) {
    const inner = gaps.filter(([a, b]) => a > p.from && b < p.to);
    const voiced = Math.max(0.01, p.to - p.from - inner.reduce((s, [a, b]) => s + (b - a), 0));
    const real = (v: number) => {
      let t = p.from + v;
      for (const [a, b] of inner) if (t >= a) t += b - a;
      return Math.min(p.to, t);
    };
    const ws = weights.slice(p.w0, p.w1);
    const sum = ws.reduce((a, b) => a + b, 0);
    let cursor = 0;
    for (const w of ws) {
      const len = (w / sum) * voiced;
      out.push([real(cursor), real(cursor + len)]);
      cursor += len;
    }
  }
  return snapToSpeech(out, gaps);
}
