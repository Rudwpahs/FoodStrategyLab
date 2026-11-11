import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAND, SAMPLE_RECIPES, formatIngredient, type RecipeInput } from '@mat-lab/recipe-core';

// 글꼴 파일은 브라우저(렌더러)에서만 불러온다
vi.mock('./fonts.ts', () => ({ ensureFonts: () => Promise.resolve() }));
// 3D 장면(WebGL)은 브라우저에서만 그린다
vi.mock('./three/KitchenScene.tsx', async (orig) => ({ ...(await orig<typeof import('./three/KitchenScene.tsx')>()), KitchenScene: () => null }));
let screen = { width: 1080, height: 1920 };
vi.mock('remotion', async (orig) => ({ ...(await orig<typeof import('remotion')>()), useVideoConfig: () => ({ ...screen, fps: 30, durationInFrames: 1, id: 'Cover', defaultProps: {}, props: {} }) }));

const { CarouselCard, Cover, RecipeCard } = await import('./compositions/Stills.tsx');
const { SceneCard } = await import('./components/SceneCard.tsx');
const { reviewNote, signatureNote } = await import('./brandText.ts');

const recipe = SAMPLE_RECIPES[0]!;
const text = (el: React.ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
const outro = (reviewed: boolean, reviewer?: string) =>
  text(React.createElement(SceneCard, { scene: { id: 'o', type: 'outro', emotion: 'joy', line: '끝!' }, topic: 't', frame: 30, fps: 30, reviewed, reviewer }));
const card = (reviewed: boolean, reviewer?: string, cleanDraft?: boolean) => text(React.createElement(RecipeCard, { recipe, reviewed, reviewer, cleanDraft }));
const carousel = (reviewed: boolean, reviewer?: string, cleanDraft?: boolean) => text(React.createElement(CarouselCard, { recipe, reviewed, reviewer, cleanDraft, page: 0 }));

const researcherReviewed = `${BRAND.researcherTitle} ${BRAND.researcher} 검토`;

describe('승인 상태 문구 (원칙 3: 검토 문구는 연구자가 승인한 결과물에만)', () => {
  it('문구는 한 곳(brandText)에서 만든다: 연구자 본인 승인만 연구자 이름, 그 밖의 승인자 이름은 쓰지 않는다', () => {
    expect(reviewNote(true, BRAND.researcher)).toBe(`${BRAND.researcherTitle} ${BRAND.researcher} 검토 완료`);
    expect(reviewNote(true, '가족 대리 입력')).toBe('조리 정보 검토 완료');
    expect(reviewNote(true)).toBe('조리 정보 검토 완료');
    expect(reviewNote(false, BRAND.researcher)).toBe('검수 전 초안');
    expect(reviewNote(false, undefined, true)).toBe('');
    expect(signatureNote(true, BRAND.researcher)).toContain(`${BRAND.researcher} 연구자가 검토`);
    expect(signatureNote(true, '가족 대리 입력')).not.toContain(BRAND.researcher);
    expect(signatureNote(true, '가족 대리 입력')).not.toContain('가족');
    expect(signatureNote(false, BRAND.researcher)).toBe('검수 전 초안');
    expect(signatureNote(false, undefined, true)).toBe('');
  });

  it('엔딩 카드·레시피 카드·캐러셀: 가족이 승인하면 "이희재 검토"를 쓰지 않는다', () => {
    for (const html of [outro(true, '가족'), card(true, '가족'), carousel(true, '가족')]) {
      expect(html).not.toContain(researcherReviewed);
      expect(html).not.toContain('가족');
      expect(html).toContain('조리 정보 검토 완료');
    }
  });

  it('엔딩 카드·레시피 카드·캐러셀: 연구자 본인이 승인하면 연구자 이름으로 검토 문구', () => {
    for (const html of [outro(true, BRAND.researcher), card(true, BRAND.researcher), carousel(true, BRAND.researcher)]) expect(html).toContain(`${researcherReviewed} 완료`);
  });

  it('승인 전 검수용(cleanDraft)에는 검토·초안 같은 상태 문구가 없다', () => {
    for (const html of [outro(false), card(false, undefined, true), carousel(false, undefined, true)]) {
      expect(html).not.toContain('검토');
      expect(html).not.toContain('초안');
    }
    expect(card(false)).toContain('검수 전 초안');
  });
});

describe('레시피 카드는 원본 재료 순서를 지킨다 (원칙 1)', () => {
  const mixed: RecipeInput = {
    ...recipe,
    ingredients: [
      { name: '간장', amount: '1큰술', group: '양념' },
      { name: '밀가루', amount: '1컵', group: '반죽' },
      { name: '설탕', amount: '1작은술', group: '양념' },
      { name: '물', amount: '1/2컵' },
    ],
  };
  const order = (html: string) => mixed.ingredients.map((i) => html.indexOf(formatIngredient(i)));

  it('그룹이 섞여 있어도 원본 순서대로, 그룹이 바뀔 때만 머리글을 붙인다 (캐러셀과 같게)', () => {
    for (const html of [text(React.createElement(RecipeCard, { recipe: mixed, reviewed: false })), text(React.createElement(CarouselCard, { recipe: mixed, reviewed: false, page: 0 }))]) {
      const at = order(html);
      expect(at.every((x) => x >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(html.match(/\[양념\]/g)).toHaveLength(2);
      expect(html.match(/\[반죽\]/g)).toHaveLength(1);
    }
  });
});

describe('3D 표지 제목', () => {
  const titleSize = (title: string, size = { width: 1080, height: 1920 }) => {
    screen = size;
    const html = renderToStaticMarkup(React.createElement(Cover, { title, emotion: 'joy', recipe }));
    const before = html.slice(0, html.indexOf(title));
    return Number(before.slice(before.lastIndexOf('font-size:')).match(/font-size:([\d.]+)px/)![1]);
  };
  it('짧은 제목은 크게, 긴 제목은 글자를 줄여 3:4 안쪽 글씨 영역을 넘지 않게 한다', () => {
    expect(titleSize('김치전 바삭하게')).toBe(104);
    const long = '엄마가 알려 준 바삭한 김치전, 반죽을 언제 섞어야 할까요?';
    expect(titleSize(long)).toBeLessThan(104);
    expect(titleSize(long, { width: 1080, height: 1080 })).toBeLessThan(76);
  });
});
