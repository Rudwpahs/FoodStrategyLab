import { findCliches, findHealthClaims } from '@mat-lab/recipe-core';
import { findAiTells } from './aiTells.ts';
import type { ExpertNotes } from './expertBlog.ts';

export interface LintIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * 블로그 원고 문체 검사. 사람이 고친 원고나 AI 초안에서 자주 보이는 패턴을 알려 준다.
 * 근거: docs/research/content-strategy/blog-research.md 6장 (네이버 공식 가이드 + 표본 관찰)
 * 숫자 기준(메뉴명 6회 등)은 우리 내부 기준이며 네이버 기준이 아니다.
 */
/** 경험 서술: 1인칭, 가족·수강생 이야기, 우리 집, 처음 만들었을 때, ~했었 (연구자 답변 원문에만 있어야 한다) */
const FIRST_PERSON = /(제가|저는|저희 집|우리\s?집|(?<![가-힣])내가(?=\s)|어머니|할머니|엄마|시어머니|수강생|학생들|수업에서|처음 만들었을 때|직접 (?:해|만들어|먹어) ?(?:봤|보니)|[았었했]었)/;

export function lintBlog(markdown: string, opts: { dish: string; notes?: ExpertNotes }): LintIssue[] {
  const issues: LintIssue[] = [];
  const answers = Object.values(opts.notes?.answers ?? {}).filter(Boolean) as string[];
  const body = markdown.split('\n').filter((l) => !l.startsWith('#')).join('\n');

  for (const c of findCliches(body)) issues.push({ level: 'warning', message: `상투적인 표현 "${c}" — 구체적인 사실이나 연구자 경험으로 바꿔 보세요.` });

  const dishCount = opts.dish ? body.split(opts.dish).length - 1 : 0;
  if (dishCount > 6) issues.push({ level: 'warning', message: `요리 이름이 본문에 ${dishCount}번 나와요. 같은 단어 반복은 네이버 스팸 사례(키워드 반복)와 비슷해 보일 수 있어요.` });

  for (const h of findHealthClaims(body)) issues.push({ level: 'warning', message: `효능 표현 "${h}"에는 출처를 달거나 빼 주세요.` });

  // 1인칭 경험 문장은 연구자 답변에 있는 문장만 허용한다
  for (const sentence of body.split(/(?<=[.!?。])\s+|\n/)) {
    const s = sentence.trim();
    // '답변 대기' 자리표시는 연구자에게 묻는 질문이라 경험 서술이 아니다
    if (!s || s.includes('[연구자 답변 대기]') || !FIRST_PERSON.test(s)) continue;
    // 아주 짧은 답(예: "네")이 아무 문장이나 통과시키지 않게 8자 이상인 답만 비교한다
    if (!answers.some((a) => a.includes(s) || (a.trim().length >= 8 && s.includes(a.trim())))) {
      issues.push({ level: 'error', message: `연구자 답변에 없는 1인칭·경험 문장이에요: "${s.slice(0, 40)}" — 지어낸 경험일 수 있어요.` });
    }
  }

  // AI 티 (im-not-ai 규칙): 연구자 답변 원문은 검사하지 않는다
  // '답변 대기'·'검수 전' 같은 내부 표시 줄은 게시 전에 사라지므로 빼고 본다
  const publishable = body
    .split('\n')
    .filter((l) => !l.includes('[연구자 답변 대기]') && !l.trim().startsWith('⚠️'))
    .join('\n');
  for (const t of findAiTells(publishable, answers)) {
    issues.push({ level: 'warning', message: `AI 티 [${t.rule}] ${t.found} — ${t.fix}` });
  }

  const bangs = (body.match(/!!+/g) ?? []).length;
  const tildes = (body.match(/~/g) ?? []).length;
  if (bangs + tildes > 6) issues.push({ level: 'warning', message: `느낌표·물결이 많아요(${bangs + tildes}개). 전문가 노트형에서는 줄이는 편이 좋아요.` });
  return issues;
}
