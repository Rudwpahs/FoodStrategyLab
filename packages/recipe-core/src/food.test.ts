import { describe, expect, it } from 'vitest';
import { RecipeInputSchema, SAMPLE_RECIPES, checkScript, foodProfile, generateTemplateScript, inferFoodKind, ingredientProps } from './index.ts';

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
    // 요리 이름의 재료(김치) → 주재료 → 양념 순
    expect(props.map((p) => p.shape)).toEqual(['bowl', 'bowl', 'jar', 'cup', 'bottle']);
    expect(props[0]!.label).toBe('잘 익은 김치 200g');
    expect(ingredientProps(egg)[0]!.shape).toBe('egg');
  });

  it('실제 레시피: 호두정과는 팬 요리, 파스타는 면 요리이고 도구는 소품에서 빠진다', () => {
    const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
    const pasta = SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!;
    expect(foodProfile(walnut).kind).toBe('stirfry');
    expect(foodProfile(walnut).vessel).toBe('pan');
    expect(ingredientProps(walnut).map((p) => p.label)).not.toContain('키친타올');
    expect(ingredientProps(walnut)[0]!.label).toBe('호두 500g');
    expect(foodProfile(pasta).kind).toBe('noodles');
    const labels = ingredientProps(pasta).map((p) => p.label);
    expect(labels.slice(0, 3)).toEqual(['고사리 400g', '거피들깨가루 100g', '고사리들깨소스 1인분']);
    expect(labels).toContain('스파게티니 100g');
    expect(labels.length).toBeLessThanOrEqual(6);
  });

  it('실제 레시피 대본은 원본에 없는 분량 오류가 없다', () => {
    for (const r of SAMPLE_RECIPES.slice(3)) {
      const errors = checkScript(r, generateTemplateScript(r)).filter((i) => i.level === 'error');
      expect(errors, r.dishName).toEqual([]);
    }
  });
});
