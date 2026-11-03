/** 한국어 문장 조립 도우미 (조사·원리 문장 분석). 원본 문장만 다룬다. */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 마지막 글자에 받침이 있는지. 한글이 아니면 숫자·영문 끝소리를 대략 판단한다. */
export function hasFinalConsonant(word: string): boolean {
  const ch = word.trim().replace(/[^\p{L}\p{N}]+$/u, '').slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) return (code - HANGUL_START) % 28 !== 0;
  // 숫자: 0(영),1(일),3(삼),6(육),7(칠),8(팔)은 받침이 있다
  if (/[013678]/.test(ch)) return true;
  if (/[2459]/.test(ch)) return false;
  return /[lmnr]/i.test(ch);
}

/** 조사 붙이기: josa('호두정과', '이/가') → '호두정과가' */
export function josa(word: string, pair: '이/가' | '은/는' | '을/를' | '와/과' | '으로/로'): string {
  const [withFinal, withoutFinal] = pair.split('/') as [string, string];
  if (pair === '으로/로') {
    const last = word.slice(-1).charCodeAt(0);
    const rieul = last >= HANGUL_START && last <= HANGUL_END && (last - HANGUL_START) % 28 === 8;
    return word + (hasFinalConsonant(word) && !rieul ? withFinal : withoutFinal);
  }
  return word + (hasFinalConsonant(word) ? withFinal : withoutFinal);
}

export function compactLength(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * "A하면 B합니다" 형태의 원리 문장을 원인(A하면)과 결과(B)로 나눈다.
 * 예: "호두를 데친 뒤 헹구면 떫은맛이 줄어듭니다" → { cause: '호두를 데친 뒤 헹구면', effect: '떫은맛이 줄어듭니다' }
 */
export function causeEffect(sentence: string): { cause: string; effect: string } | null {
  const m = sentence.trim().match(/^(.+?[가-힣])면(?!서)\s+(.+)$/);
  if (!m) return null;
  const cause = `${m[1]!}면`;
  const effect = m[2]!.replace(/[.!?。]+$/, '').trim();
  if (compactLength(cause) < 4 || compactLength(effect) < 3) return null;
  return { cause, effect };
}

/** 원본 문장 속 식감·맛 표현 → 꾸미는 말 */
const SENSORY: { stem: string; modifier: string; kind: 'texture' | 'taste' }[] = [
  { stem: '바삭', modifier: '바삭한', kind: 'texture' },
  { stem: '쫀득', modifier: '쫀득한', kind: 'texture' },
  { stem: '촉촉', modifier: '촉촉한', kind: 'texture' },
  { stem: '아삭', modifier: '아삭한', kind: 'texture' },
  { stem: '걸쭉', modifier: '걸쭉한', kind: 'texture' },
  { stem: '부드러', modifier: '부드러운', kind: 'texture' },
  { stem: '윤기', modifier: '윤기 나는', kind: 'texture' },
  { stem: '고소', modifier: '고소한', kind: 'taste' },
  { stem: '달콤', modifier: '달콤한', kind: 'taste' },
  { stem: '담백', modifier: '담백한', kind: 'taste' },
  { stem: '감칠맛', modifier: '감칠맛 나는', kind: 'taste' },
];

export interface SensoryWord {
  stem: string;
  modifier: string;
  kind: 'texture' | 'taste';
}

/** 원본 문장에 실제로 있는 식감·맛 표현만 찾는다 (없는 표현을 만들지 않는다). */
export function findSensory(text: string): SensoryWord[] {
  return SENSORY.filter((s) => text.includes(s.stem));
}
