/** 여러 패키지가 함께 쓰는 문장 비교 도우미 (하나만 두고 가져다 쓴다). */

/** 띄어쓰기·문장부호·괄호·기호를 뺀 글자만 남긴다 ("들어 있나" 비교용) */
export function normalizeText(text: string): string {
  return text.replace(/[\s.,!?·~…"'“”‘’()[\]{}:;\-+*/]/g, '');
}

/** 최장 공통 부분열(LCS) 길이 (글자 단위, 이모지·한글도 한 글자로 센다) */
export function lcsLength(before: string, after: string): number {
  const a = [...before];
  const b = [...after];
  if (!a.length || !b.length) return 0;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/**
 * 글자 단위 변경률 (0 = 같음, 1 = 전부 바뀜): 1 - 2·LCS/(a+b).
 * Python difflib.SequenceMatcher의 1 - ratio와 거의 같은 값이다.
 */
export function changeRate(before: string, after: string): number {
  const a = [...before].length;
  const b = [...after].length;
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  return 1 - (2 * lcsLength(before, after)) / (a + b);
}
