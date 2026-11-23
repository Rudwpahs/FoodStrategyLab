import { GAGS, GAG_LABELS, type Gag, type Scene } from './types.ts';

/**
 * 농담 장면 그림 고르기. '진지한 엉뚱 가이드'(deadpan)의 말도 안 되는 단계마다 그 말을 그대로 그린 그림을 띄운다
 * (예시 영상은 엘리베이터 안 텐트, 엘리베이터를 드는 타워 크레인처럼 엉뚱한 생각을 글자 그대로 보여 줬다).
 * 작가(Claude)가 gag를 고르고, 비었거나 예전 대본이면 대사 낱말로 고른다.
 */

/** 작가에게 보여 주는 그림 설명 (무엇이 그려지는지) */
export const GAG_HINTS: Record<Gag, string> = {
  desert: '모래 언덕·선인장·뜨거운 해 아래 접시',
  moon: '달 표면에 놓인 접시, 하늘에 지구',
  rocket: '접시를 실은 로켓이 우주로 날아감',
  'giant-fan': '집채만 한 선풍기가 접시에 바람을 보냄',
  'giant-swing': '거대한 그네 위에서 접시가 흔들림',
  crane: '타워 크레인이 접시를 높이 들어 올림',
  balloon: '열기구 바구니에 접시와 맛조수',
  mountain: '눈 덮인 산꼭대기 깃발 옆 접시',
  ocean: '바다 위 작은 배에 탄 접시',
  'north-pole': '북극 얼음 위 접시와 펭귄',
  camping: '텐트 안 침낭에 누운 접시',
  magnifier: '커다란 돋보기로 접시를 들여다봄',
  'roller-coaster': '롤러코스터 맨 앞자리에 탄 접시',
  parachute: '낙하산을 매고 하늘에서 내려오는 접시',
};

/** 대사 낱말 → 그림. 앞에서부터 먼저 맞는 것. '달군다'의 '달', '산'이 든 다른 낱말을 피하려고 앞뒤를 본다 */
const GAG_WORDS: { gag: Gag; re: RegExp }[] = [
  { gag: 'rocket', re: /로켓|우주선|우주로|발사/ },
  { gag: 'moon', re: /(^|[\s"'“‘(])달(까지|로|에|나라|\s?표면|\s?위)|달나라|월면/ },
  { gag: 'desert', re: /사막|모래\s?언덕|선인장/ },
  { gag: 'giant-fan', re: /선풍기|바람개비|송풍기|부채질/ },
  { gag: 'giant-swing', re: /그네/ },
  { gag: 'crane', re: /크레인|기중기/ },
  { gag: 'balloon', re: /열기구|풍선/ },
  { gag: 'mountain', re: /산꼭대기|산 꼭대기|정상|에베레스트|등산|높은\s?산|산\s?위/ },
  { gag: 'ocean', re: /바다|배를\s?타|배에\s?태|항해|태평양|대서양|섬으로/ },
  { gag: 'north-pole', re: /북극|남극|빙하|펭귄|얼음\s?위|눈밭/ },
  { gag: 'camping', re: /텐트|캠핑|침낭|야영/ },
  { gag: 'magnifier', re: /돋보기|현미경|확대경/ },
  { gag: 'roller-coaster', re: /롤러코스터|놀이공원|놀이기구|청룡열차/ },
  { gag: 'parachute', re: /낙하산|스카이다이빙|비행기에서/ },
];

/** 대사로 그림을 고른다. 맞는 낱말이 없으면 null */
export function gagFromLine(line: string): Gag | null {
  return GAG_WORDS.find((w) => w.re.test(line))?.gag ?? null;
}

/**
 * 대본의 농담 장면마다 쓸 그림. 장면에 gag가 있으면 그것, 없으면 대사 낱말, 그것도 없으면 아직 안 쓴 그림을 차례로.
 * 같은 대본에서 같은 그림이 되풀이되지 않게 한다 (작가가 정한 gag는 그대로 둔다).
 */
export function gagPlan(scenes: readonly Pick<Scene, 'type' | 'line' | 'gag'>[]): (Gag | null)[] {
  const used = new Set<Gag>(scenes.flatMap((s) => (s.type === 'gag' && s.gag ? [s.gag] : [])));
  return scenes.map((s) => {
    if (s.type !== 'gag') return null;
    if (s.gag) return s.gag;
    const word = gagFromLine(s.line);
    const pick = word && !used.has(word) ? word : (GAGS.find((g) => !used.has(g)) ?? word ?? GAGS[0]);
    used.add(pick);
    return pick;
  });
}

/** 작가 프롬프트용 그림 목록 한 줄씩 */
export function gagMenu(): string {
  return GAGS.map((g) => `  - ${g}: ${GAG_LABELS[g]} (${GAG_HINTS[g]})`).join('\n');
}
