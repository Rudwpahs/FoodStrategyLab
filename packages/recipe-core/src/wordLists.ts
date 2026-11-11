/**
 * 여러 점검이 함께 쓰는 낱말 목록 (블로그 문체 점검·윤문 게이트·인스타 설명 점검·레시피 읽기).
 * 목록이 여러 벌이면 서로 달라지므로 여기 하나만 둔다. 띄어쓰기는 상관없이 찾는다.
 */

/** 건강·효능 표현 (출처 없이 쓰면 안 되고, 인스타 추천에서 빠질 수 있다) */
export const HEALTH_CLAIM_WORDS = ['다이어트', '살 빠', '체중 감량', '혈당', '혈압', '면역', '항암', '암 예방', '해독', '디톡스', '피부 미용', '살균', '만병'] as const;

/** 상투구 (im-not-ai checks.py CLICHE_PATTERNS + 블로그 문체 점검) */
export const CLICHE_PATTERNS: readonly RegExp[] = [
  /알아보겠습니다/,
  /중요합니다/,
  /황금\s*레시피/,
  /실패\s*없는/,
  /누구나/,
  /일품/,
  /자꾸\s*손이\s*가는/,
  /도움이\s*되셨길/,
  /소개해\s*드릴게요/,
  /누가\s*만들어도/,
  /기록적인\s*성과/,
  /괄목할\s*만한/,
  /로\s*평가(?:된다|받|되)/,
  /주목받/,
  /크게\s*기여/,
  /중요한\s*역할을\s*(?:한다|했다|할)/,
  /시사하는\s*바가\s*크/,
  /의미가\s*크다/,
];

const spaced = (word: string) => new RegExp([...word.replace(/\s/g, '')].join(String.raw`\s*`));
const HEALTH_RES = HEALTH_CLAIM_WORDS.map((w) => [w, spaced(w)] as const);

/** 글에 있는 건강·효능 표현 (목록의 표기로 돌려준다) */
export function findHealthClaims(text: string): string[] {
  return HEALTH_RES.filter(([, re]) => re.test(text)).map(([w]) => w);
}

/** 글에 있는 상투구 (글에 쓰인 그대로 돌려준다) */
export function findCliches(text: string): string[] {
  return CLICHE_PATTERNS.map((re) => text.match(re)?.[0]).filter((m): m is string => Boolean(m));
}
