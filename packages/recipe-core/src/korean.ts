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
  const t = sentence.trim();
  // '면'으로 끝나는 낱말마다 시도하되, 면 요리 이름(칼국수면·짜장면·냉면)은 원인 절의 끝이 아니다
  for (const m of t.matchAll(/(\S*[가-힣])면(?!서)\s+/g)) {
    if (NOODLE.test(`${m[1]!}면`)) continue;
    const end = (m.index ?? 0) + m[1]!.length + 1;
    const cause = t.slice(0, end);
    const effect = t.slice(end).replace(/[.!?。]+$/, '').trim();
    if (compactLength(cause) < 4 || compactLength(effect) < 3) continue;
    return { cause, effect };
  }
  return null;
}

/** 면 요리·면 이름 (원인 절의 '~하면'과 구별) */
const NOODLE = /^(?:\S*(?:국수|짜장|짬뽕|볶음|비빔|우동|메밀|파스타|중화|쌀)면|[냉쫄소당라생건]면)$/;

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

// ── 말하는 문장으로: 글말 끝맺음(~한다, ~합니다)을 맛조수 말투(~해요)로 ──

const JUNG_A = 0; // ㅏ
const JUNG_EO = 4; // ㅓ
const JUNG_O = 8; // ㅗ
const JUNG_WA = 9; // ㅘ
const JUNG_WAE = 10; // ㅙ
const JUNG_OE = 11; // ㅚ
const JUNG_YEO = 6; // ㅕ
const JUNG_U = 13; // ㅜ
const JUNG_WO = 14; // ㅝ
const JUNG_EU = 18; // ㅡ
const JUNG_I = 20; // ㅣ
const JONG_N = 4; // ㄴ
const JONG_D = 7; // ㄷ
const JONG_L = 8; // ㄹ
const JONG_B = 17; // ㅂ
const JONG_S = 19; // ㅅ
const JONG_SS = 20; // ㅆ
const JONG_H = 27; // ㅎ
const CHO_IEUNG = 11; // ㅇ

interface Syl {
  cho: number;
  jung: number;
  jong: number;
}
const isHangul = (ch: string | undefined) => {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= HANGUL_START && c <= HANGUL_END;
};
const split = (ch: string): Syl => {
  const c = ch.charCodeAt(0) - HANGUL_START;
  return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 };
};
const join = (s: Syl) => String.fromCharCode(HANGUL_START + s.cho * 588 + s.jung * 28 + s.jong);
/** 마지막 글자만 바꾼다 */
const withLast = (stem: string, f: (s: Syl) => Syl) => stem.slice(0, -1) + join(f(split(stem.slice(-1))));
/** 밝은 모음(ㅏ·ㅗ)이면 '아', 아니면 '어' */
const bright = (jung: number) => jung === JUNG_A || jung === JUNG_O || jung === 2 /* ㅑ */ || jung === JUNG_WA;

/**
 * ㄹ이 빠진 줄기 (만듭니다/만든다 → 만들). ㄴ다·ㅂ니다 앞에서는 ㄹ이 빠지므로 원형을 되살린다.
 * - L_DROPPED: 받침 없는 원형이 없어 ㄹ 동사로만 읽히는 것 (썬다 → 썰다, 민다 → 밀다, 분다 → 불다, 연다 → 열다 …)
 * - L_AMBIGUOUS: 두 가지로 읽히는 것 (간다 = 가다/갈다, 푼다 = 푸다/풀다, 깐다 = 까다/깔다, ~ㄹ 겁니다).
 *   이때 해요체는 틀릴 수 있으니, 두 뜻 모두 맞는 합니다체(갑니다·풉니다)로 둔다.
 */
const L_DROPPED = new Set(['드', '느', '머', '써', '미', '부', '터', '여', '너', '조']);
const L_AMBIGUOUS = new Set(['가', '까', '푸', '다', '사', '마', '아', '나', '파', '노', '도', '우', '어', '비', '거']);
const restoreL = (stem: string) => (L_DROPPED.has(stem.slice(-1)) ? withLast(stem, (s) => ({ ...s, jong: JONG_L })) : stem);

// 불규칙 활용: 목록에 있는 것만 바꾸고, 나머지 받침 ㅂ·ㄷ·ㅅ은 규칙 활용으로 본다
const B_REGULAR = new Set(['좁', '잡', '입', '씹', '뽑', '접', '집', '업']);
/** '이'로 끝나는 요리 동사 (줄이다 → 줄여요). 목록에 없으면 '핵심이다'처럼 '이다'일 수 있어 합니다체로 둔다 */
const I_VERBS = new Set(['녹이', '줄이', '끓이', '졸이', '절이', '붙이', '먹이', '삭이', '들이', '보이', '섞이', '묶이', '쌓이', '놓이', '덮이', '높이', '굳이', '죽이', '숙이']);
const D_IRREGULAR = new Set(['듣', '걷', '붇', '싣', '깨닫', '묻']);
const S_IRREGULAR = new Set(['낫', '젓', '붓', '잇', '짓', '긋']);

/**
 * 동사·형용사 줄기 → 해요체. 확실하지 않으면 null (그때는 합니다체를 쓴다).
 * 예: 되 → 돼요, 익 → 익어요, 바삭하 → 바삭해요, 쉽 → 쉬워요, 다르 → 달라요, 젓 → 저어요
 */
function haeyo(stem: string): string | null {
  const last = stem.slice(-1);
  if (!isHangul(last)) return null;
  const s = split(last);
  if (last === '하') return `${stem.slice(0, -1)}해요`;
  if (s.jong === 0) {
    // 줄기가 '이'로 끝나면 동사(줄이다)인지 '이다'(핵심이다)인지 알 수 없다
    if (s.cho === CHO_IEUNG && s.jung === JUNG_I && !I_VERBS.has(stem.slice(-2))) return null;
    switch (s.jung) {
      case JUNG_A:
      case JUNG_EO:
      case 1: // ㅐ
      case 5: // ㅔ
      case JUNG_YEO:
        return `${stem}요`;
      case JUNG_O:
        return `${withLast(stem, (x) => ({ ...x, jung: JUNG_WA }))}요`;
      case JUNG_U:
        return `${withLast(stem, (x) => ({ ...x, jung: JUNG_WO }))}요`;
      case JUNG_OE:
        return `${withLast(stem, (x) => ({ ...x, jung: JUNG_WAE }))}요`;
      case JUNG_I:
        return `${withLast(stem, (x) => ({ ...x, jung: JUNG_YEO }))}요`;
      case 16: // ㅟ
      case 19: // ㅢ
        return `${stem}어요`;
      case JUNG_EU: {
        const prev = stem.slice(-2, -1);
        const prevJung = isHangul(prev) ? split(prev).jung : JUNG_EO;
        const v = bright(prevJung) ? JUNG_A : JUNG_EO;
        if (last === '르' && isHangul(prev) && stem.slice(-2) !== '따르' && stem.slice(-2) !== '치르') {
          // 르 불규칙: 다르 → 달라, 부르 → 불러
          const p = split(prev);
          if (p.jong !== 0) return null;
          return `${stem.slice(0, -2)}${join({ ...p, jong: JONG_L })}${join({ cho: 5 /* ㄹ */, jung: v, jong: 0 })}요`;
        }
        return `${withLast(stem, (x) => ({ ...x, jung: v }))}요`;
      }
      default:
        return null;
    }
  }
  // 과거형(녹았·좋았·끓었)은 늘 '어요': 녹았어요
  const tail = s.jong === JONG_SS ? '어요' : bright(s.jung) ? '아요' : '어요';
  if (s.jong === JONG_B) {
    // 굽다는 요리에서 거의 '불에 굽다'(구워요)라서 불규칙으로 본다
    if (B_REGULAR.has(last)) return `${stem}${tail}`;
    // ㅂ 불규칙: 쉽 → 쉬워요, 부드럽 → 부드러워요, 돕 → 도와요
    const base = withLast(stem, (x) => ({ ...x, jong: 0 }));
    return `${base}${last === '돕' || last === '곱' ? '와요' : '워요'}`;
  }
  if (s.jong === JONG_D && D_IRREGULAR.has(last)) return `${withLast(stem, (x) => ({ ...x, jong: JONG_L }))}${tail}`;
  if (s.jong === JONG_S && S_IRREGULAR.has(last)) return `${withLast(stem, (x) => ({ ...x, jong: 0 }))}${tail}`;
  if (s.jong === JONG_H && !['좋', '놓', '넣', '닿', '쌓', '낳', '찧', '빻'].includes(last)) return null; // 빨갛다 → 빨개요 등은 건드리지 않는다
  return `${stem}${tail}`;
}

/** 줄기 → 합니다체: 익 → 익습니다, 줄이 → 줄입니다, 만들 → 만듭니다 */
function hamnida(stem: string): string {
  const last = stem.slice(-1);
  if (!isHangul(last)) return `${stem}합니다`;
  const s = split(last);
  if (s.jong === 0) return `${withLast(stem, (x) => ({ ...x, jong: JONG_B }))}니다`;
  if (s.jong === JONG_L) return `${withLast(stem, (x) => ({ ...x, jong: JONG_B }))}니다`;
  return `${stem}습니다`;
}

/** 끝이 '~다'일 때 명사+이다로 볼 수 있는 모음 (온도다·육수다): 이 모음으로 끝나는 형용사는 거의 없다 */
const NOUN_VOWELS = new Set([JUNG_O, JUNG_U, 12 /* ㅛ */, 17 /* ㅠ */]);
/** 'ㅣ·ㅡ'로 끝나는 형용사 (느리다·아프다). 목록에 없는 두 글자 이상 낱말은 명사로 본다 (커피다 → 커피예요, 포인트다 → 포인트예요) */
const ADJ_I_EU = new Set(['느리', '흐리', '여리', '어리', '아프', '고프', '기쁘', '예쁘', '슬프', '바쁘', '나쁘']);

type Stem = { kind: 'stem'; stem: string } | { kind: 'ambiguous'; stem: string } | { kind: 'noun'; noun: string };

/**
 * 문장 끝의 글말 어미를 떼어 줄기를 찾는다. 못 찾으면 null.
 * ambiguous: ㄹ이 빠졌는지 알 수 없는 줄기 (해요체 대신 합니다체로 둔다)
 * noun: 명사+다 (온도다)
 */
function stemOf(body: string): Stem | null {
  const verb = (stem: string): Stem => (L_AMBIGUOUS.has(stem.slice(-1)) ? { kind: 'ambiguous', stem } : { kind: 'stem', stem: restoreL(stem) });
  if (body.endsWith('습니다')) return { kind: 'stem', stem: body.slice(0, -3) };
  if (body.endsWith('니다')) {
    const syl = body.slice(-3, -2);
    if (isHangul(syl) && split(syl).jong === JONG_B) return verb(body.slice(0, -3) + join({ ...split(syl), jong: 0 }));
    return null;
  }
  if (body.endsWith('는다')) return { kind: 'stem', stem: body.slice(0, -2) };
  if (body.endsWith('다')) {
    const syl = body.slice(-2, -1);
    if (!isHangul(syl)) return null;
    const s = split(syl);
    // ~ㄴ다: 된다 → 되, 만든다 → 만들 (형용사 '~다'는 그대로 줄기)
    if (s.jong === JONG_N) return verb(body.slice(0, -2) + join({ ...s, jong: 0 }));
    const stem = body.slice(0, -1);
    const word = stem.split(/\s+/).at(-1) ?? '';
    if (s.jong === 0 && word.length >= 2 && s.cho !== CHO_IEUNG) {
      if (NOUN_VOWELS.has(s.jung)) return { kind: 'noun', noun: stem };
      if ((s.jung === JUNG_I || (s.jung === JUNG_EU && syl !== '르')) && !ADJ_I_EU.has(word.slice(-2))) return { kind: 'noun', noun: stem };
    }
    return { kind: 'stem', stem };
  }
  return null;
}

/** 문장을 몸통과 끝 문장부호로 나눈다 */
function parts(sentence: string): { t: string; body: string; punct: string } {
  const t = sentence.trim();
  const m = t.match(/^([\s\S]*?)([.!?。]*)$/);
  return { t, body: (m?.[1] ?? t).trim(), punct: (m?.[2] ?? '').replace('。', '.') };
}

/**
 * 원본의 글말 문장을 맛조수가 말하는 문장으로: 끝맺음만 바꾸고 내용은 그대로 둔다.
 * "청국장의 짠맛이 희석된다" → "청국장의 짠맛이 희석돼요."
 * "떫은맛이 줄어듭니다." → "떫은맛이 줄어들어요."
 * 이미 말투(~요)거나 끝맺음이 없는 문장(명사로 끝남 등)은 그대로 둔다. 확실하지 않으면 합니다체로 둔다.
 */
export function spoken(sentence: string): string {
  const { t, body, punct } = parts(sentence);
  if (!body || body.endsWith('요')) return t;
  if (/아니다$|아닙니다$/.test(body)) return `${body.replace(/아니다$|아닙니다$/, '아니에요')}${punct || '.'}`;
  const st = stemOf(body);
  if (!st) return t;
  if (st.kind === 'noun') return `${st.noun}예요${punct || '.'}`;
  if (!st.stem) return t;
  const out = st.kind === 'ambiguous' ? hamnida(st.stem) : (haeyo(st.stem) ?? hamnida(st.stem));
  return `${out}${punct || '.'}`;
}

/**
 * 블로그처럼 글로 읽는 문단: 반말 글말 끝맺음(~한다, ~된다)만 합니다체로 맞춘다.
 * 이미 ~습니다/~요로 끝나거나 끝맺음이 없는 문장은 그대로 두고, 마침표만 채운다.
 * "청국장의 짠맛이 희석된다" → "청국장의 짠맛이 희석됩니다."
 */
export function formal(sentence: string): string {
  const { t, body, punct } = parts(sentence);
  if (!body) return t;
  if (body.endsWith('아니다')) return `${body.slice(0, -3)}아닙니다${punct || '.'}`;
  if (body.endsWith('니다') || body.endsWith('요')) return `${body}${punct || '.'}`;
  if (!body.endsWith('다')) return t;
  const st = stemOf(body);
  if (!st) return t;
  return `${st.kind === 'noun' ? `${st.noun}입니다` : hamnida(st.stem)}${punct || '.'}`;
}

/** 문단 안의 문장마다 formal()을 적용한다 */
export function formalParagraph(text: string): string {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => formal(s))
    .join(' ');
}
