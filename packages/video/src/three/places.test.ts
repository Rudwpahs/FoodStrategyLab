import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLACES, SAMPLE_RECIPES, STYLE_IDS, buildStyledScript, generateTemplateScript, ingredientProps, type Place, type Script } from '@mat-lab/recipe-core';
import { CAPTION_SAFE_BOTTOM } from '../theme.ts';
import { buildTimeline, totalFrames, type VideoProps } from '../timeline.ts';
import { CAPTION_HEIGHT, CARDS_BOTTOM, faceBox, faceSafeCaptionBottom } from './captionPlacement.ts';
import { DAY_TIMES, MAX_PLACES, PLACE_HAS_STOVE, TABLE_DRESSES, WHIP_FRAMES, placePlan, placeTransitionAt, videoLook } from './places.ts';
import { shotFamily, shotForScene, shotPlan, shotVariants } from './shots.ts';
import { propPositions } from './layout.ts';
import { projectToScreen, sceneAt, stageAt } from './stage.ts';

/**
 * 장소(3D 무대) 고르기·카메라 구도 고르기·장소 넘김.
 * 캔버스 개수는 3D를 그리지 않는 가짜 캔버스로 센다 (compare.test.ts와 같은 방법).
 */
let frame = 0;
vi.mock('../fonts.ts', () => ({ ensureFonts: () => Promise.resolve() }));
vi.mock('./KitchenScene.tsx', async (orig) => ({
  ...(await orig<typeof import('./KitchenScene.tsx')>()),
  KitchenScene: (p: { state: { place: string } }) => React.createElement('canvas', { 'data-place': p.state.place }),
}));
vi.mock('remotion', async (orig) => {
  const real = await orig<typeof import('remotion')>();
  const Pass: React.FC<{ children?: React.ReactNode }> = ({ children }) => React.createElement(React.Fragment, null, children);
  return {
    ...real,
    useCurrentFrame: () => frame,
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30, durationInFrames: 900, id: 'ShortVideo', defaultProps: {}, props: {} }),
    Sequence: Pass,
    Audio: () => null,
    OffthreadVideo: () => null,
    Img: () => null,
  };
});

const allScripts = (): Script[] =>
  SAMPLE_RECIPES.flatMap((r) => [generateTemplateScript(r), ...STYLE_IDS.map((style) => buildStyledScript(r, { style }).script)]);
const withPlaces = (s: Script, places: (Place | undefined)[]): Script => ({ ...s, scenes: s.scenes.map((sc, i) => ({ ...sc, place: places[i] })) });
const changes = (plan: Place[]) => plan.slice(1).filter((p, i) => p !== plan[i]).length;

describe('장소 고르기', () => {
  const base = buildStyledScript(SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!, { style: 'before-after' }).script;

  it('대본에 적힌 장소가 이긴다. 빈 장면은 앞 장면 장소를 따른다', () => {
    const s = withPlaces(base, [undefined, 'lab', undefined, 'market', undefined, undefined, 'pantry']);
    // 맨 앞 빈 장면은 처음 적힌 장소(lab)를 쓴다
    expect(placePlan(s)).toEqual(['lab', 'lab', 'lab', 'market', 'market', 'market', 'pantry']);
    // 모든 장소를 하나씩 적으면 그대로
    const every = withPlaces(base, ['dining', 'kitchen', 'market', 'kitchen', 'lab', 'pantry', 'dining']);
    expect(placePlan(every)).toEqual(['dining', 'kitchen', 'market', 'kitchen', 'lab', 'pantry', 'dining']);
    // 적힌 장소는 상한(3곳)에 묶이지 않는다
    expect(new Set(placePlan(every)).size).toBe(5);
  });

  it('같은 대본 객체에서 장소를 고쳐도 기억해 둔 옛 결과를 쓰지 않는다', () => {
    const s = structuredClone(base);
    const before = placePlan(s);
    s.scenes[2]!.place = 'lab';
    expect(placePlan(s)[2]).toBe('lab');
    expect(placePlan(s)).not.toEqual(before);
  });

  it('자동 고르기는 같은 제목이면 언제나 같고(미리보기 = 렌더), 장면 종류에 맞는다', () => {
    for (const s of allScripts()) {
      const again = structuredClone(s);
      expect(placePlan(again)).toEqual(placePlan(s));
      expect(shotPlan(again)).toEqual(shotPlan(s));
      const plan = placePlan(s);
      s.scenes.forEach((sc, i) => {
        // 조리 장면은 불이 있는 주방, 엔딩·서명은 식탁
        if (sc.type === 'steps' || sc.visual === 'sizzle') expect(plan[i], `${s.title} ${sc.type}`).toBe('kitchen');
        if (sc.type === 'outro' || sc.visual === 'signature' || sc.visual === 'result') expect(plan[i]).toBe('dining');
        if (sc.type === 'ingredients') expect(['market', 'pantry', 'kitchen']).toContain(plan[i]);
      });
    }
  });

  it('보통 대본은 2~3곳에서 펼쳐지고, 장소가 장면마다 바뀌지 않는다', () => {
    for (const s of allScripts()) {
      const plan = placePlan(s);
      const n = new Set(plan).size;
      expect(n, `${s.title} ${s.style ?? 'template'}: ${plan.join(' ')}`).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(MAX_PLACES);
      expect(changes(plan), plan.join(' ')).toBeLessThanOrEqual(3);
    }
  });

  it('제목이 다르면 영상마다 다른 장소·시간대가 나온다 (모든 장소·시간대가 쓰인다)', () => {
    const places = new Set<Place>();
    const times = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const s = { ...base, title: `실험 ${k}번: 왜 그럴까?` };
      placePlan(s).forEach((p) => places.add(p));
      // 원리 설명 장면이 있는 대본으로 연구실도 확인
      placePlan({ ...generateTemplateScript(SAMPLE_RECIPES[0]!), title: s.title }).forEach((p) => places.add(p));
      times.add(videoLook(s.title).dayTime);
    }
    expect([...places].sort()).toEqual([...PLACES].sort());
    expect([...times].sort()).toEqual([...DAY_TIMES].sort());
  });
});

describe('카메라 구도', () => {
  it('구도가 여럿인 장면은 바로 앞 장면과 다른 구도로 찍는다', () => {
    for (const s of allScripts()) {
      const places = placePlan(s);
      const plan = shotPlan(s);
      const seen = new Map<string, number>();
      const names = s.scenes.map((sc, i) => {
        const k = seen.get(sc.type) ?? 0;
        seen.set(sc.type, k + 1);
        return { name: shotForScene(sc, k, plan[i], places[i]).name, many: shotVariants(sc, k).length > 1 };
      });
      names.forEach((n, i) => {
        if (i > 0 && n.many) expect(n.name, `${s.title} ${s.style ?? 'template'} 장면 ${i}`).not.toBe(names[i - 1]!.name);
      });
    }
  });

  it('여러 영상을 모으면 새 구도(밀고 들어가기·낮은 각도·위에서 보기·돌아보기)가 모두 쓰인다', () => {
    const used = new Set<string>();
    for (const s of allScripts()) {
      const places = placePlan(s);
      const plan = shotPlan(s);
      const seen = new Map<string, number>();
      s.scenes.forEach((sc, i) => {
        const k = seen.get(sc.type) ?? 0;
        seen.set(sc.type, k + 1);
        used.add(shotForScene(sc, k, plan[i], places[i]).name);
      });
    }
    for (const name of ['push-in', 'hero-low', 'top-down', 'orbit-wide', 'orbit-props', 'present-low']) expect(used).toContain(name);
  });

  const namesOf = (s: Script) => {
    const places = placePlan(s);
    const plan = shotPlan(s);
    const seen = new Map<string, number>();
    return s.scenes.map((sc, i) => {
      const k = seen.get(sc.type) ?? 0;
      seen.set(sc.type, k + 1);
      return shotForScene(sc, k, plan[i], places[i]).name;
    });
  };

  it('엔딩이 영상마다 같은 그림이 아니다: 엔딩 구도가 여러 가지이고, 오프닝과 같은 갈래로 끝나지 않는다', () => {
    const endings = new Set<string>();
    const openings = new Set<string>();
    for (const s of allScripts()) {
      const names = namesOf(s);
      openings.add(names[0]!);
      endings.add(names.at(-1)!);
      expect(shotFamily(names.at(-1)!), `${s.title} ${s.style ?? 'template'}: ${names.join(' > ')}`).not.toBe(shotFamily(names[0]!));
    }
    // 예전에는 엔딩이 '접시 든 맛조수' 두 구도뿐이었다
    expect(endings.size).toBeGreaterThanOrEqual(3);
    expect(endings).toContain('top-table');
    expect(endings).toContain('hero-low');
    expect(openings.size).toBeGreaterThanOrEqual(4);
  });

  it('음식이 주인공인 새 구도(바짝 다가가기·위에서 본 한 상)가 쓰인다', () => {
    const used = new Set(allScripts().flatMap(namesOf));
    for (const name of ['food-macro', 'top-table']) expect(used).toContain(name);
  });
});

describe('식탁 차림', () => {
  it('제목이 다르면 식탁 차림이 달라지고(네 가지 모두 쓰임), 같은 제목이면 늘 같다', () => {
    const dresses = new Set<string>();
    for (let k = 0; k < 40; k++) dresses.add(videoLook(`실험 ${k}번: 왜 그럴까?`).table);
    expect([...dresses].sort()).toEqual([...TABLE_DRESSES].sort());
    expect(videoLook('호두정과').table).toBe(videoLook('호두정과').table);
  });
});

describe('장소마다 3D 장면', () => {
  it('어느 장소로 정해도 모든 프레임에서 자막이 얼굴을 가리지 않고, 불 없는 곳엔 팬·불이 없다', () => {
    const TOLERANCE = 12;
    let checked = 0;
    for (const place of PLACES) {
      for (const r of SAMPLE_RECIPES.slice(0, 3)) {
        const n = ingredientProps(r).length;
        for (const s0 of [generateTemplateScript(r), ...STYLE_IDS.map((style) => buildStyledScript(r, { style }).script)]) {
          const s = withPlaces(s0, s0.scenes.map(() => place));
          const t = buildTimeline(s, s.scenes.map(() => null));
          for (let f = 0; f < totalFrames(t); f += 3) {
            if (sceneAt(s, t, f)!.scene.visual === 'compare') continue;
            const st = stageAt(s, t, f, 'pancake', n)!;
            expect(st.place).toBe(place);
            if (!PLACE_HAS_STOVE[place]) {
              expect(st.burnerOn || st.showFoodInVessel || st.face === 'stove', `${place} frame ${f}`).toBe(false);
              expect(st.action).not.toBe('cook');
            }
            const bottom = faceSafeCaptionBottom(st, 1080, 1920);
            expect(bottom).toBeLessThanOrEqual(CAPTION_SAFE_BOTTOM);
            const face = faceBox(st, 1080, 1920);
            if (!face) continue;
            checked++;
            const overlap = bottom - CAPTION_HEIGHT < face.bottom - TOLERANCE && bottom > face.top + TOLERANCE;
            expect(overlap, `${place} ${r.dishName} ${s.style ?? 'template'} frame ${f}`).toBe(false);
            expect(bottom - CAPTION_HEIGHT).toBeGreaterThanOrEqual(CARDS_BOTTOM);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('재료 장면은 어느 장소에서든 소품이 모두 화면 안에 들어온다', () => {
    for (const r of SAMPLE_RECIPES) {
      const n = ingredientProps(r).length;
      for (const s of allScripts().filter((x) => x.scenes.some((sc) => sc.type === 'ingredients'))) {
        const t = buildTimeline(s, s.scenes.map(() => null));
        const i = s.scenes.findIndex((sc) => sc.type === 'ingredients');
        const cam = stageAt(s, t, t[i]!.from + Math.floor(t[i]!.durationInFrames / 2), 'pancake', n)!.camera;
        for (const p of propPositions(n)) {
          const sp = projectToScreen(p, cam, 1080, 1920);
          expect(sp.visible).toBe(true);
          expect(sp.x).toBeGreaterThan(40);
          expect(sp.x).toBeLessThan(1040);
        }
      }
    }
  });
});

describe('장소 넘김', () => {
  const recipe = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
  const script = withPlaces(buildStyledScript(recipe, { style: 'before-after' }).script, ['dining', 'dining', 'market', 'kitchen', 'lab', 'pantry', 'dining']);
  const timings = buildTimeline(script, script.scenes.map(() => null));

  it('장소가 바뀌는 경계에서만 짧게 휙 넘긴다', () => {
    // 같은 장소끼리(식탁 → 식탁) 경계는 넘김 없음
    expect(placeTransitionAt(script, timings, timings[1]!.from).amount).toBe(0);
    // 식탁 → 시장: 경계 바로 앞은 나가는 화면, 경계에서 들어오는 화면이 가장 크게
    const cut = timings[2]!.from;
    expect(placeTransitionAt(script, timings, cut - 2)).toMatchObject({ side: -1 });
    expect(placeTransitionAt(script, timings, cut).amount).toBe(1);
    expect(placeTransitionAt(script, timings, cut).side).toBe(1);
    expect(placeTransitionAt(script, timings, cut - WHIP_FRAMES - 1).amount).toBe(0);
    expect(placeTransitionAt(script, timings, cut + WHIP_FRAMES).amount).toBe(0);
    // 장면 가운데는 넘김 없음
    expect(placeTransitionAt(script, timings, timings[3]!.from + 40).amount).toBe(0);
  });

  it('장소가 바뀌어도 캔버스(WebGL)는 언제나 하나다', async () => {
    const { KitchenVideo } = await import('../compositions/KitchenVideo.tsx');
    const props: VideoProps = { script, timings, reviewed: false, cleanDraft: true, recipe };
    const canvases = (f: number) => {
      frame = f;
      return [...renderToStaticMarkup(React.createElement(KitchenVideo, props)).matchAll(/<canvas data-place="(\w+)"/g)].map((m) => m[1]);
    };
    const seen = new Set<string>();
    for (let f = 0; f < totalFrames(timings); f += 7) {
      const c = canvases(f);
      expect(c, `frame ${f}`).toHaveLength(1);
      seen.add(c[0]!);
    }
    // 넘기는 순간에도 하나
    for (const i of [2, 3, 4, 5, 6]) for (const d of [-2, 0, 2]) expect(canvases(timings[i]!.from + d)).toHaveLength(1);
    expect([...seen].sort()).toEqual([...PLACES].sort());
  });
});
