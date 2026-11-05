import { describe, expect, it } from 'vitest';
import { RecipeInputSchema, SAMPLE_RECIPES, checkScript, clipGroups, estimateSceneSeconds, foodProfile, generateTemplateScript, inferFoodKind, ingredientPiece, ingredientProps } from './index.ts';

const [kimchi, spinach, egg] = SAMPLE_RECIPES as [typeof SAMPLE_RECIPES[0], typeof SAMPLE_RECIPES[0], typeof SAMPLE_RECIPES[0]];

describe('3D 음식 표현 규칙', () => {
  it('요리 이름으로 음식 종류를 고른다', () => {
    expect(inferFoodKind(kimchi)).toBe('pancake');
    expect(inferFoodKind(spinach)).toBe('greens');
    expect(inferFoodKind(egg)).toBe('egg');
    expect(inferFoodKind({ dishName: '된장찌개', topic: '', ingredients: [], steps: [] })).toBe('soup');
    expect(inferFoodKind({ dishName: '잔치국수', topic: '', ingredients: [], steps: [] })).toBe('noodles');
    // 이름 맨 뒤 말이 종류: 청국장덮밥은 국이 아니라 덮밥
    const dish = (dishName: string) => inferFoodKind({ dishName, topic: '', ingredients: [], steps: [] });
    expect(dish('청국장덮밥')).toBe('rice');
    expect(dish('청국장찌개')).toBe('soup');
    expect(dish('김치볶음밥')).toBe('rice');
    expect(dish('제육덮밥')).toBe('rice');
    expect(dish('된장국')).toBe('soup');
    expect(dish('해물파전')).toBe('pancake');
    expect(dish('부대찌개')).toBe('soup');
    expect(dish('비빔국수')).toBe('noodles');
    expect(inferFoodKind({ dishName: '', topic: '', ingredients: [], steps: ['재료를 센 불에 볶아 낸다'] })).toBe('stirfry');
  });

  it('재료마다 실제 썬 모양으로 그린다 (양념은 조각이 아니다)', () => {
    expect(ingredientPiece('청양고추')?.shape).toBe('ring');
    expect(ingredientPiece('두부')?.shape).toBe('cube');
    expect(ingredientPiece('청국장')?.shape).toBe('bean');
    expect(ingredientPiece('배추속대')?.shape).toBe('leaf');
    expect(ingredientPiece('양파')?.shape).toBe('strip');
    expect(ingredientPiece('다진 파')?.shape).toBe('ring');
    // 모양 없는 양념·이름 속 글자에 속지 않는다
    expect(ingredientPiece('고춧가루')).toBeNull();
    expect(ingredientPiece('고추장')).toBeNull();
    expect(ingredientPiece('들기름')).toBeNull();
    expect(ingredientPiece('파스타')).toBeNull();
    const dish = RecipeInputSchema.parse({
      dishName: '청국장덮밥',
      topic: '청국장덮밥',
      principle: '청국장은 마지막에 넣는다',
      ingredients: [{ name: '청국장' }, { name: '배추속대' }, { name: '두부' }, { name: '홍고추' }, { name: '청양고추' }, { name: '들기름' }, { name: '간장' }],
      steps: ['청국장을 다진다.', '두부를 으깬다.'],
    });
    const p = foodProfile(dish);
    // 원본 재료 순서 그대로, 원본에 없는 재료(깨 등)는 넣지 않는다
    expect(p.pieces.map((x) => x.shape)).toEqual(['bean', 'leaf', 'cube', 'ring', 'ring']);
    // 조리대 그릇에는 손질한 모양
    expect(ingredientProps(dish).find((x) => x.label.startsWith('두부'))?.piece?.shape).toBe('cube');
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

describe('생성 AI 클립 묶음', () => {
  it('약 8초, 대사 2줄 이하로 순서대로 묶는다', () => {
    for (const r of SAMPLE_RECIPES) {
      const script = generateTemplateScript(r);
      const groups = clipGroups(script);
      expect(groups.flat()).toEqual(script.scenes.map((s) => s.id));
      for (const g of groups) {
        expect(g.length).toBeLessThanOrEqual(2);
        const secs = g.reduce((sum, id) => sum + estimateSceneSeconds(script.scenes.find((s) => s.id === id)!), 0);
        expect(g.length === 1 || secs <= 8).toBe(true);
      }
    }
  });
});
