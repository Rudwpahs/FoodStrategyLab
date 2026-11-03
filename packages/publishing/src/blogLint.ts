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
const CLICHES = ['알아보겠습니다', '중요합니다', '황금레시피', '실패 없는', '누구나', '일품', '자꾸 손이 가는', '도움이 되셨길', '소개해 드릴게요', '누가 만들어도'];
const HEALTH = ['면역', '혈당', '살균', '다이어트', '피부미용', '해독', '항암'];
const FIRST_PERSON = /(제가|저는|저희 집|직접 (?:해|만들어|먹어) ?(?:봤|보니))/;

export function lintBlog(markdown: string, opts: { dish: string; notes?: ExpertNotes }): LintIssue[] {
  const issues: LintIssue[] = [];
  const answers = Object.values(opts.notes?.answers ?? {}).filter(Boolean) as string[];
  const body = markdown.split('\n').filter((l) => !l.startsWith('#')).join('\n');

  for (const c of CLICHES) if (body.includes(c)) issues.push({ level: 'warning', message: `상투적인 표현 "${c}" — 구체적인 사실이나 연구자 경험으로 바꿔 보세요.` });

  const dishCount = opts.dish ? body.split(opts.dish).length - 1 : 0;
  if (dishCount > 6) issues.push({ level: 'warning', message: `요리 이름이 본문에 ${dishCount}번 나와요. 같은 단어 반복은 네이버 스팸 사례(키워드 반복)와 비슷해 보일 수 있어요.` });

  for (const h of HEALTH) if (body.includes(h)) issues.push({ level: 'warning', message: `효능 표현 "${h}"에는 출처를 달거나 빼 주세요.` });

  // 1인칭 경험 문장은 연구자 답변에 있는 문장만 허용한다
  for (const sentence of body.split(/(?<=[.!?。])\s+|\n/)) {
    const s = sentence.trim();
    if (!s || !FIRST_PERSON.test(s)) continue;
    // 아주 짧은 답(예: "네")이 아무 문장이나 통과시키지 않게 8자 이상인 답만 비교한다
    if (!answers.some((a) => a.includes(s) || (a.trim().length >= 8 && s.includes(a.trim())))) {
      issues.push({ level: 'error', message: `연구자 답변에 없는 1인칭 경험 문장이에요: "${s.slice(0, 40)}" — 지어낸 경험일 수 있어요.` });
    }
  }

  const bangs = (body.match(/!!+/g) ?? []).length;
  const tildes = (body.match(/~/g) ?? []).length;
  if (bangs + tildes > 6) issues.push({ level: 'warning', message: `느낌표·물결이 많아요(${bangs + tildes}개). 전문가 노트형에서는 줄이는 편이 좋아요.` });
  return issues;
}
