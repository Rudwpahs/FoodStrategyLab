import { describe, expect, it } from 'vitest';
import { RecipeInputSchema, SAMPLE_RECIPES, foodProfile, inferFoodKind, ingredientProps } from './index.ts';

const [kimchi, spinach, egg] = SAMPLE_RECIPES as [typeof SAMPLE_RECIPES[0], typeof SAMPLE_RECIPES[0], typeof SAMPLE_RECIPES[0]];

describe('3D 음식 표현 규칙', () => {
  it('요리 이름으로 음식 종류를 고른다', () => {
    expect(inferFoodKind(kimchi)).toBe('pancake');
    expect(inferFoodKind(spinach)).toBe('greens');
    expect(inferFoodKind(egg)).toBe('egg');
    expect(inferFoodKind({ dishName: '된장찌개', topic: '', ingredients: [], steps: [] })).toBe('soup');
    expect(inferFoodKind({ dishName: '잔치국수', topic: '', ingredients: [], steps: [] })).toBe('noodles');
    expect(inferFoodKind({ dishName: '', topic: '', ingredients: [], steps: ['재료를 센 불에 볶아 낸다'] })).toBe('stirfry');
  });

  it('재료 색이 음식에 반영된다', () => {
    const p = foodProfile(kimchi);
    expect(p.vessel).toBe('pan');
    expect(p.bits).toContain('#D9472B');
    expect(foodProfile(spinach).vessel).toBe('pot');
  });

  it('직접 고른 모양이 추정보다 우선한다', () => {
    const r = RecipeInputSchema.parse({ ...kimchi, foodKind: 'soup' });
    expect(foodProfile(r).kind).toBe('soup');
  });

  it('재료마다 조리대 소품을 만든다', () => {
    const props = ingredientProps(kimchi);
    expect(props.map((p) => p.shape)).toEqual(['bowl', 'jar', 'cup', 'bowl', 'bottle']);
    expect(props[0]!.label).toBe('잘 익은 김치 200g');
    expect(ingredientProps(egg)[0]!.shape).toBe('egg');
  });
});
