import { checkScript, formatIngredient, type RecipeInput, type Script } from '@mat-lab/recipe-core';
import { blogQuantityIssues, type ExpertNotes } from './expertBlog.ts';

export interface ConsistencyIssue {
  level: 'error' | 'warning';
  where: '영상' | '블로그' | 'SNS';
  message: string;
}

/**
 * 영상 대본·블로그·SNS 설명이 원본 레시피를 기준으로 서로 맞는지 검사한다.
 * 오류가 하나라도 있으면 게시 전에 고쳐야 한다.
 */
export function checkConsistency(input: { recipe: RecipeInput; script: Script; blogMarkdown: string; social: string; reviewed: boolean; notes?: ExpertNotes }): ConsistencyIssue[] {
  const { recipe, script, blogMarkdown, social, reviewed, notes = { answers: {} } } = input;
  const issues: ConsistencyIssue[] = [];

  for (const i of checkScript(recipe, script).filter((x) => x.level === 'error')) issues.push({ level: 'error', where: '영상', message: i.message });

  for (const ing of recipe.ingredients) {
    const line = formatIngredient(ing);
    if (!blogMarkdown.includes(line)) issues.push({ level: 'error', where: '블로그', message: `재료 "${line}"이(가) 블로그에 없어요.` });
  }
  for (const m of blogQuantityIssues(recipe, notes, blogMarkdown)) issues.push({ level: 'error', where: '블로그', message: m });
  recipe.steps.forEach((s, k) => {
    if (!blogMarkdown.includes(s)) issues.push({ level: 'error', where: '블로그', message: `조리 순서 ${k + 1}번이 블로그에 없거나 바뀌었어요.` });
  });

  const videoTip = script.scenes.find((s) => s.type === 'tip')?.cardItems?.[0];
  if (videoTip && !blogMarkdown.includes(videoTip)) issues.push({ level: 'warning', where: '블로그', message: '영상의 한 줄 팁이 블로그에는 없어요.' });

  if (!reviewed && /검토한|검증한|검수한/.test(social)) issues.push({ level: 'error', where: 'SNS', message: '승인 전인데 설명문에 "검토한" 표현이 있어요.' });
  if (!reviewed && /검토했습니다|검증했습니다|검증된|검토한|조리 정보 검토:/.test(blogMarkdown)) issues.push({ level: 'error', where: '블로그', message: '승인 전인데 블로그에 "검토/검증" 표현이 있어요.' });
  return issues;
}
