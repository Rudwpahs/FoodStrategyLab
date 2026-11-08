import { BRAND, CATEGORY_LABELS, extractQuantities, reviewerCredit, formatIngredient, recipeText, splitSentences, type RecipeInput } from '@mat-lab/recipe-core';
import { groupIngredients, kstDate, markdownToHtml, type BlogPost, type ReviewInfo } from './blog.ts';

/**
 * 연구자의 실제 지식을 편집하는 블로그 원고.
 * AI가 경험을 지어 쓰지 않는다: 본문의 경험·의견 문장은 모두 연구자 답변을 그대로 옮긴다.
 * 답변이 없는 필수 질문은 "답변 대기"로 남기고, 게시 준비 완료로 보지 않는다.
 * 근거: docs/research/content-strategy/blog-writing-guide.md
 */
export const BLOG_STYLES = ['everyday', 'expert-note', 'culture', 'experiment'] as const;
export type BlogStyle = (typeof BLOG_STYLES)[number];

export interface BlogStyleInfo {
  label: string;
  summary: string;
  /** 어떤 독자의 어떤 궁금증에 답하는 글인가 */
  reader: string;
}

export const BLOG_STYLE_INFO: Record<BlogStyle, BlogStyleInfo> = {
  everyday: { label: '생활 요리 이야기형', summary: '직접 만든 경험과 함께 집에서 따라 하기 쉽게', reader: '집에서 처음 만들어 보려는 사람' },
  'expert-note': { label: '전문가 조리 노트형', summary: '핵심 단계의 이유와 실패를 줄이는 방법 중심', reader: '실패해 본 적 있거나 더 잘 만들고 싶은 사람' },
  culture: { label: '음식문화·전통조리 해설형', summary: '음식의 유래·쓰임과 전통 조리법의 의미', reader: '음식의 배경이 궁금한 사람' },
  experiment: { label: '조리 실험·비교 분석형', summary: '조건을 바꿔 직접 비교한 결과와 원리', reader: '왜 그런지 이유를 알고 싶은 사람' },
};

export const EXPERT_QUESTION_IDS = ['why-dish', 'memory', 'key-step', 'failure', 'fix', 'why-method', 'student-question', 'history', 'reference', 'comparison', 'limits', 'serving'] as const;
export type ExpertQuestionId = (typeof EXPERT_QUESTION_IDS)[number];

export interface ExpertQuestion {
  id: ExpertQuestionId;
  question: string;
  hint: string;
  /** 이 글 유형에서 꼭 필요한가 / 있으면 쓰는가 */
  required: BlogStyle[];
  optional: BlogStyle[];
  /** 블로그 소제목 */
  heading: string;
}

export const EXPERT_QUESTIONS: ExpertQuestion[] = [
  { id: 'why-dish', question: '이 음식을 언제, 왜 만들게 되셨어요?', hint: '처음 만든 계기, 자주 만드는 때(명절·선물 등)', required: ['everyday'], optional: ['culture', 'expert-note'], heading: '이 음식을 만드는 이유' },
  { id: 'memory', question: '직접 만들면서 기억에 남는 순간이 있나요?', hint: '처음 만들었을 때, 가족·수강생 반응 등 실제 있었던 일만', required: [], optional: ['everyday', 'culture'], heading: '만들면서 있었던 일' },
  { id: 'key-step', question: '가장 중요한 한 단계는 무엇이고, 왜 그런가요?', hint: '예: 데치기, 시럽 농도, 기름 온도', required: ['expert-note', 'experiment'], optional: ['everyday', 'culture'], heading: '가장 중요한 한 단계' },
  { id: 'failure', question: '직접 겪었거나 수업에서 자주 보는 실패는 무엇인가요?', hint: '어떤 모습으로 실패하는지, 왜 그렇게 되는지', required: ['expert-note'], optional: ['everyday', 'experiment'], heading: '자주 보는 실패' },
  { id: 'fix', question: '그 실패는 어떻게 고치거나 막나요?', hint: '실제로 효과를 본 방법', required: ['expert-note'], optional: ['everyday', 'experiment'], heading: '실패를 줄이는 방법' },
  { id: 'why-method', question: '이 재료와 조리법을 고르신 이유가 있나요?', hint: '다른 방법(예: 오븐 vs 튀김)과 비교한 이유', required: [], optional: ['expert-note', 'experiment', 'everyday'], heading: '이 방법을 고른 이유' },
  { id: 'student-question', question: '강의나 수업에서 자주 받는 질문과 답은?', hint: '질문 한두 개와 평소 하시는 답', required: [], optional: ['expert-note', 'everyday'], heading: '수업에서 자주 받는 질문' },
  { id: 'history', question: '이 음식의 유래나 전통적인 쓰임을 알려 주세요.', hint: '확인된 내용만, 어디서 보셨는지 함께', required: ['culture'], optional: [], heading: '음식에 담긴 이야기' },
  { id: 'reference', question: '참고하신 책·자료가 있나요?', hint: '책 이름, 기관 자료 등', required: [], optional: ['culture', 'experiment'], heading: '참고 자료' },
  { id: 'comparison', question: '조건을 바꿔 직접 비교해 보신 적이 있나요? 결과는 어땠나요?', hint: '무엇을 바꿨는지, 실제로 본 차이 (해 보지 않았다면 비워 두세요)', required: ['experiment'], optional: [], heading: '직접 비교해 본 결과' },
  { id: 'limits', question: '주의할 점이나 이 방법의 한계가 있나요?', hint: '안전(기름·화상), 보관 기간, 재료에 따라 달라지는 점', required: [], optional: ['everyday', 'expert-note', 'culture', 'experiment'], heading: '주의할 점' },
  { id: 'serving', question: '보관·곁들임·선물 포장 팁이 있나요?', hint: '실제로 하시는 방법', required: [], optional: ['everyday', 'culture'], heading: '보관과 곁들임' },
];

export interface ExpertNotes {
  answers: Partial<Record<ExpertQuestionId, string>>;
  /** 연구자 본인이 답변 내용을 확인했는지 (가족이 대신 입력했을 수 있으므로) */
  confirmedBy?: string;
  confirmedAt?: string;
}

/** 이 글 유형에 필요한(필수) 질문과 쓸 수 있는(선택) 질문 */
export function questionsFor(style: BlogStyle): { required: ExpertQuestion[]; optional: ExpertQuestion[] } {
  return {
    required: EXPERT_QUESTIONS.filter((q) => q.required.includes(style)),
    optional: EXPERT_QUESTIONS.filter((q) => q.optional.includes(style)),
  };
}

export interface ExpertBlogPost extends BlogPost {
  style: BlogStyle;
  /** 아직 답이 없는 필수 질문 */
  pending: ExpertQuestion[];
  /** 게시해도 되는 상태인지: 대본 승인 + 필수 답변 + 연구자 확인 */
  ready: boolean;
  /** 왜 아직 게시하면 안 되는지 */
  blockers: string[];
}

const answerOf = (notes: ExpertNotes, id: ExpertQuestionId) => (notes.answers[id] ?? '').trim();

/** 연구자 답변을 문단으로 옮긴다 (문장을 고치지 않고 줄바꿈만 정리) */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => [p, '']);
}

const SECTION_ORDER: Record<BlogStyle, (ExpertQuestionId | 'principle' | 'ingredients' | 'steps' | 'tips')[]> = {
  everyday: ['why-dish', 'memory', 'ingredients', 'steps', 'key-step', 'failure', 'fix', 'student-question', 'tips', 'why-method', 'serving', 'limits'],
  'expert-note': ['key-step', 'principle', 'failure', 'fix', 'why-method', 'ingredients', 'steps', 'student-question', 'tips', 'limits', 'why-dish'],
  culture: ['history', 'why-dish', 'memory', 'principle', 'ingredients', 'steps', 'key-step', 'serving', 'limits', 'reference'],
  experiment: ['comparison', 'key-step', 'principle', 'why-method', 'failure', 'fix', 'ingredients', 'steps', 'limits', 'reference'],
};

function titleFor(style: BlogStyle, recipe: RecipeInput): string {
  const dish = recipe.dishName || recipe.topic;
  const who = `${BRAND.researcherTitle} ${BRAND.researcher}`;
  switch (style) {
    case 'everyday':
      return `${dish} 만드는 법 | ${who}의 집 레시피`;
    case 'expert-note':
      return `${dish} 실패 줄이는 법 | ${who}의 조리 노트`;
    case 'culture':
      return `${dish} 이야기와 전통 조리법 | ${who}`;
    case 'experiment':
      return `${recipe.topic} | ${dish} 조리 비교 노트`;
  }
}

/** 연구자 답변 + 원본 레시피로 블로그 원고를 만든다. */
export function buildExpertBlog(input: { recipe: RecipeInput; style: BlogStyle; notes: ExpertNotes; review: ReviewInfo | null; images?: { thumbnail?: string; recipeCard?: string } }): ExpertBlogPost {
  const { recipe, style, notes, review, images = {} } = input;
  const dish = recipe.dishName || recipe.topic;
  const title = titleFor(style, recipe);
  const { required, optional } = questionsFor(style);
  const used = new Set([...required, ...optional].map((q) => q.id));
  const pending = required.filter((q) => !answerOf(notes, q.id));
  const tags = [...new Set(['이희재의맛연구소', dish, `${dish}만들기`, CATEGORY_LABELS[recipe.category], BRAND.researcherTitle, '요리팁'].map((t) => t.replace(/[\s·]/g, '')))];

  const md: string[] = [`# ${title}`, ''];
  md.push(image(images.thumbnail, `${dish} 완성 사진`), '');
  md.push(`> ${recipe.topic}`, '');

  for (const key of SECTION_ORDER[style]) {
    if (key === 'principle') {
      md.push(`## ${BRAND.notePhrase}`, '', ...splitSentences(recipe.principle).flatMap((s) => [s, '']));
      continue;
    }
    if (key === 'ingredients') {
      if (!recipe.ingredients.length) continue;
      md.push('## 재료', '');
      for (const [group, items] of groupIngredients(recipe.ingredients)) {
        if (group) md.push(`### ${group}`, '');
        md.push(...items.map((i) => `- ${formatIngredient(i)}`), '');
      }
      continue;
    }
    if (key === 'steps') {
      if (!recipe.steps.length) continue;
      md.push('## 만드는 법', '', ...recipe.steps.map((s, i) => `${i + 1}. ${s}`), '');
      md.push(image(images.recipeCard, '레시피 카드'), '');
      continue;
    }
    if (key === 'tips') {
      if (!recipe.tips.length) continue;
      md.push(`## ${BRAND.tipPhrase}`, '', ...recipe.tips.map((t) => `- ${t}`), '');
      continue;
    }
    if (!used.has(key)) continue;
    const q = EXPERT_QUESTIONS.find((x) => x.id === key)!;
    const a = answerOf(notes, key);
    if (a) md.push(`## ${q.heading}`, '', ...paragraphs(a));
    else if (q.required.includes(style)) md.push(`## ${q.heading}`, '', `> ✍️ [연구자 답변 대기] ${q.question}`, '');
  }

  const anyAnswer = Object.values(notes.answers).some((v) => v && v.trim());
  const blockers: string[] = [];
  if (!review) blockers.push('대본(조리 정보)이 아직 승인되지 않았어요.');
  if (pending.length) blockers.push(`필수 질문 ${pending.length}개에 연구자 답변이 필요해요.`);
  if (anyAnswer && !notes.confirmedBy) blockers.push('연구자 본인이 답변 내용을 확인해야 해요.');

  md.push('## 영상으로 보기', '', '[여기에 릴스·쇼츠 링크를 붙여넣으세요]', '');
  md.push('---', '');
  md.push(review ? `조리 정보 검토: ${reviewerCredit(review.reviewer) || '검수자'} (${kstDate(review.reviewedAt)})` : '⚠️ 검수 전 초안입니다. 게시하지 마세요.');
  if (anyAnswer) md.push(notes.confirmedBy ? `본문의 경험·의견은 연구자 답변을 그대로 옮겼습니다 (확인: ${notes.confirmedBy}, ${notes.confirmedAt ? kstDate(notes.confirmedAt) : ''}).` : '⚠️ 연구자 본인 확인 전 답변이 포함되어 있습니다.');
  md.push('캐릭터 영상은 AI 도구로 만들었습니다.', `출처: ${recipe.source}`, '', tags.map((t) => `#${t}`).join(' '));

  const markdown = md.join('\n');
  return { title, markdown, html: markdownToHtml(markdown), tags, style, pending, ready: blockers.length === 0, blockers };
}

function image(src: string | undefined, alt: string): string {
  return src ? `![${alt}](${src})` : `[사진 첨부: ${alt}]`;
}

/**
 * 블로그에 원본·연구자 답변 어디에도 없는 분량이 있는지 찾는다.
 * (원고 생성기는 원본만 쓰지만, 사람이 고친 원고도 검사할 수 있게 둔다)
 */
export function blogQuantityIssues(recipe: RecipeInput, notes: ExpertNotes, markdown: string): string[] {
  const allowed = new Set(extractQuantities([recipeText(recipe), ...Object.values(notes.answers)].join('\n')).map((q) => q.normalized));
  // 브랜드 문구(예: "30초 실험실")는 조리 분량이 아니다
  const body = markdown.split(BRAND.slogan).join('');
  return [...new Set(extractQuantities(body).filter((q) => !allowed.has(q.normalized)).map((q) => q.raw))].map((raw) => `원본·연구자 답변에 없는 분량 "${raw}"`);
}

/**
 * 비교할 블로그 문체 후보 2개. 같은 원본 레시피를 쓰되 글의 흐름이 다르다.
 * 음식 이야기가 있으면 음식문화형을, 없으면 생활 요리 이야기형을 전문가 노트형과 비교한다.
 */
export function blogStylePair(recipe: RecipeInput): [BlogStyle, BlogStyle] {
  return recipe.story || recipe.category === 'tradition' ? ['expert-note', 'culture'] : ['expert-note', 'everyday'];
}
