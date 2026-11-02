import { BRAND, CATEGORY_LABELS, formatIngredient, type RecipeInput } from '@mat-lab/recipe-core';

export interface ReviewInfo {
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

const AI_NOTICE = '캐릭터 애니메이션과 일부 문장은 AI 도구로 만들었습니다.';

/**
 * 네이버 블로그 원고. 재료·분량·순서는 원본 데이터를 그대로 쓴다 (AI 문장 사용 안 함).
 * 네이버 블로그 글쓰기 API는 종료되어, 복사해서 붙여넣는 방식으로 게시한다.
 */
export function buildBlogPost({ recipe, review, images = {} }: BlogInput): BlogPost {
  const dish = recipe.dishName || recipe.topic;
  const title = `${recipe.topic} | ${BRAND.researcherTitle} ${BRAND.researcher}의 ${dish} 노하우`;
  const tags = uniqueTags(['이희재의맛연구소', '요리팁', dish, CATEGORY_LABELS[recipe.category], '맛조수', '요리과학']);
  const reviewLine = review
    ? `이 글의 조리 정보는 ${BRAND.researcherTitle} ${review.reviewer}가 검토했습니다. (검토일 ${review.reviewedAt.slice(0, 10)})`
    : '⚠️ 검수 전 초안입니다. 게시하지 마세요.';

  const md: string[] = [];
  md.push(`# ${title}`, '');
  md.push(`안녕하세요, **${BRAND.labName}**입니다. ${BRAND.slogan}, 오늘의 질문은 이것입니다.`, '');
  md.push(`> **${recipe.topic}**`, '');
  md.push(image(images.thumbnail, '썸네일'), '');
  md.push(`## ${BRAND.notePhrase}`, '', recipe.principle, '');
  if (recipe.commonMistake) md.push(`## 이런 실수, 해보셨나요?`, '', recipe.commonMistake, '');
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
  md.push('---', '', reviewLine, AI_NOTICE, `출처: ${recipe.source}`, '', tags.map((t) => `#${t}`).join(' '));

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

function image(src: string | undefined, alt: string): string {
  return src ? `![${alt}](${src})` : `[사진 첨부: ${alt}]`;
}

function uniqueTags(tags: string[]): string[] {
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
