import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SAMPLE_RECIPES, buildStyledScript, type Script } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from './timeline.ts';

/**
 * 비교 장면(위·아래 두 화면)은 WebGL 캔버스를 하나만 쓴다.
 * 캔버스를 둘 만들거나 장면이 바뀔 때마다 새로 만들면 아이폰 사파리가 멈춘다 (예전에 겪은 문제와 같은 모양).
 * 3D 장면은 브라우저에서만 그릴 수 있어 캔버스 자리를 기록하는 가짜 컴포넌트로 바꿔 센다.
 */
let frame = 0;
vi.mock('./fonts.ts', () => ({ ensureFonts: () => Promise.resolve() }));
vi.mock('./three/KitchenScene.tsx', () => ({
  KitchenScene: (p: { split?: unknown }) => React.createElement('canvas', { 'data-split': p.split ? 'yes' : 'no' }),
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

const { KitchenVideo } = await import('./compositions/KitchenVideo.tsx');

describe('비교 장면 캔버스', () => {
  const recipe = SAMPLE_RECIPES.find((r) => buildStyledScript(r, { style: 'before-after' }).script.scenes.some((s) => s.visual === 'compare'))!;
  const script: Script = buildStyledScript(recipe, { style: 'before-after' }).script;
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const props: VideoProps & { recipe: typeof recipe } = { script, timings, reviewed: false, cleanDraft: true, recipe };
  const canvases = (f: number) => {
    frame = f;
    return [...renderToStaticMarkup(React.createElement(KitchenVideo, props)).matchAll(/<canvas data-split="(\w+)"/g)].map((m) => m[1]);
  };

  it('비교 장면에서도 캔버스는 하나이고, 위쪽 화면은 같은 캔버스 안에 그린다', () => {
    const i = script.scenes.findIndex((s) => s.visual === 'compare');
    expect(i).toBeGreaterThanOrEqual(0);
    const t = timings[i]!;
    expect(canvases(t.from + 5)).toEqual(['yes']);
    const other = timings[i === 0 ? 1 : 0]!;
    expect(canvases(other.from + 5)).toEqual(['no']);
  });
});
