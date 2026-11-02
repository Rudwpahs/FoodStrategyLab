import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, generateTemplateScript, ingredientProps } from '@mat-lab/recipe-core';
import { buildTimeline } from '../timeline.ts';
import { propPositions } from './layout.ts';
import { projectToScreen, stageAt } from './stage.ts';

const recipe = SAMPLE_RECIPES[0]!;
const script = generateTemplateScript(recipe);
const timings = buildTimeline(script, script.scenes.map(() => null));
const props = ingredientProps(recipe).length;
const frameOf = (type: string, t: number) => {
  const i = script.scenes.findIndex((s) => s.type === type);
  return timings[i]!.from + Math.floor(timings[i]!.durationInFrames * t);
};

describe('3D 장면 상태', () => {
  it('재료 장면 전에는 소품이 없고, 재료 장면에서 차례로 나타나고, 이후엔 계속 보인다', () => {
    expect(stageAt(script, timings, frameOf('intro', 0.5), 'pancake', props)!.propPop.every((p) => p === 0)).toBe(true);
    const mid = stageAt(script, timings, frameOf('ingredients', 0.15), 'pancake', props)!.propPop;
    expect(mid[0]!).toBeGreaterThan(mid[props - 1]!);
    expect(stageAt(script, timings, frameOf('steps', 0.5), 'pancake', props)!.propPop.every((p) => p === 1)).toBe(true);
  });

  it('조리 장면에서 불이 켜지고 음식이 점점 익는다', () => {
    const a = stageAt(script, timings, frameOf('steps', 0.1), 'pancake', props)!;
    const b = stageAt(script, timings, frameOf('steps', 0.9), 'pancake', props)!;
    expect(a.burnerOn && a.showFoodInVessel && a.action === 'cook').toBe(true);
    expect(b.cook).toBeGreaterThan(a.cook);
    expect(stageAt(script, timings, frameOf('steps', 0.55), 'pancake', props)!.flip).toBeGreaterThan(0);
    expect(stageAt(script, timings, frameOf('steps', 0.55), 'greens', props)!.flip).toBe(0);
  });

  it('실수 장면은 실패한 음식, 팁·엔딩은 완성 음식을 보여준다', () => {
    expect(stageAt(script, timings, frameOf('mistake', 0.5), 'pancake', props)!.plated).toBe('failed');
    expect(stageAt(script, timings, frameOf('tip', 0.5), 'pancake', props)!.plated).toBe('done');
    expect(stageAt(script, timings, frameOf('outro', 0.5), 'pancake', props)!.action).toBe('present');
  });

  it('재료 장면에서 모든 소품이 화면 안에 들어온다', () => {
    const cam = stageAt(script, timings, frameOf('ingredients', 0.5), 'pancake', props)!.camera;
    for (const p of propPositions(props)) {
      const s = projectToScreen(p, cam, 1080, 1920);
      expect(s.visible).toBe(true);
      expect(s.x).toBeGreaterThan(40);
      expect(s.x).toBeLessThan(1040);
    }
  });
});
