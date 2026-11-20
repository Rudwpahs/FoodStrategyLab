/**
 * 목소리 엔진에 넘길 "읽는 글자" 만들기 (화면 자막·대본은 그대로 두고 목소리에만 쓴다).
 *
 * 근거와 선택 이유: docs/research/content-strategy/tts-pronunciation-2026-11.md
 * - 목소리 엔진(VoxCPM2)에는 한국어 발음 변환기가 없고, 엔진을 감싼 VoiceStudio도 한국어 숫자는 그대로 넘긴다
 *   ("3~4"만 "3에서 4"로 바꿈). 엔진 제작진도 숫자는 "넣기 전에 글자로 풀어 달라"고 안내한다.
 * - 그래서 (1) 숫자+단위를 사람이 읽는 말로 푼다: 컵·큰술·개처럼 고유어 수(한, 두, 세)로 세는 단위와
 *   분·초·도·그램처럼 한자어 수(일, 이, 삼)로 읽는 단위를 나눈다. 1/2컵은 "반 컵", 3~4분은 "삼사 분".
 * - (2) 엔진이 실제로 잘못 읽은 겹받침 'ㄼ'(떫은맛 → "같은 맛", 떫어요 → "떴어요")만 표준 발음법대로
 *   소리 나는 글자로 바꾼다 (제10·14·25항 등). 문장 전체를 발음대로 바꾸지는 않는다: 엔진은 맞춤법대로 쓴
 *   글로 배웠고, 이미 잘 읽는 말까지 낯선 글자로 바꾸면 오히려 어색해질 수 있다.
 */

// ───────────────────────── 숫자 읽기 ─────────────────────────

const SINO_DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const NATIVE_ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];

/** 0~9999 한 묶음을 한자어 수로 (천·백·십 앞의 '일'은 읽지 않는다: 백, 천) */
function sinoGroup(n: number): string {
  const units = ['천', '백', '십', ''];
  const digits = String(n).padStart(4, '0');
  let out = '';
  for (let i = 0; i < 4; i++) {
    const d = Number(digits[i]);
    if (!d) continue;
    const unit = units[i]!;
    out += (d === 1 && unit ? '' : SINO_DIGIT[d]!) + unit;
  }
  return out;
}

/** 한자어 수: 140 → 백사십, 12345 → 만 이천삼백사십오 (만 단위로 띄운다, 한글 맞춤법 제44항) */
export function sinoNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  if (n === 0) return '영';
  const bigUnits = ['', '만', '억', '조'];
  const parts: string[] = [];
  let rest = n;
  for (let u = 0; rest > 0 && u < bigUnits.length; u++) {
    const group = rest % 10000;
    rest = Math.floor(rest / 10000);
    if (!group) continue;
    // 10000은 '일만'이 아니라 '만'
    const head = group === 1 && u === 1 ? '' : sinoGroup(group);
    parts.unshift(head + bigUnits[u]);
  }
  return parts.join(' ');
}

/**
 * 고유어 수 (단위 앞에 오는 꼴): 1 → 한, 20 → 스무, 21 → 스물한, 120 → 백스무.
 * 고유어 수는 99까지라 백 이상은 백·천 자리를 한자어로 읽고 나머지를 고유어로 읽는다 (백스무 개).
 */
export function nativeNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  if (n === 0) return '영';
  if (n >= 100) {
    const low = n % 100;
    return sinoNumber(n - low) + (low ? nativeNumber(low) : '');
  }
  if (n === 20) return '스무';
  return NATIVE_TENS[Math.floor(n / 10)]! + NATIVE_ONES[n % 10]!;
}

/** 이웃한 두 수의 고유어 어림수: 1~2 → 한두, 3~4 → 서너, 4~5 → 네다섯 */
const NATIVE_PAIRS: Record<number, string> = { 1: '한두', 2: '두세', 3: '서너', 4: '네다섯', 5: '대여섯', 6: '예닐곱', 7: '일고여덟', 8: '여덟아홉' };

/** 소수: 1.25 → 일점이오 (소수점 아래는 한 자리씩) */
function sinoDecimal(raw: string): string {
  const [int, frac = ''] = raw.replace(/,/g, '').split('.');
  const head = sinoNumber(Number(int || '0'));
  return frac ? `${head}점${[...frac].map((d) => SINO_DIGIT[Number(d)]).join('')}` : head;
}

// ───────────────────────── 단위 ─────────────────────────

type Reading = 'native' | 'sino';
interface Unit {
  /** 읽는 말 (없으면 적힌 그대로) */
  say?: string;
  reading: Reading;
}

/**
 * 고유어 수로 세는 단위 (한 컵, 두 큰술, 세 개).
 * 표준국어대사전 용례와 계량 관습 기준. 일반 발음 변환기(g2pK의 의존 명사 목록, NeMo 한국어 정규화의
 * 단위 목록)에는 컵·큰술·작은술이 없어서 그대로 쓰면 "일 컵"이 된다 → 요리 단위를 따로 둔다.
 */
const NATIVE_COUNTERS = [
  // 계량
  '컵', '큰술', '작은술', '숟가락', '숟갈', '스푼', '티스푼', '술', '국자', '줌', '꼬집', '방울', '주먹', '움큼', '볼', '공기', '그릇', '대접', '접시', '잔', '종지',
  // 재료 세기
  '개', '알', '톨', '쪽', '뿌리', '단', '모', '장', '통', '포기', '송이', '마리', '덩이', '덩어리', '토막', '조각', '가닥', '줄기', '잎', '줄', '판', '봉', '봉지', '팩', '캔', '병', '묶음', '꼬치', '마디', '겹',
  // 횟수·사람·때
  '번', '번째', '가지', '배', '명', '사람', '살', '시간', '시', '달', '군데', '바퀴', '권', '벌', '켤레', '그루', '채',
];

/** 한자어 수로 읽는 단위 (삼 분, 백사십 도, 일 인분) */
const SINO_COUNTERS = ['분', '초', '도', '인분', '인', '회', '차', '등', '위', '단계', '층', '호', '년', '월', '일', '주', '주일', '개월', '원', '퍼센트', '프로', '칼로리', '킬로칼로리', '그램', '킬로그램', '킬로', '밀리리터', '리터', '센티', '센티미터', '밀리', '미리', '미터', '점'];

/** 글자 단위 (영문·기호) → 읽는 말. 큰 T는 큰술, 작은 t는 작은술, C는 컵 (요리책 표기) */
const SYMBOL_UNITS: Record<string, Unit> = {
  g: { say: '그램', reading: 'sino' },
  kg: { say: '킬로그램', reading: 'sino' },
  mg: { say: '밀리그램', reading: 'sino' },
  ml: { say: '밀리리터', reading: 'sino' },
  mL: { say: '밀리리터', reading: 'sino' },
  L: { say: '리터', reading: 'sino' },
  l: { say: '리터', reading: 'sino' },
  cc: { say: '시시', reading: 'sino' },
  cm: { say: '센티미터', reading: 'sino' },
  mm: { say: '밀리미터', reading: 'sino' },
  kcal: { say: '킬로칼로리', reading: 'sino' },
  oz: { say: '온스', reading: 'sino' },
  '%': { say: '퍼센트', reading: 'sino' },
  '℃': { say: '도', reading: 'sino' },
  '°C': { say: '도', reading: 'sino' },
  '°': { say: '도', reading: 'sino' },
  T: { say: '큰술', reading: 'native' },
  Ts: { say: '큰술', reading: 'native' },
  Tbsp: { say: '큰술', reading: 'native' },
  tbsp: { say: '큰술', reading: 'native' },
  t: { say: '작은술', reading: 'native' },
  ts: { say: '작은술', reading: 'native' },
  tsp: { say: '작은술', reading: 'native' },
  C: { say: '컵', reading: 'native' },
};

const HANGUL_UNITS = new Map<string, Unit>([...NATIVE_COUNTERS.map((c) => [c, { reading: 'native' }] as const), ...SINO_COUNTERS.map((c) => [c, { reading: 'sino' }] as const)]);
const byLength = (a: string, b: string) => b.length - a.length;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 긴 말부터 (단계 > 단, 시간 > 시, 개월 > 개, 인분 > 인)
const HANGUL_UNIT_RE = [...HANGUL_UNITS.keys()].sort(byLength).map(esc).join('|');
// 영문 단위는 뒤에 영문이 이어지면 단위가 아니다 (5gal, 2Tbsp는 Tbsp로)
const SYMBOL_UNIT_RE = Object.keys(SYMBOL_UNITS).sort(byLength).map(esc).join('|');

function unitOf(raw: string | undefined): (Unit & { text: string }) | undefined {
  if (!raw) return undefined;
  const u = SYMBOL_UNITS[raw] ?? HANGUL_UNITS.get(raw);
  return u ? { ...u, text: u.say ?? raw } : undefined;
}

/** 단위에 맞는 수 읽기. 시(시각)는 12까지만 고유어(열두 시), 월은 유월·시월 */
function countWith(n: number, unit: (Unit & { text: string }) | undefined): string {
  if (!unit) return sinoNumber(n);
  if (unit.text === '번째' && n === 1) return '첫';
  if (unit.text === '월') return n === 6 ? '유' : n === 10 ? '시' : sinoNumber(n);
  if (unit.text === '시' && n > 12) return sinoNumber(n);
  return unit.reading === 'native' ? nativeNumber(n) : sinoNumber(n);
}

const josaGwa = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 ? '과' : '와';
};

// 숫자 묶음: 1,000 / 3.5 / 12
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?![\d,])|\d+(?:\.\d+)?`;
const RANGE_SEP = '[~∼〜～-]';
// 뒤에 오는 단위 (영문 단위는 띄어 써도 단위로 본다: 500 g)
const UNIT_TAIL = String.raw`(?:(?<sp>\s?)(?<unit>${SYMBOL_UNIT_RE})(?![A-Za-z])|(?<hsp>\s?)(?<hunit>${HANGUL_UNIT_RE}))?`;
/**
 * 숫자 표현 하나. 앞뒤에 숫자·점·쌍점이 붙어 있으면(날짜·시각·전화번호·버전) 건드리지 않는다.
 * - whole/num/den: 1 1/2, 1과 1/2, 3/4
 * - lo/hi: 3~4 (붙임표는 뒤에 단위가 있을 때만 범위로 본다)
 */
const AMOUNT = new RegExp(
  String.raw`(?<![\d.,:/~∼〜～-])(?:(?:(?<whole>\d+)(?:\s*[과와]\s*|\s+))?(?<num>\d+)\/(?<den>\d+)|(?<lo>${NUM})\s*(?<sep>${RANGE_SEP})\s*(?<hi>${NUM})|(?<n>${NUM}))(?![\d:/]|[.,]\d)${UNIT_TAIL}(?<rest>[가-힣]*)`,
  'g',
);

/** 3분의 1 (한글로 쓴 분수) → 삼분의 일 */
const KOREAN_FRACTION = /(?<![\d.,])(\d+)분의\s?(\d+)(?!\d|[.,]\d)/g;

function sayAmount(g: Record<string, string | undefined>, original: string): string {
  const unit = unitOf(g.unit ?? g.hunit);
  // 띄어쓰기: 수와 단위 사이는 띄운다 (한글 맞춤법 제43항: 한 컵, 오백 그램)
  // 월은 붙여 읽는다 (유월, 시월, 삼월)
  const tail = unit ? (unit.text === '월' ? unit.text : ` ${unit.text}`) : '';
  if (g.den) {
    const num = Number(g.num);
    const den = Number(g.den);
    if (!den) return original;
    const half = num === 1 && den === 2;
    if (g.whole) {
      const whole = Number(g.whole);
      if (half && unit) return `${countWith(whole, unit)}${tail} 반`;
      const w = sinoNumber(whole);
      return `${w}${josaGwa(w)} ${sinoNumber(den)}분의 ${sinoNumber(num)}${tail}`;
    }
    if (half && unit) return `반${tail}`;
    return `${sinoNumber(den)}분의 ${sinoNumber(num)}${tail}`;
  }
  if (g.lo && g.hi) {
    // 붙임표(-)는 날짜·번호에도 쓰여서 단위가 있을 때만 범위로 읽는다
    if (g.sep === '-' && !unit) return original;
    if (g.lo.includes('.') || g.hi.includes('.')) return `${sinoDecimal(g.lo)}에서 ${sinoDecimal(g.hi)}${tail}`;
    const lo = Number(g.lo.replace(/,/g, ''));
    const hi = Number(g.hi.replace(/,/g, ''));
    if (unit?.reading === 'native' && unit.text !== '시') {
      if (hi === lo + 1 && NATIVE_PAIRS[lo]) return `${NATIVE_PAIRS[lo]}${tail}`;
      return `${nativeNumber(lo)}${tail}에서 ${nativeNumber(hi)}${tail}`;
    }
    // 한 자리 이웃한 수는 붙여 읽는다 (삼사 분, 오륙 분)
    // 모음 뒤의 육은 [륙] (오륙 분)
    if (hi === lo + 1 && lo >= 1 && lo <= 8) return `${SINO_DIGIT[lo]}${hi === 6 ? '륙' : SINO_DIGIT[hi]}${tail}`;
    return `${countWith(lo, unit)}에서 ${countWith(hi, unit)}${tail}`;
  }
  const raw = g.n!;
  if (raw.includes('.') && !raw.includes(',')) {
    const [int, frac] = raw.split('.') as [string, string];
    // 1.5컵 → 한 컵 반, 0.5컵 → 반 컵 (고유어 단위일 때 사람이 읽는 꼴)
    if (unit?.reading === 'native' && /^50*$/.test(frac)) return Number(int) ? `${countWith(Number(int), unit)}${tail} 반` : `반${tail}`;
    return `${sinoDecimal(raw)}${tail}`;
  }
  const n = Number(raw.replace(/,/g, ''));
  // 0으로 시작하는 번호(007), 아주 긴 숫자(전화번호·주문번호)는 엔진에 맡긴다
  if ((raw.length > 1 && raw.startsWith('0')) || raw.replace(/,/g, '').length > 12) return original;
  return `${countWith(n, unit)}${tail}`;
}

const hasFinal = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
};
const endsWithRieul = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 8;
};

/** [받침 있을 때, 없을 때, 뒤에 더 붙을 수 있는지] */
const PARTICLES: [string, string, boolean][] = [
  ['이에요', '예요', false],
  ['이었', '였', true],
  ['이면', '면', false],
  ['이나', '나', false],
  ['이랑', '랑', true],
  ['으로', '로', true],
  ['은', '는', false],
  ['을', '를', false],
  ['과', '와', false],
  ['이', '가', false],
];

/**
 * 읽는 말이 바뀌면 뒤에 붙은 조사도 맞춘다: "4T는" → "네 큰술은", "1.5개를" → "한 개 반을".
 * 조사 뒤에 다른 말이 더 붙은 경우(가량, 정도)는 조사가 아니므로 두고, '요'만 허용한다 (4T는요).
 */
function fitParticle(said: string, rest: string): string {
  if (!rest || !/[가-힣]$/.test(said)) return rest;
  for (const [withFinal, without, open] of PARTICLES) {
    for (const form of [withFinal, without]) {
      if (!rest.startsWith(form)) continue;
      const after = rest.slice(form.length);
      if (!open && after && after !== '요') continue;
      const right = withFinal === '으로' ? (hasFinal(said) && !endsWithRieul(said) ? '으로' : '로') : hasFinal(said) ? withFinal : without;
      return right + after;
    }
  }
  return rest;
}

/** 숫자와 단위를 읽는 말로 푼다: "설탕 1컵, 물엿 1/2컵" → "설탕 한 컵, 물엿 반 컵" */
export function speakNumbers(text: string): string {
  return text
    .replace(KOREAN_FRACTION, (_, den: string, num: string) => `${sinoNumber(Number(den))}분의 ${sinoNumber(Number(num))}`)
    .replace(AMOUNT, (match: string, ...args: unknown[]) => {
      const groups = args.at(-1) as Record<string, string | undefined>;
      const rest = groups.rest ?? '';
      const said = sayAmount(groups, match.slice(0, match.length - rest.length));
      return said + fitParticle(said, rest);
    });
}

// ───────────────────────── 겹받침 'ㄼ' ─────────────────────────

const SBASE = 0xac00;
const CHO = { ㄱ: 0, ㄲ: 1, ㄴ: 2, ㄷ: 3, ㄸ: 4, ㄹ: 5, ㅁ: 6, ㅂ: 7, ㅃ: 8, ㅅ: 9, ㅆ: 10, ㅇ: 11, ㅈ: 12, ㅉ: 13, ㅊ: 14, ㅍ: 17, ㅎ: 18 } as const;
const JONG = { 없음: 0, ㄹ: 8, ㄼ: 11, ㅁ: 16, ㅂ: 17 } as const;
/** 된소리: ㄱ→ㄲ, ㄷ→ㄸ, ㅂ→ㅃ, ㅅ→ㅆ, ㅈ→ㅉ */
const TENSE: Partial<Record<number, number>> = { [CHO.ㄱ]: CHO.ㄲ, [CHO.ㄷ]: CHO.ㄸ, [CHO.ㅂ]: CHO.ㅃ, [CHO.ㅅ]: CHO.ㅆ, [CHO.ㅈ]: CHO.ㅉ };

interface Syl {
  cho: number;
  jung: number;
  jong: number;
}
const isSyl = (ch: string | undefined) => !!ch && ch.charCodeAt(0) >= SBASE && ch.charCodeAt(0) <= 0xd7a3;
const split = (ch: string): Syl => {
  const c = ch.charCodeAt(0) - SBASE;
  return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 };
};
const join = (s: Syl) => String.fromCharCode(SBASE + s.cho * 588 + s.jung * 28 + s.jong);

/**
 * 겹받침 'ㄼ'을 표준 발음법대로 소리 나는 글자로 바꾼다 (낱말 안에서만).
 * - 모음으로 시작하는 뒷말 앞: 뒤의 'ㅂ'을 넘겨 읽는다 (제14항) — 떫은 → 떨븐, 떫어요 → 떨버요, 여덟을 → 여덜블
 * - 'ㅎ' 앞: ㅂ과 ㅎ이 합쳐 [ㅍ] (제12항 붙임 1) — 넓히다 → 널피다
 * - 'ㄱ, ㄷ, ㅅ, ㅈ' 앞: [ㄹ]로 읽고 뒷소리는 된소리 (제10항, 제25항) — 떫지 → 떨찌, 얇게 → 얄께, 떫다 → 떨따
 * - 'ㄴ' 앞: [ㄹ]로 읽고 ㄴ도 [ㄹ] (제20항) — 떫네 → 떨레
 * - 낱말 끝·그 밖의 자음 앞: [ㄹ] (제10항) — 여덟 → 여덜
 * - 예외 '밟-': 자음 앞에서 [밥] (제10항 다만) — 밟다 → 밥따, 밟는 → 밤는 (제18항)
 * - 예외 '넓-': 넓죽하다·넓둥글다 → 넙쭉하다·넙뚱글다
 * 엔진이 이미 맞게 읽는 흔한 말(얇게·넓은·짧게: 2026-11-19 소리 실험)은 바꾸지 않는다 (READS_FINE).
 */
const READS_FINE = new Set(['얇', '넓', '짧']);

export function respellDoubleFinalLB(text: string): string {
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (!isSyl(ch)) continue;
    const s = split(ch);
    if (s.jong !== JONG.ㄼ) continue;
    const nextCh = chars[i + 1];
    if (READS_FINE.has(ch) && !(ch === '넓' && (nextCh === '죽' || nextCh === '둥'))) continue;
    const next = isSyl(nextCh) ? split(nextCh!) : undefined;
    const bap = ch === '밟' || (ch === '넓' && (nextCh === '죽' || nextCh === '둥'));
    if (!next) {
      chars[i] = join({ ...s, jong: JONG.ㄹ });
      continue;
    }
    if (next.cho === CHO.ㅇ) {
      chars[i] = join({ ...s, jong: JONG.ㄹ });
      chars[i + 1] = join({ ...next, cho: CHO.ㅂ });
    } else if (next.cho === CHO.ㅎ) {
      chars[i] = join({ ...s, jong: JONG.ㄹ });
      chars[i + 1] = join({ ...next, cho: CHO.ㅍ });
    } else if (bap) {
      if (next.cho === CHO.ㄴ || next.cho === CHO.ㅁ) chars[i] = join({ ...s, jong: JONG.ㅁ });
      else {
        chars[i] = join({ ...s, jong: JONG.ㅂ });
        const t = TENSE[next.cho];
        if (t !== undefined) chars[i + 1] = join({ ...next, cho: t });
      }
    } else {
      chars[i] = join({ ...s, jong: JONG.ㄹ });
      // 된소리는 'ㄱ, ㄷ, ㅅ, ㅈ'만 (제25항)
      const t = next.cho === CHO.ㄴ ? CHO.ㄹ : next.cho === CHO.ㅂ ? undefined : TENSE[next.cho];
      if (t !== undefined) chars[i + 1] = join({ ...next, cho: t });
    }
  }
  return chars.join('');
}

// ───────────────────────── 이름 ─────────────────────────

/**
 * 고유 명사 읽기 (소리 실험으로 정함, 2026-11-20, 새 맛조수 기준 녹음 + 받아쓰기):
 * - "이희재의"를 붙여 쓰면 엔진이 '희'를 삼켜 "이제의"로 들렸다 (붙여 쓴 원문 3번 중 3번, 예전 규칙 "이히재에"도 "이재의").
 * - 성과 이름 사이를 띄운 "이 희재의"는 3번 모두 "이 희재의"로 들렸다. '히'로 바꾼 "이 히재의"는 2번 중 1번만.
 * 그래서 글자는 그대로 두고 성 뒤만 띄운다. 자막은 원문 그대로 ("이희재의").
 */
const NAMES: [RegExp, string][] = [[/이희재/g, '이 희재']];

/**
 * 대사 → 목소리 엔진에 넘길 글자.
 * 화면 자막·대본·승인 기록에는 쓰지 않는다 (원본 분량 표기는 그대로 보여야 한다).
 */
export function speakable(text: string): string {
  let out = speakNumbers(text);
  out = respellDoubleFinalLB(out);
  for (const [re, to] of NAMES) out = out.replace(re, to);
  return out;
}

// ───────────────────────── 받아쓴 어절 시간 → 자막 어절 시간 ─────────────────────────

/** 받아쓰기의 한 어절 (말한 글자와 시간, 초) */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
}

const keyChars = (t: string) => [...speakable(t).replace(/[^0-9A-Za-z가-힣]/g, '')];

/**
 * 받아쓴 어절들의 시간을 자막 어절에 맞춘다 (어절 수가 달라도).
 * 읽는 말은 자막과 어절 수가 다를 수 있고("1/2컵" → "반 컵"), 받아쓰기도 어절을 붙이거나 나눈다("맛연구소").
 * 양쪽을 읽는 말로 바꿔 글자끼리 맞춘 뒤(최장 공통 부분열), 받아쓴 어절 안에서는 글자 수만큼 시간을 나눠
 * 자막 어절마다 [시작, 끝]을 정한다. 맞는 글자가 대사의 60%가 안 되면(받아쓰기가 많이 다름) 쓰지 않는다.
 */
export function alignWordTimes(line: string, heard: HeardWord[]): [number, number][] | undefined {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !heard.length) return undefined;
  // 자막 글자 → 어절 번호
  const a: string[] = [];
  const aOwner: number[] = [];
  words.forEach((w, i) => keyChars(w).forEach((c) => (a.push(c), aOwner.push(i))));
  // 받아쓴 글자 → 그 글자가 말해진 시간 (어절 안에서 글자 수로 나눔)
  const b: string[] = [];
  const bTime: [number, number][] = [];
  for (const w of heard) {
    const cs = keyChars(w.text);
    const step = (w.end - w.start) / Math.max(1, cs.length);
    cs.forEach((c, k) => (b.push(c), bTime.push([w.start + step * k, w.start + step * (k + 1)])));
  }
  if (!a.length || !b.length) return undefined;
  // 최장 공통 부분열 표 (대사 한 줄이라 짧다)
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  if (dp[0]![0]! < a.length * 0.6) return undefined;
  const span: ([number, number] | undefined)[] = words.map(() => undefined);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      const o = aOwner[i]!;
      const t = bTime[j]!;
      span[o] = span[o] ? [span[o]![0], t[1]] : [t[0], t[1]];
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  // 맞는 글자가 없는 어절(받아쓰기가 놓친 말)은 앞뒤 어절 사이를 똑같이 나눠 갖는다
  const out: [number, number][] = [];
  for (let i = 0; i < words.length; ) {
    const prevEnd = out[i - 1]?.[1] ?? heard[0]!.start;
    const s = span[i];
    if (s) {
      out.push([Math.max(s[0], prevEnd), Math.max(s[1], prevEnd)]);
      i++;
      continue;
    }
    let k = i;
    while (k < words.length && !span[k]) k++;
    const next = Math.max(prevEnd, span[k]?.[0] ?? heard.at(-1)!.end);
    const step = (next - prevEnd) / (k - i);
    for (let m = i; m < k; m++) out.push([prevEnd + step * (m - i), prevEnd + step * (m - i + 1)]);
    i = k;
  }
  return out;
}
