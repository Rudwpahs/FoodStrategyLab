import type { Script } from '../types.ts';
import { STORY_BANNED_PHRASES, findChildishFraming, repeatedPhrases } from './story.ts';

/**
 * 대본 여러 개가 서로 얼마나 다른지 숫자로 본다 (영상 하나로 판단하지 않으려고, 사용자 요청 2026-11-19).
 * - 첫 대사·첫 어절이 겹치는지 (첫 3초가 다 비슷하면 계정 전체가 같은 영상처럼 보인다)
 * - 대본끼리 문장이 얼마나 겹치는지 (글자 3개 묶음 기준 자카드 유사도)
 * - 형식·시청 대상·무대가 고르게 섞였는지
 * - 장면 구성(장면 종류 순서)이 서로 다른지, 실패로 시작하는 대본이 몰리지 않는지 (사용자 지적 2026-11-19: "레파토리가 똑같다")
 * - 어른에게 유치하게 들리는 구도(범인·내기 등)가 들어갔는지
 */
export interface DiversityItem {
  dish: string;
  storyType?: string;
  audience?: string;
  script: Script;
}

export interface DiversityReport {
  count: number;
  /** 첫 대사가 서로 다른 비율 (1이면 모두 다름) */
  uniqueFirstLines: number;
  /** 첫 어절 기준 같은 시작이 몇 번 나왔는지 (2번 이상만) */
  repeatedOpenings: { word: string; count: number }[];
  /** 대본 절반 이상에 되풀이된 두 어절 표현 (예: "선생님 노트를") */
  repeatedPhrases: string[];
  /** 대본 쌍의 문장 유사도: 평균·최대, 0.35 넘는 쌍 */
  similarity: { mean: number; max: number; similarPairs: { a: number; b: number; score: number }[] };
  storyTypes: Record<string, number>;
  audiences: Record<string, number>;
  places: Record<string, number>;
  /** 예전 템플릿에서 반복되던 말이 들어간 대본 수 */
  bannedHits: number;
  /** 유치하게 들리는 구도·말(범인·내기 등)이 들어간 대본 수 */
  childishHits: number;
  /** 장면 종류 순서가 서로 다른 비율 (1이면 모두 다른 구성) */
  uniqueStructures: number;
  /** 실패(실수 장면·실패 화면)로 시작하는 대본 수 */
  failOpenings: number;
  /** 대본마다 첫 대사 글자 수(공백 제외) */
  firstLineChars: { min: number; max: number; mean: number };
}

const SIMILAR = 0.35;

function grams(text: string): Set<string> {
  const t = text.replace(/[\s.,!?…~"'“”‘’()]/g, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function jaccard(a: string, b: string): number {
  const A = grams(a);
  const B = grams(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const count = (keys: string[]) => keys.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
const round = (n: number) => Math.round(n * 100) / 100;

export function storyDiversity(items: DiversityItem[]): DiversityReport {
  const lines = items.map((it) => it.script.scenes.map((s) => s.line).join(' '));
  const firsts = items.map((it) => it.script.scenes[0]?.line.trim() ?? '');
  const firstWords = firsts.map((l) => l.split(/[\s,!?.…]+/)[0] ?? '');
  const pairs: { a: number; b: number; score: number }[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) pairs.push({ a: i, b: j, score: round(jaccard(lines[i]!, lines[j]!)) });
  const scores = pairs.map((p) => p.score);
  const chars = firsts.map((l) => l.replace(/\s/g, '').length);
  const structures = items.map((it) => it.script.scenes.map((s) => s.type).join('>'));
  return {
    count: items.length,
    uniqueFirstLines: items.length ? round(new Set(firsts).size / items.length) : 1,
    repeatedOpenings: Object.entries(count(firstWords.filter(Boolean)))
      .filter(([, n]) => n > 1)
      .map(([word, n]) => ({ word, count: n }))
      .sort((x, y) => y.count - x.count),
    repeatedPhrases: repeatedPhrases(
      items.map((it) => it.script.scenes.map((s) => s.line)),
      [],
      Math.max(2, Math.ceil(items.length / 2)),
    ),
    similarity: {
      mean: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      similarPairs: pairs.filter((p) => p.score > SIMILAR).sort((x, y) => y.score - x.score),
    },
    storyTypes: count(items.map((it) => it.storyType ?? it.script.style ?? '?')),
    audiences: count(items.map((it) => it.audience ?? '정하지 않음')),
    places: count(items.flatMap((it) => it.script.scenes.map((s) => s.place ?? '자동'))),
    bannedHits: lines.filter((l) => STORY_BANNED_PHRASES.some((p) => l.includes(p))).length,
    childishHits: items.filter((it, i) => findChildishFraming(`${it.script.title}\n${lines[i]}`).length > 0).length,
    uniqueStructures: items.length ? round(new Set(structures).size / items.length) : 1,
    failOpenings: items.filter((it) => {
      const s0 = it.script.scenes[0];
      return s0?.type === 'mistake' || s0?.visual === 'fail' || s0?.visual === 'fail-closeup';
    }).length,
    firstLineChars: { min: chars.length ? Math.min(...chars) : 0, max: chars.length ? Math.max(...chars) : 0, mean: chars.length ? round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0 },
  };
}
