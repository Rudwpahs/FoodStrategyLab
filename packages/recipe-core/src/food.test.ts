import { describe, expect, it } from 'vitest';
import { RecipeInputSchema, SAMPLE_RECIPES, checkScript, clipGroups, estimateSceneSeconds, estimateSpeechSeconds, foodProfile, generateTemplateScript, inferFoodKind, ingredientPiece, ingredientProps, servedHot } from './index.ts';

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

  it('김치는 빨간 잎+흰 줄기 조각, 고사리는 가는 줄기, 다진 마늘은 알갱이. 나물로 끝나는 채소는 물이 아니다', () => {
    expect(ingredientPiece('잘 익은 김치')?.shape).toBe('kimchi');
    expect(ingredientPiece('김치 국물')).toBeNull();
    expect(ingredientPiece('고사리')?.shape).toBe('stalk');
    expect(ingredientPiece('다진 마늘')?.shape).toBe('mince');
    expect(ingredientPiece('다진마늘')?.shape).toBe('mince');
    expect(ingredientPiece('마늘')?.shape).toBe('slice');
    // 예전에는 '~물'로 끝나 찬물·국물처럼 빠졌다
    expect(ingredientPiece('참나물')?.shape).toBe('leaf');
    expect(ingredientPiece('콩나물')?.shape).toBe('strip');
    expect(ingredientPiece('찬물')).toBeNull();
    expect(ingredientPiece('얼음물')).toBeNull();
  });

  it('실제 레시피 건더기: 파스타는 고사리 줄기·참나물 고명이 있고, 시금치나물은 다진 마늘 알갱이가 있다 (원본에 없는 깨는 없다)', () => {
    const pasta = foodProfile(SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!);
    expect(pasta.pieces.map((p) => p.shape)).toEqual(expect.arrayContaining(['stalk', 'leaf']));
    expect(pasta.pieces.some((p) => p.shape === 'seed')).toBe(false);
    expect(foodProfile(spinach).pieces.map((p) => p.shape)).toEqual(['leaf', 'mince']);
    expect(foodProfile(kimchi).pieces.map((p) => p.shape)).toEqual(['kimchi']);
  });

  it('들깨 파스타 소스는 면보다 확실히 짙은 회갈색 (연한 밀색 면이 소스와 구별되게)', () => {
    const pasta = foodProfile(SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!);
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    expect(lum(pasta.cookedColor) - lum(pasta.liquidColor!)).toBeGreaterThan(0.12);
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
    // 다진 마늘은 작은 그릇의 알갱이 (통마늘 알이 아니다)
    const garlic = ingredientProps(spinach).find((p) => p.label.startsWith('다진 마늘'))!;
    expect(garlic.shape).toBe('bowl');
    expect(garlic.piece?.shape).toBe('mince');
    expect(ingredientProps(kimchi)[0]!.piece?.shape).toBe('kimchi');
    const pasta = ingredientProps(SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!);
    // 마른 면은 면 묶음, 고추는 송송 썬 고리 (노란·빨간 물이 담긴 그릇이 아니다)
    expect(pasta.find((p) => p.label.startsWith('스파게티니'))?.shape).toBe('noodles');
    expect(pasta.find((p) => p.label.startsWith('매운고추'))?.piece?.shape).toBe('ring');
    expect(pasta.find((p) => p.label.startsWith('고사리 '))?.piece?.shape).toBe('stalk');
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

  it('김은 뜨겁게 먹는 음식에만: 조리 순서 끝에서 식히거나 찬 요리 이름이면 김이 없다', () => {
    const hot = (name: string) => foodProfile(SAMPLE_RECIPES.find((r) => r.dishName === name)!).hot;
    expect(hot('바삭한 김치전')).toBe(true); // 식힘망은 눅눅해지지 않게 올려 두는 것
    expect(hot('시금치나물')).toBe(false); // 찬물에 헹군 나물
    expect(hot('반숙 달걀')).toBe(false); // 얼음물에 식힘
    expect(hot('호두정과')).toBe(false); // 정과는 식혀 먹는 과자
    expect(hot('들깨고사리파스타')).toBe(true); // 소스를 '식혀서 냉동보관'은 준비 단계라 보지 않는다
    expect(servedHot({ dishName: '김치찌개', steps: ['끓인다'] }, 'soup')).toBe(true);
    expect(servedHot({ dishName: '비빔국수', steps: ['삶은 면을 찬물에 헹군다', '양념에 비빈다'] }, 'noodles')).toBe(false);
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

describe('대사 길이 추정', () => {
  it('말하는 시간은 글자 수(띄어쓰기 빼고)를 초당 7자로 나누고, 아무리 짧아도 1.1초', () => {
    expect(estimateSpeechSeconds('안녕')).toBe(1.1);
    expect(estimateSpeechSeconds('가나다라 마바사아 자차카타 파하')).toBeCloseTo(14 / 7, 10);
  });

  it('장면 길이는 말하는 시간 + 0.5초 (예전 값과 같다)', () => {
    for (const line of ['안녕', '가나다라마바사', '찬물로 반죽해야 바삭해요', '팬을 충분히 달군 뒤 기름을 넉넉히 두르고 얇게 펴서 부쳐요']) {
      const chars = line.replace(/\s/g, '').length;
      expect(estimateSceneSeconds({ line })).toBeCloseTo(Math.max(1.6, chars / 7 + 0.5), 10);
      expect(estimateSceneSeconds({ line }) - estimateSpeechSeconds(line)).toBeCloseTo(0.5, 10);
    }
  });
});
