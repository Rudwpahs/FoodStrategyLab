import type { StoryDraft } from '@mat-lab/recipe-core';
import type { ReviseCallFn } from '../server/scriptReviser.ts';

/**
 * 시험용 가짜 수정 반영 (실제 Claude를 부르지 않는다). 서버 단위 테스트와 E2E 시험 서버가 같이 쓴다.
 * - 보통: 첫 대사 앞에 "잠깐만요!"를 붙이고 제목 끝에 "(고침)"을 단다. 나머지 장면은 그대로.
 * - 요청에 '설탕'이 있으면: 원본에 없는 분량("설탕 10큰술")을 대사에 넣는다 → 원본 대조에서 막혀야 한다.
 * - 요청에 '그대로'가 있으면: 아무것도 바꾸지 않는다 → '고친 곳이 없어요'로 막혀야 한다.
 */
const between = (text: string, tag: string) => text.slice(text.indexOf(`<${tag}>`) + tag.length + 2, text.indexOf(`</${tag}>`)).trim();

type CurrentScene = { type: StoryDraft['scenes'][number]['type']; emotion: StoryDraft['scenes'][number]['emotion']; visual?: StoryDraft['scenes'][number]['visual']; place?: StoryDraft['scenes'][number]['place']; line: string; cardTitle?: string; cardItems?: string[] };

const PLACE_FOR: Partial<Record<CurrentScene['type'], NonNullable<CurrentScene['place']>>> = { ingredients: 'market', steps: 'kitchen', explain: 'lab', outro: 'dining' };

export const fakeReviseCall: ReviseCallFn = async ({ user }) => {
  const request = between(user, '수정_요청');
  const current = JSON.parse(between(user, '지금_대본')) as { title: string; storyType?: StoryDraft['storyType']; scenes: CurrentScene[] };
  const keep = request.includes('그대로');
  const scenes: StoryDraft['scenes'] = current.scenes.map((s, i) => ({
    beat: i === 0 ? 'hook' : i === current.scenes.length - 1 ? 'payoff' : 'solve',
    type: s.type,
    emotion: s.emotion,
    ...(s.visual ? { visual: s.visual } : {}),
    place: s.place ?? PLACE_FOR[s.type] ?? 'kitchen',
    line: i === 0 && !keep ? `잠깐만요! ${s.line}` : s.line,
    ...(s.cardTitle ? { cardTitle: s.cardTitle } : {}),
    ...(s.cardItems ? { cardItems: s.cardItems } : {}),
  }));
  if (request.includes('설탕')) scenes[1] = { ...scenes[1]!, line: `${scenes[1]!.line} 설탕은 10큰술 넣어요.` };
  const story: StoryDraft = { title: keep ? current.title : `${current.title} (고침)`, storyType: current.storyType ?? 'mystery', logline: `수정 요청 반영: ${request}`, scenes };
  return { output: { story, changes: keep ? '바꾼 곳 없음' : `첫 장면을 더 궁금하게 바꿨어요 (요청: ${request})` }, usage: { inputTokens: 1500, outputTokens: 700, cacheWriteTokens: 0, cacheReadTokens: 0 }, stopReason: 'end_turn' };
};
