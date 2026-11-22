import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAND, SAMPLE_RECIPES, STYLE_IDS, buildStyledScript, contentCandidates, finalizeStory, formatIngredient, generateTemplateScript, type Scene, type Script, type StoryDraft } from '@mat-lab/recipe-core';
import { CAPTION_SAFE_BOTTOM } from './theme.ts';
import { FPS, buildTimeline, totalFrames, type SceneTiming, type VideoProps } from './timeline.ts';
import { CAPTION_HEIGHT, CARDS_BOTTOM, faceBox, faceSafeCaptionBottom } from './three/captionPlacement.ts';
import { CHEF_POS, chefFacing } from './three/layout.ts';
import { projectToScreen, stageAt } from './three/stage.ts';
import { clipLayers, layerAt } from './realFootage.ts';
import { sfxCues } from './sfx.ts';
import {
  GOGGLE_FRAMES,
  GOGGLE_LEAD,
  INSIGHT_FRAMES,
  PAGE_TURN_OFFSET,
  PAGE_TURN_VOLUME,
  goggleSceneIndex,
  goggleStart,
  gogglePose,
  insightFrames,
  noteCardScenes,
  pageTurnCues,
  showsNoteCard,
} from './hostCues.ts';

/**
 * 맛조수 고정 신호 (persona-2026-11.md 7절): 노트 카드마다 노트 넘기는 소리, 영상마다 한 번 고글 동작.
 * 화면 구성은 3D를 그리지 않는 가짜 캔버스로 확인한다 (compare.test.ts와 같은 방법).
 */
let frame = 0;
vi.mock('./fonts.ts', () => ({ ensureFonts: () => Promise.resolve() }));
vi.mock('./three/KitchenScene.tsx', async (orig) => ({
  ...(await orig<typeof import('./three/KitchenScene.tsx')>()),
  KitchenScene: (p: { state: { goggles?: { down: number } } }) => React.createElement('canvas', { 'data-goggles': p.state.goggles ? p.state.goggles.down.toFixed(2) : 'none' }),
}));
vi.mock('remotion', async (orig) => {
  const real = await orig<typeof import('remotion')>();
  const Seq: React.FC<{ children?: React.ReactNode; from?: number; name?: string }> = ({ children, from, name }) => React.createElement('section', { 'data-name': name, 'data-from': from }, children);
  return {
    ...real,
    useCurrentFrame: () => frame,
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30, durationInFrames: 900, id: 'ShortVideo', defaultProps: {}, props: {} }),
    Sequence: Seq,
    Audio: (p: { src: string; volume?: number }) => React.createElement('audio', { 'data-page': p.src.startsWith('data:audio/wav') && p.src === pageSrc ? 'yes' : 'no', 'data-volume': typeof p.volume === 'number' ? p.volume : 'fn' }),
    OffthreadVideo: () => null,
    Img: () => null,
  };
});
const { sfxUrl } = await import('./sfx.ts');
const pageSrc = sfxUrl('page');
const { KitchenVideo } = await import('./compositions/KitchenVideo.tsx');

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const timeline = (s: Script) => buildTimeline(s, s.scenes.map(() => null));
const scene = (over: Partial<Scene>): Scene => ({ id: 'x', type: 'explain', emotion: 'curious', line: '끓는 물에 데치면 떫은맛이 줄어요.', cardTitle: BRAND.notePhrase, cardItems: [walnut.principle], ...over });

/** 실제 제작 기본 길(이야기 대본)과 같은 모양: 원리 장면이 노트 카드 (story.test.ts 견본) */
const storyScript = (): Script => {
  const draft: StoryDraft = {
    title: '호두정과, 왜 굳이 데칠까',
    storyType: 'why',
    audience: 'hobby-learner',
    logline: '데치기 한 단계가 떫은맛을 잡는 이유',
    scenes: [
      { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'sizzle', place: 'kitchen', line: '호두정과, 왜 굳이 데칠까요?' },
      { beat: 'context', type: 'question', emotion: 'curious', place: 'pantry', line: '바로 조리면 편할 텐데, 정석은 데치기부터 시작해요.' },
      { beat: 'point', type: 'explain', emotion: 'curious', place: 'lab', line: '끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어든대요.', cardTitle: BRAND.notePhrase, cardItems: [walnut.principle] },
      { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'market', line: '호두 500g에 설탕, 물엿, 꿀을 준비해요.', cardTitle: '재료', cardItems: walnut.ingredients.map(formatIngredient) },
      { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '데치고, 말리고, 조리고, 140도 정도에서 튀겨요.', cardItems: walnut.steps.slice(0, 5) },
      { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: '떫은맛은 데치는 단계에서 잡혀요. 이희재의 맛 연구소였어요.' },
    ],
  };
  const c = finalizeStory(walnut, draft, 'host-cues');
  if (!('script' in c)) throw new Error(c.error);
  return c.script;
};

/** 고글 동작이 있는 프레임들 (영상 전체) */
const goggleFrames = (s: Script, t: SceneTiming[], realScenes?: ReadonlySet<string>) =>
  Array.from({ length: totalFrames(t) }, (_, f) => f).filter((f) => stageAt(s, t, f, 'generic', 0, 'main', { realScenes })?.goggles);

describe('노트 카드가 뜨는 장면', () => {
  it('원리(explain) 장면의 "이희재 연구자의 조리 노트" 카드만 노트 카드다 (비교·서명·다른 카드 제목은 아님)', () => {
    expect(showsNoteCard(scene({}), false, 't', false)).toBe(true);
    // 카드 제목이 비면 화면은 노트 제목을 쓴다 (SceneCard)
    expect(showsNoteCard(scene({ cardTitle: undefined }), false, 't', false)).toBe(true);
    expect(showsNoteCard(scene({ cardTitle: '호두정과 비교' }), false, 't', false)).toBe(false);
    expect(showsNoteCard(scene({ visual: 'compare' }), false, 't', false)).toBe(false);
    expect(showsNoteCard(scene({ visual: 'signature' }), false, 't', false)).toBe(false);
    expect(showsNoteCard(scene({ type: 'tip', cardTitle: BRAND.tipPhrase }), false, 't', false)).toBe(false);
    // 첫 장면: 카드가 대사와 같은 문장이거나 실제 사진·영상으로 시작하면 카드를 띄우지 않는다
    expect(showsNoteCard(scene({ line: walnut.principle }), true, 't', false)).toBe(false);
    expect(showsNoteCard(scene({ line: '데치는 이유가 있어요.' }), true, 't', true)).toBe(false);
    expect(showsNoteCard(scene({ line: '데치는 이유가 있어요.' }), true, 't', false)).toBe(true);
  });
});

describe('노트 넘기는 소리', () => {
  it('노트 카드가 뜨는 장면마다 하나, 장면 시작 0.2초 앞에서 시작한다 (카드가 나타날 때 "탁")', () => {
    const comedy = buildStyledScript(walnut, { style: 'comedy' }).script;
    const notes = noteCardScenes(comedy);
    expect(notes).toEqual([2, 3]);
    expect(pageTurnCues(comedy)).toEqual(notes.map((i) => ({ sceneId: comedy.scenes[i]!.id, offset: PAGE_TURN_OFFSET })));
    expect(PAGE_TURN_OFFSET).toBe(-6);
    // 소리 속 '탁'(0.255초)이 장면 시작 뒤 0~3프레임 (노트 카드가 나타나는 때)
    const tak = PAGE_TURN_OFFSET + 0.255 * FPS;
    expect(tak).toBeGreaterThan(0);
    expect(tak).toBeLessThan(3);
    // 목소리보다 작게: 연출 효과음(0.32)보다 작은 크기
    expect(PAGE_TURN_VOLUME).toBeLessThan(0.32);
  });

  it('노트 카드가 없는 대본(완성 먼저·식감)은 소리가 없다', () => {
    for (const style of ['before-after', 'sensory'] as const) expect(pageTurnCues(buildStyledScript(walnut, { style }).script), style).toEqual([]);
  });

  it('연출 효과음이 이미 있는 장면에는 겹치지 않고, 노트 카드가 안 뜨는 첫 장면(실제 사진)에는 없다', () => {
    const base = buildStyledScript(walnut, { style: 'story' }).script;
    const note = noteCardScenes(base)[0]!;
    // 노트 장면에 '완성 먼저' 연출(효과음 ding)이 붙은 경우
    const reveal: Script = { ...base, scenes: base.scenes.map((s, i) => (i === note ? { ...s, visual: 'result' as const } : s)) };
    expect(sfxCues(reveal).some((c) => c.sceneId === reveal.scenes[note]!.id)).toBe(true);
    expect(pageTurnCues(reveal)).toEqual([]);
    // 첫 장면이 노트 카드: 3D로 시작하면 소리, 실제 사진으로 시작하면 카드가 없으니 소리도 없다
    const opening: Script = { ...base, scenes: [scene({ id: 'o', line: '데치는 이유가 있어요.' }), ...base.scenes.slice(1)] };
    expect(pageTurnCues(opening).map((c) => c.sceneId)).toContain('o');
    expect(pageTurnCues(opening, new Set(['o'])).map((c) => c.sceneId)).not.toContain('o');
  });
});

describe('고글 동작: 언제 하나', () => {
  it('첫 노트 카드 장면에서 카드가 자리 잡은 뒤(6프레임) 시작한다', () => {
    const s = storyScript();
    const t = timeline(s);
    expect(goggleSceneIndex(s)).toBe(2);
    expect(goggleStart(s, t)).toBe(t[2]!.from + GOGGLE_LEAD);
    expect(GOGGLE_LEAD).toBe(6);
  });

  it('영상마다 한 번만: 노트 장면이 둘이어도 첫 장면에서 26프레임(약 0.87초) 동안만', () => {
    for (const style of ['comedy', 'experiment'] as const) {
      const s = buildStyledScript(walnut, { style }).script;
      const t = timeline(s);
      expect(noteCardScenes(s).length, style).toBe(2);
      const start = goggleStart(s, t)!;
      const frames = goggleFrames(s, t);
      expect(frames, style).toEqual(Array.from({ length: GOGGLE_FRAMES }, (_, k) => start + k));
      expect(start).toBe(t[noteCardScenes(s)[0]!]!.from + GOGGLE_LEAD);
    }
    // 0.6~1.0초 (휴대폰에서 읽히고 늘어지지 않게)
    expect(GOGGLE_FRAMES / FPS).toBeGreaterThanOrEqual(0.6);
    expect(GOGGLE_FRAMES / FPS).toBeLessThanOrEqual(1.0);
  });

  it('노트 카드 장면이 없으면 하지 않는다', () => {
    for (const style of ['before-after', 'sensory'] as const) {
      const s = buildStyledScript(walnut, { style }).script;
      const t = timeline(s);
      expect(goggleSceneIndex(s), style).toBe(-1);
      expect(goggleStart(s, t), style).toBeNull();
      expect(goggleFrames(s, t), style).toEqual([]);
    }
  });

  it('첫 장면(훅)의 노트 카드에서는 하지 않고 다음 노트 장면으로, 없으면 하지 않는다', () => {
    const base = storyScript();
    const both: Script = { ...base, scenes: [scene({ id: 'o', line: '데치는 이유가 있어요.' }), ...base.scenes.slice(1)] };
    expect(goggleSceneIndex(both)).toBe(2);
    const onlyOpening: Script = { ...base, scenes: [scene({ id: 'o', line: '데치는 이유가 있어요.' }), ...base.scenes.slice(1).filter((s) => s.type !== 'explain')] };
    expect(goggleSceneIndex(onlyOpening)).toBe(-1);
    expect(goggleStart(onlyOpening, timeline(onlyOpening))).toBeNull();
  });

  it('맛조수가 화면에 없는 경우(실제 촬영 영상·사진이 노트 장면을 덮음): 다음 노트 장면에서, 없으면 건너뛴다 (노트 장면 아닌 곳으로 미루지 않음)', () => {
    const s = buildStyledScript(walnut, { style: 'comedy' }).script;
    const t = timeline(s);
    const [first, second] = noteCardScenes(s) as [number, number];
    const covered = new Set([s.scenes[first]!.id]);
    expect(goggleSceneIndex(s, covered)).toBe(second);
    expect(goggleStart(s, t, covered)).toBe(t[second]!.from + GOGGLE_LEAD);
    expect(goggleFrames(s, t, covered)).toHaveLength(GOGGLE_FRAMES);
    const all = new Set([s.scenes[first]!.id, s.scenes[second]!.id]);
    expect(goggleStart(s, t, all)).toBeNull();
    expect(goggleFrames(s, t, all)).toEqual([]);
    // 이야기 대본(노트 장면 하나)이 덮이면 그 영상은 고글 없음
    const story = storyScript();
    expect(goggleStart(story, timeline(story), new Set([story.scenes[2]!.id]))).toBeNull();
  });

  it('장면이 동작보다 짧으면(정상 타임라인에는 없음: 최소 1.8초) 하지 않는다', () => {
    const s = storyScript();
    const t = timeline(s).map((x, i) => (i === 2 ? { ...x, durationInFrames: GOGGLE_LEAD + GOGGLE_FRAMES - 1 } : x));
    expect(goggleStart(s, t)).toBeNull();
  });
});

describe('고글 동작: 모양 (고정된 한 가지)', () => {
  it('내리기(0~8) → 눈앞에서 들여다보기(8~15) → 올리기(15~21) → 모자 위에서 튕기며 통통(21~26)', () => {
    expect(gogglePose(-1)).toBeUndefined();
    expect(gogglePose(GOGGLE_FRAMES)).toBeUndefined();
    expect(gogglePose(0)!.down).toBe(0);
    for (let t = 8; t < 15; t++) expect(gogglePose(t)).toMatchObject({ down: 1, hand: 1 });
    expect(gogglePose(10)!.peer).toBe(1);
    expect(gogglePose(10)!.lean).toBe(1);
    expect(gogglePose(18)!.hand).toBeCloseTo(1.3);
    expect(gogglePose(21)!.down).toBeCloseTo(0);
    expect(gogglePose(23)!.pop).toBeGreaterThan(0.5);
    // 마지막 프레임은 평소 모습과 같다 (다음 프레임에 뚝 바뀌지 않게)
    const last = gogglePose(GOGGLE_FRAMES - 1)!;
    for (const k of ['down', 'hand', 'lean', 'peer', 'pop'] as const) expect(last[k], k).toBeCloseTo(0);
  });

  it('튀는 프레임 없이 이어진다 (한 프레임에 갈 길의 30% 안, 넘침은 5% 안, 튕김은 10% 안)', () => {
    const poses = Array.from({ length: GOGGLE_FRAMES }, (_, t) => gogglePose(t)!);
    for (let t = 1; t < poses.length; t++) {
      expect(Math.abs(poses[t]!.down - poses[t - 1]!.down), `down ${t}`).toBeLessThan(0.3);
      expect(Math.abs(poses[t]!.hand - poses[t - 1]!.hand), `hand ${t}`).toBeLessThan(0.33);
    }
    expect(Math.max(...poses.map((p) => p.down))).toBeLessThan(1.05);
    expect(Math.min(...poses.map((p) => p.down))).toBeGreaterThanOrEqual(-0.1);
    // 동작 처음도 평소 모습에서 시작한다
    expect(poses[0]).toMatchObject({ down: 0, hand: 0, lean: 0, peer: 0, pop: 0 });
  });
});

describe('고글 동작 화면: 맛조수가 보이고 카드·자막에 가리지 않는다', () => {
  const scripts = [storyScript(), ...SAMPLE_RECIPES.flatMap((r) => [generateTemplateScript(r), ...STYLE_IDS.map((style) => buildStyledScript(r, { style }).script)])];

  it('모든 샘플 대본: 동작 내내 얼굴을 비추고, 모자 위 고글·눈앞 고글이 노트 카드 아래·자막 위에 있다', () => {
    let checked = 0;
    for (const s of scripts) {
      const t = timeline(s);
      const start = goggleStart(s, t);
      if (start === null) continue;
      for (let f = start; f < start + GOGGLE_FRAMES; f++) {
        const st = stageAt(s, t, f, 'generic', 0)!;
        expect(st.face).toBe('camera');
        expect(st.goggles).toBeDefined();
        const facing = chefFacing(st);
        const at = (y: number, z: number) => projectToScreen([CHEF_POS[0] + Math.sin(facing) * z, CHEF_POS[1] + y, CHEF_POS[2] + Math.cos(facing) * z], st.camera, 1080, 1920);
        const bottom = faceSafeCaptionBottom(st, 1080, 1920);
        // 자막은 맨 아래 기본 자리 (얼굴 위로 올라가 모자·고글을 가리지 않는다)
        expect(bottom).toBe(CAPTION_SAFE_BOTTOM);
        const face = faceBox(st, 1080, 1920)!;
        expect(face.top).toBeGreaterThan(CARDS_BOTTOM);
        expect(face.bottom).toBeLessThan(CAPTION_SAFE_BOTTOM - CAPTION_HEIGHT + 12);
        for (const [name, y, z] of [
          ['모자 위 고글', 0.672, 0.178],
          ['눈앞 고글', 0.41, 0.3],
        ] as const) {
          const p = at(y, z);
          expect(p.visible, name).toBe(true);
          expect(p.y, `${s.title} ${name} frame ${f}`).toBeGreaterThan(CARDS_BOTTOM);
          expect(p.y, name).toBeLessThan(CAPTION_SAFE_BOTTOM - CAPTION_HEIGHT);
          expect(p.x, name).toBeGreaterThan(200);
          expect(p.x, name).toBeLessThan(880);
        }
        // 휴대폰에서 읽히는 크기: 눈앞 고글 너비(약 0.31m)가 화면 너비의 30% 넘게
        expect(Math.abs(at(0.41, 0.3).y - at(1.41, 0.3).y) * 0.31).toBeGreaterThan(1080 * 0.3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(GOGGLE_FRAMES * 20);
  });

  it('맛조수 화면은 장면 첫머리(약 1.3초)만이고, 그 뒤는 장면 본래 화면으로 돌아간다', () => {
    const s = storyScript();
    const t = timeline(s)[2]!;
    expect(insightFrames(t.durationInFrames)).toBe(INSIGHT_FRAMES);
    expect(insightFrames(INSIGHT_FRAMES + 10)).toBe(INSIGHT_FRAMES + 10);
    const inside = stageAt(s, timeline(s), t.from + INSIGHT_FRAMES - 1, 'generic', 0)!;
    const after = stageAt(s, timeline(s), t.from + INSIGHT_FRAMES + 1, 'generic', 0)!;
    expect(inside.face).toBe('camera');
    expect(after.camera.pos).not.toEqual(inside.camera.pos);
    // 비교 장면의 위쪽 화면(건너뛴 쪽)에는 고글 동작이 없다
    expect(stageAt(s, timeline(s), goggleStart(s, timeline(s))! + 5, 'generic', 0, 'compare-fail')!.goggles).toBeUndefined();
  });

  it('후보 대본(규칙 엔진 5개씩)도 노트 장면이 있으면 모두 고글 동작이 들어간다', () => {
    for (const r of SAMPLE_RECIPES) {
      for (const c of contentCandidates(r, { count: 5 }).candidates) {
        const s = c.script;
        expect(goggleStart(s, timeline(s)) !== null, `${r.dishName} ${c.key}`).toBe(noteCardScenes(s).some((i) => i > 0));
      }
    }
  });
});

describe('영상에 실제로 들어가는지 (KitchenVideo)', () => {
  const render = (props: VideoProps, f: number) => {
    frame = f;
    return renderToStaticMarkup(React.createElement(KitchenVideo, props));
  };
  const pageStarts = (html: string) => [...html.matchAll(/<section data-name="sfx page" data-from="(-?\d+)"><audio data-page="yes" data-volume="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const goggles = (html: string) => /data-goggles="([^"]+)"/.exec(html)![1];

  it('노트 카드가 뜨는 장면마다 노트 소리가 그 자리·크기로 들어가고, 화면의 노트 카드와 같은 장면이다', () => {
    const s = buildStyledScript(walnut, { style: 'comedy' }).script;
    const t = timeline(s);
    const props: VideoProps = { script: s, timings: t, reviewed: false, cleanDraft: true, recipe: walnut };
    const html = render(props, 0);
    expect(pageStarts(html)).toEqual(noteCardScenes(s).map((i) => [t[i]!.from + PAGE_TURN_OFFSET, PAGE_TURN_VOLUME]));
    // 화면에 노트 카드 라벨(📒)이 그려지는 장면 = 노트 소리가 나는 장면 (가짜 Sequence는 모든 장면을 한꺼번에 그리므로 장면 칸마다 본다)
    const sections = [...html.matchAll(/<section data-name="(\S+) \w+" data-from="-?\d+">(.*?)<\/section>/gs)];
    const shown = sections.filter((m) => m[2]!.includes(`📒 ${BRAND.notePhrase}`)).map((m) => s.scenes.findIndex((x) => x.id === m[1]));
    expect(shown).toEqual(noteCardScenes(s));
  });

  it('맛조수에게 고글 동작이 그 프레임에만 전달된다', () => {
    const s = storyScript();
    const t = timeline(s);
    const props: VideoProps = { script: s, timings: t, reviewed: false, cleanDraft: true, recipe: walnut };
    const start = goggleStart(s, t)!;
    expect(goggles(render(props, start - 1))).toBe('none');
    expect(goggles(render(props, start + 10))).toBe('1.00');
    expect(goggles(render(props, start + GOGGLE_FRAMES))).toBe('none');
  });

  it('노트 장면을 실제 촬영 영상이 덮으면 그 장면에서는 고글 동작을 하지 않는다 (노트 소리는 카드와 함께 그대로)', () => {
    const s = buildStyledScript(walnut, { style: 'comedy' }).script;
    const t = timeline(s);
    const [first, second] = noteCardScenes(s) as [number, number];
    const sceneMedia = { [s.scenes[first]!.id]: { url: 'https://example.com/clip.mp4', kind: 'video' as const } };
    const props: VideoProps = { script: s, timings: t, reviewed: false, cleanDraft: true, recipe: walnut, sceneMedia };
    // 영상이 덮는 장면 (KitchenVideo와 같은 계산): 이 대본은 노트 장면 하나만 덮는다
    const clips = clipLayers(s, t, sceneMedia);
    expect(t.filter((x) => layerAt(clips, x.from)).map((x) => x.sceneId)).toEqual([s.scenes[first]!.id]);
    const html = render(props, t[first]!.from + GOGGLE_LEAD + 10);
    expect(goggles(html)).toBe('none');
    expect(pageStarts(html)).toEqual([first, second].map((i) => [t[i]!.from + PAGE_TURN_OFFSET, PAGE_TURN_VOLUME]));
    // 덮이지 않은 다음 노트 장면에서 한다
    expect(goggles(render(props, t[second]!.from + GOGGLE_LEAD + 10))).toBe('1.00');
  });
});
