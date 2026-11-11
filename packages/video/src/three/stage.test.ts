import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, STYLE_IDS, buildStyledScript, generateTemplateScript, ingredientProps } from '@mat-lab/recipe-core';
import { CAPTION_SAFE_BOTTOM } from '../theme.ts';
import { buildTimeline, totalFrames } from '../timeline.ts';
import { CAPTION_HEIGHT, CARDS_BOTTOM, faceBox, faceSafeCaptionBottom } from './captionPlacement.ts';
import { EYE_Y, MOUTH_Y } from './Chef3D.tsx';
import { CHEF_POS, chefFacing, propPositions } from './layout.ts';
import { projectToScreen, sceneAt, stageAt } from './stage.ts';

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

  it('전 뒤집기: 끝난 뒤 한 프레임 만에 원래 면으로 튀어 돌아가지 않는다', async () => {
    const { pancakeTurn } = await import('./Food3D.tsx');
    const i = script.scenes.findIndex((s) => s.type === 'steps');
    const t = timings[i]!;
    const turns = Array.from({ length: t.durationInFrames }, (_, k) => pancakeTurn(stageAt(script, timings, t.from + k, 'pancake', props)!.flip));
    expect(Math.max(...turns)).toBeGreaterThan(Math.PI / 2);
    // 프레임 사이 회전 변화가 작다 (예전: 뒤집힌 180°에서 다음 프레임 0°로)
    for (let k = 1; k < turns.length; k++) expect(Math.abs(turns[k]! - turns[k - 1]!), `frame ${k}`).toBeLessThan(0.6);
    // 끝나면 윗면(건더기·노릇한 자국)이 다시 위로 온다
    expect(Math.cos(turns.at(-1)!)).toBeCloseTo(1);
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

describe('자막과 얼굴', () => {
  it('얼굴 범위는 맛조수의 눈·입을 담는다', () => {
    for (const type of ['intro', 'question', 'mistake', 'outro']) {
      const st = stageAt(script, timings, frameOf(type, 0.5), 'pancake', props)!;
      const box = faceBox(st, 1080, 1920)!;
      const facing = chefFacing(st);
      const front = (y: number) => projectToScreen([CHEF_POS[0] + Math.sin(facing) * 0.28, CHEF_POS[1] + y, CHEF_POS[2] + Math.cos(facing) * 0.28], st.camera, 1080, 1920).y;
      expect(box.top, type).toBeLessThan(front(EYE_Y + 0.06));
      expect(box.bottom, type).toBeGreaterThan(front(MOUTH_Y - 0.03));
    }
  });

  it('모든 샘플 레시피 × 템플릿·연출 6종 대본, 모든 프레임에서 자막이 얼굴을 가리지 않는다', () => {
    // 허용 오차: 얼굴 범위 가장자리 12px (범위에 이미 숨쉬기·튐 여유가 들어 있다)
    const TOLERANCE = 12;
    let checked = 0;
    for (const r of SAMPLE_RECIPES) {
      const n = ingredientProps(r).length;
      const scripts = [generateTemplateScript(r), ...STYLE_IDS.map((style) => buildStyledScript(r, { style }).script)];
      for (const s of scripts) {
        const t = buildTimeline(s, s.scenes.map(() => null));
        for (let f = 0; f < totalFrames(t); f += 2) {
          // 비교 장면은 화면을 위아래로 나누고 자막은 기본 위치 (얼굴이 나오지 않는다)
          if (sceneAt(s, t, f)!.scene.visual === 'compare') continue;
          const st = stageAt(s, t, f, 'pancake', n)!;
          const bottom = faceSafeCaptionBottom(st, 1080, 1920);
          expect(bottom).toBeLessThanOrEqual(CAPTION_SAFE_BOTTOM);
          const face = faceBox(st, 1080, 1920);
          if (!face) continue;
          checked++;
          const overlap = bottom - CAPTION_HEIGHT < face.bottom - TOLERANCE && bottom > face.top + TOLERANCE;
          expect(overlap, `${r.dishName} ${s.style ?? 'template'} frame ${f}: 자막 ${Math.round(bottom - CAPTION_HEIGHT)}~${Math.round(bottom)}, 얼굴 ${Math.round(face.top)}~${Math.round(face.bottom)}`).toBe(false);
          expect(bottom - CAPTION_HEIGHT).toBeGreaterThanOrEqual(CARDS_BOTTOM);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('장면마다 분위기 조명이 다르다', () => {
    expect(stageAt(script, timings, frameOf('mistake', 0.5), 'pancake', props)!.mood).toBe('gloom');
    expect(stageAt(script, timings, frameOf('steps', 0.5), 'pancake', props)!.mood).toBe('fire');
    expect(stageAt(script, timings, frameOf('tip', 0.5), 'pancake', props)!.mood).toBe('golden');
  });
});

describe('긴 장면은 약 3초마다 다른 각도', () => {
  it('긴 설명 장면은 화면이 바뀌고, 짧은 장면은 한 화면 그대로', async () => {
    const { beatAt, BEAT_FRAMES } = await import('./shots.ts');
    const long = BEAT_FRAMES * 3;
    const a = beatAt({ type: 'explain' }, 0, 10, long);
    const b = beatAt({ type: 'explain' }, 0, BEAT_FRAMES + 10, long);
    const c = beatAt({ type: 'explain' }, 0, BEAT_FRAMES * 2 + 10, long);
    expect(new Set([a.beat, b.beat, c.beat]).size).toBe(3);
    expect(a.shot.from.pos).not.toEqual(b.shot.from.pos);
    expect(b.shot.from.pos).not.toEqual(c.shot.from.pos);
    // 짧은 장면(2박자 미만)은 한 화면
    expect(beatAt({ type: 'explain' }, 0, 50, BEAT_FRAMES + 20).beat).toBe(0);
    // 연출을 정한 장면(예: 완성 먼저)은 끊지 않는다
    expect(beatAt({ type: 'explain', visual: 'result' }, 0, BEAT_FRAMES * 2, long).beat).toBe(0);
    // 진행률은 화면마다 0에서 다시 시작
    expect(b.progress).toBeLessThan(0.2);
  });
});

describe('맛조수 눈 깜빡임', () => {
  it('대부분 뜬 눈이고, 깜빡이는 간격이 매번 같지 않다', async () => {
    const { eyeOpenness } = await import('./Chef3D.tsx');
    const frames = Array.from({ length: 900 }, (_, f) => eyeOpenness(f));
    expect(frames.every((v) => v >= 0.06 && v <= 1)).toBe(true);
    expect(frames.filter((v) => v === 1).length / frames.length).toBeGreaterThan(0.85);
    // 완전히 감는 순간들의 간격
    const closed = frames.map((v, f) => (v < 0.1 ? f : -1)).filter((f) => f >= 0);
    const gaps = new Set(closed.slice(1).map((f, i) => f - closed[i]!).filter((g) => g > 20));
    expect(closed.length).toBeGreaterThan(5);
    expect(gaps.size).toBeGreaterThan(2);
  });
});
