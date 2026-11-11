import { BRAND, CATEGORY_LABELS, formalParagraph, formatIngredient, josa, type RecipeInput } from '@mat-lab/recipe-core';

export interface ReviewInfo {
  /** 연구자 계정이 승인했으면 브랜드의 연구자 이름, 아니면 빈 값 (서버 creditedReviewer). 승인자 표시 이름은 넣지 않는다 */
  reviewer: string;
  reviewedAt: string; // ISO
}

export interface BlogInput {
  recipe: RecipeInput;
  review: ReviewInfo | null;
  /** 이미지 파일 이름 또는 URL (없으면 자리표시) */
  images?: { thumbnail?: string; recipeCard?: string };
}

export interface BlogPost {
  title: string;
  markdown: string;
  html: string;
  tags: string[];
}

/** 날짜는 한국 시간 기준으로 쓴다 (서버는 보통 UTC라 그대로 자르면 하루 어긋날 수 있다) */
export function kstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 블로그 꼬리말의 AI 고지 (블로그 두 종류가 같이 쓴다) */
export const BLOG_AI_NOTICE = '캐릭터 애니메이션과 일부 문장은 AI 도구로 만들었습니다.';

/** 검토한 사람: 승인한 계정 이름이 아니라 연구소 연구자 (원칙 3: 검토 문구는 승인된 결과물에만) */
export const REVIEWER_CREDIT = `${BRAND.researcherTitle} ${BRAND.researcher}`;

/** 연구자 본인이 승인했을 때만 연구자 이름으로 '검토'라고 쓴다 (영상·카드의 brandText와 같은 규칙) */
export const creditsResearcher = (review: ReviewInfo) => review.reviewer.includes(BRAND.researcher);

/**
 * 네이버 블로그 원고. 재료·분량·순서는 원본 데이터를 그대로 쓴다 (AI 문장 사용 안 함).
 * 네이버 블로그 글쓰기 API는 종료되어, 복사해서 붙여넣는 방식으로 게시한다.
 */
export function buildBlogPost({ recipe, review, images = {} }: BlogInput): BlogPost {
  const dish = recipe.dishName || recipe.topic;
  const title = `${recipe.topic} | ${BRAND.researcherTitle} ${BRAND.researcher}의 ${dish} 노하우`;
  const tags = uniqueTags([BRAND.labName, '요리팁', dish, CATEGORY_LABELS[recipe.category], BRAND.character, '요리과학']);
  const reviewLine = review
    ? creditsResearcher(review)
      ? `이 글의 조리 정보는 ${josa(REVIEWER_CREDIT, '이/가')} 검토했습니다. (검토일 ${kstDate(review.reviewedAt)})`
      : `이 글의 조리 정보는 검토를 마쳤습니다. (검토일 ${kstDate(review.reviewedAt)})`
    : '⚠️ 검수 전 초안입니다. 게시하지 마세요.';

  const md: string[] = [];
  md.push(`# ${title}`, '');
  md.push(`안녕하세요, **${BRAND.labName}**입니다. 오늘은 이 질문을 함께 풀어 보겠습니다.`, '');
  md.push(`> **${recipe.topic}**`, '');
  md.push(image(images.thumbnail, '썸네일'), '');
  // 원리·실수 문단은 본문 문체(~습니다)에 맞춰 끝맺음만 고른다. 재료·순서·팁 목록은 원본 그대로 둔다
  md.push(`## ${BRAND.notePhrase}`, '', formalParagraph(recipe.principle), '');
  if (recipe.commonMistake) md.push(`## 이런 실수, 해보셨나요?`, '', formalParagraph(recipe.commonMistake), '');
  if (recipe.ingredients.length) {
    md.push(`## 재료`, '');
    for (const [group, items] of groupIngredients(recipe.ingredients)) {
      if (group) md.push(`### ${group}`, '');
      md.push(...items.map((i) => `- ${formatIngredient(i)}`), '');
    }
  }
  if (recipe.steps.length) {
    md.push(`## 만드는 법`, '', ...recipe.steps.map((s, i) => `${i + 1}. ${s}`), '');
  }
  md.push(image(images.recipeCard, '레시피 카드'), '');
  if (recipe.tips.length) {
    md.push(`## ${BRAND.tipPhrase}`, '', ...recipe.tips.map((t) => `- ${t}`), '');
  }
  md.push(`## 영상으로 보기`, '', '[여기에 릴스·쇼츠 링크를 붙여넣으세요]', '');
  md.push('---', '', reviewLine, BLOG_AI_NOTICE, `출처: ${recipe.source}`, '', tags.map((t) => `#${t}`).join(' '));

  return { title, markdown: md.join('\n'), html: markdownToHtml(md.join('\n')), tags };
}

/** 재료를 묶음별로 나눈다 (입력 순서 유지) */
export function groupIngredients<T extends { group?: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const key = it.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return [...groups.entries()];
}

/** 사진 자리 (이미지가 없으면 자리표시) */
export function image(src: string | undefined, alt: string): string {
  return src ? `![${alt}](${src})` : `[사진 첨부: ${alt}]`;
}

/** 해시태그: 띄어쓰기·가운뎃점을 빼고 겹치지 않게 */
export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.replace(/[\s·]/g, '')).filter(Boolean))];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** 블로그 원고에 쓰는 마크다운 일부만 HTML로 바꾼다 (붙여넣기용 단순 서식). */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of md.split('\n')) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^- (.*)$/))) {
      if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1]!)}</li>`);
      continue;
    }
    if ((m = line.match(/^\d+\. (.*)$/))) {
      if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1]!)}</li>`);
      continue;
    }
    close();
    if (!line.trim()) continue;
    if ((m = line.match(/^# (.*)$/))) out.push(`<h1>${inline(m[1]!)}</h1>`);
    else if ((m = line.match(/^## (.*)$/))) out.push(`<h2>${inline(m[1]!)}</h2>`);
    else if ((m = line.match(/^### (.*)$/))) out.push(`<h3>${inline(m[1]!)}</h3>`);
    else if ((m = line.match(/^> (.*)$/))) out.push(`<blockquote>${inline(m[1]!)}</blockquote>`);
    else if ((m = line.match(/^!\[(.*?)\]\((.*?)\)$/))) out.push(`<p><img src="${escapeHtml(m[2]!)}" alt="${escapeHtml(m[1]!)}" style="max-width:100%"></p>`);
    else if (line === '---') out.push('<hr>');
    else out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('\n');
}
