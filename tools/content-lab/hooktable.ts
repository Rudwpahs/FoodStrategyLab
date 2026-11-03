import { HOOK_INFO, HOOK_TYPES, SAMPLE_RECIPES, VISUAL_LABELS, hookCandidate, type RecipeInput } from '@mat-lab/recipe-core';
const w = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
// 연구자 입력이 필요한 칸은 예시 초안으로 채운 버전 (실제 게시 전 연구자 확인 필요)
const full: RecipeInput = { ...w, commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.', misconception: '정과는 오래 졸일수록 바삭하다', story: '정과는 예부터 잔칫상에 오르던 과자예요. 과일이나 견과를 꿀이나 조청에 조려 만들었어요.' };
console.log('| # | 유형 | 원본만으로 | 첫 대사 | 첫 화면 | 점수 | 추천 이유 / 필요한 자료 |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
HOOK_TYPES.forEach((t, i) => {
  const a = hookCandidate(w, t);
  const h = a.available ? a : hookCandidate(full, t);
  const v = h.scenes[0]?.visual;
  console.log(`| ${i + 1} | ${HOOK_INFO[t].label} | ${a.available ? '가능' : '연구자 입력 필요*'} | ${h.line} | ${v ? VISUAL_LABELS[v] : '-'} | ${a.available ? a.score.toFixed(1) : '-'} | ${a.available ? a.reason : `필요: ${a.missing}`}${h.needsReview.length ? ` ⚠ ${h.needsReview.join(' ')}` : ''} |`);
});
