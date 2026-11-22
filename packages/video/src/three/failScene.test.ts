import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAND, SAMPLE_RECIPES, buildStyledScript, finalizeStory, formatIngredient, generateTemplateScript, type Script, type StoryDraft } from '@mat-lab/recipe-core';
import { buildTimeline, totalFrames, type VideoProps } from '../timeline.ts';
import { sfxCues } from '../sfx.ts';
import { CAPTION_HEIGHT, faceBox, faceSafeCaptionBottom } from './captionPlacement.ts';
import { FAIL_PLATE } from './layout.ts';
import { projectToScreen, sceneAt, stageAt } from './stage.ts';

/**
 * 실패 장면: 기록 담당 맛조수는 실수하지 않는다 (persona-2026-11.md). 실패작을 들고 당황하던 연출을 바꿨다:
 * 흔히 겪는 실패 결과는 조리대 위에 따로 놓고, 맛조수는 빈손으로 그 옆에서 차분히(궁금한 표정) 살펴본다.
 * 화면 구성은 3D를 그리지 않는 가짜 캔버스로 확인한다 (compare.test.ts와 같은 방법).
 */
let frame = 0;
vi.mock('../fonts.ts', () => ({ ensureFonts: () => Promise.resolve() }));
vi.mock('./KitchenScene.tsx', async (orig) => ({ ...(await orig<typeof import('./KitchenScene.tsx')>()), KitchenScene: () => React.createElement('canvas') }));
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
const { KitchenVideo } = await import('../compositions/KitchenVideo.tsx');

const kimchi = SAMPLE_RECIPES[0]!;
/** 실패 원인 하나(one-fix) 이야기 대본: 첫 장면과 끝 무렵 장면이 실패 연출 */
const oneFix = (): Script => {
  const draft: StoryDraft = {
    title: '김치전이 눅눅해지는 이유 하나',
    storyType: 'one-fix',
    audience: 'young-home',
    logline: '반죽을 미리 만들어 두면 눅눅해지는 이유',
    scenes: [
      { beat: 'hook', type: 'mistake', emotion: 'disappointed', visual: 'fail', place: 'kitchen', line: '김치전, 이렇게 눅눅해진 적 있죠?', cardTitle: '반죽을 미리 만들어 두면' },
      { beat: 'context', type: 'question', emotion: 'curious', place: 'kitchen', line: '원인은 딱 하나, 반죽을 섞는 때예요.' },
      { beat: 'point', type: 'explain', emotion: 'curious', place: 'lab', line: '김치 속 소금이 반죽의 물기를 계속 끌어낸대요.', cardTitle: BRAND.notePhrase, cardItems: [kimchi.principle] },
      { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'pantry', line: '김치, 부침가루, 찬물, 김치 국물을 준비해요.', cardTitle: '재료', cardItems: kimchi.ingredients.map(formatIngredient) },
      { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '반죽은 부치기 직전에 섞어 얇게 부쳐요.', cardItems: kimchi.steps },
      { beat: 'close', type: 'mistake', emotion: 'embarrassed', visual: 'fail', place: 'kitchen', line: '미리 섞어 둔 반죽은 이렇게 되니까요.', cardTitle: '미리 섞은 반죽' },
      { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: '섞는 때 하나로 바삭함이 달라져요. 이희재의 맛 연구소였어요.' },
    ],
  };
  const c = finalizeStory(kimchi, draft, 'one-fix');
  if (!('script' in c)) throw new Error(c.error);
  return c.script;
};
const timeline = (s: Script) => buildTimeline(s, s.scenes.map(() => null));
/** 실패작이 나오는 장면 (실패 연출이거나 실수 장면, 클로즈업 제외) */
const failFrames = (s: Script) => {
  const t = timeline(s);
  return Array.from({ length: totalFrames(t) }, (_, f) => f).filter((f) => {
    const sc = sceneAt(s, t, f)!.scene;
    return sc.visual === 'fail' || (sc.type === 'mistake' && !sc.visual);
  });
};

describe('실패 장면: 맛조수는 실패작을 들지 않는다', () => {
  // one-fix 이야기 대본, 실패 연출 대본(코미디·문제 해결), 실수 장면이 있는 템플릿(김치전 코미디형)
  const scripts = [oneFix(), buildStyledScript(kimchi, { style: 'comedy' }).script, buildStyledScript(kimchi, { style: 'problem' }).script, generateTemplateScript(kimchi)];

  it('실패 접시는 맛조수 옆 조리대 위에 따로 있고, 맛조수는 빈손으로 차분한(궁금한) 표정이다', () => {
    let checked = 0;
    for (const s of scripts) {
      const t = timeline(s);
      for (const f of failFrames(s)) {
        const st = stageAt(s, t, f, 'pancake', 0)!;
        expect(st.plated).toBe('failed');
        expect(st.action, `${s.title} ${f}`).not.toBe('present');
        expect(st.plateAt).toEqual(FAIL_PLATE);
        // 대본 표정이 당황·실망이어도 화면의 맛조수는 궁금한 표정 (실패를 자기 탓으로 당황하지 않는다)
        expect(st.emotion).toBe('curious');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('실패 접시와 맛조수 얼굴이 한 화면에 함께 보이고, 위쪽 카드·아래 자막에 가리지 않는다', () => {
    for (const s of scripts) {
      const t = timeline(s);
      for (const f of failFrames(s)) {
        const st = stageAt(s, t, f, 'pancake', 0)!;
        const face = faceBox(st, 1080, 1920);
        expect(face, `${s.title} ${f}`).not.toBeNull();
        const bottom = faceSafeCaptionBottom(st, 1080, 1920);
        const plate = projectToScreen([FAIL_PLATE[0], FAIL_PLATE[1] + 0.04, FAIL_PLATE[2]], st.camera, 1080, 1920);
        expect(plate.visible).toBe(true);
        // 맛조수 오른쪽 위 (얼굴을 가리지 않음), 위쪽 카드 아래, 자막 위
        expect(plate.x).toBeGreaterThan(560);
        expect(plate.x).toBeLessThan(1000);
        expect(plate.y).toBeGreaterThan(650);
        expect(plate.y).toBeLessThan(bottom - CAPTION_HEIGHT);
      }
    }
  });

  it('실패 클로즈업은 예전처럼 조리대의 접시만 비추고, 완성 음식은 엔딩에서 그대로 들고 보여 준다', () => {
    const s = buildStyledScript(kimchi, { style: 'problem' }).script;
    const closeup: Script = { ...s, scenes: s.scenes.map((sc, i) => (i === 0 ? { ...sc, visual: 'fail-closeup' as const } : sc)) };
    const t = timeline(closeup);
    const st = stageAt(closeup, t, 20, 'pancake', 0)!;
    expect(st).toMatchObject({ plated: 'failed', action: 'idle', emotion: 'curious' });
    expect(st.plateAt).toBeUndefined();
    const outro = closeup.scenes.length - 1;
    expect(stageAt(closeup, t, t[outro]!.from + 10, 'pancake', 0)).toMatchObject({ plated: 'done', action: 'present' });
  });

  it('실패 장면에는 개그 효과음이 없고(첫 장면이면 훅 소리만), "설명용 연출" 표시는 그대로다', () => {
    const s = oneFix();
    const t = timeline(s);
    expect(sfxCues(s).filter((c) => c.sceneId === s.scenes[0]!.id).map((c) => c.name)).toEqual(['whoosh']);
    expect(sfxCues(s).some((c) => c.sceneId === s.scenes[5]!.id)).toBe(false);
    frame = t[5]!.from + 20;
    const html = renderToStaticMarkup(React.createElement(KitchenVideo, { script: s, timings: t, reviewed: false, cleanDraft: true, recipe: kimchi } satisfies VideoProps));
    expect(html).toContain('설명용 연출');
  });
});
