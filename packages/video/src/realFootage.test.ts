import { describe, expect, it } from 'vitest';
import type { Scene, Script } from '@mat-lab/recipe-core';
import { CAPTION_SAFE_BOTTOM, VIDEO } from './theme.ts';
import { CAPTION_HEIGHT, CARDS_BOTTOM } from './three/captionPlacement.ts';
import { OPENING_HEAD_START, OPENING_PUSH_FRAMES, openingPush, stageAt } from './three/stage.ts';
import {
  MIN_PLAYBACK_RATE,
  badgeOpacity,
  cardHeadline,
  clipLayers,
  clipPlayback,
  kenBurns,
  layerAt,
  narratorBox,
  openingCardVisible,
  photoLayers,
  repeatsLine,
} from './realFootage.ts';
import type { SceneTiming } from './timeline.ts';

const scene = (id: string, type: Scene['type'], line: string, extra: Partial<Scene> = {}): Scene => ({ id, type, emotion: 'joy', line, ...extra });
const script: Script = {
  title: '김치전 눅눅함',
  scenes: [
    scene('s1', 'question', '김치전, 왜 금방 눅눅해질까요?', { hook: true }),
    scene('s2', 'mistake', '반죽을 미리 만들어 뒀더니 다 눅눅해졌어요!'),
    scene('s3', 'explain', '김치 속 소금이 반죽의 물을 끌어내요.', { cardItems: ['김치 속 소금이 반죽의 수분을 계속 끌어냅니다.'] }),
    scene('s4', 'steps', '부치기 직전에 섞어서 얇게 부쳐요.', { cardItems: ['부치기 직전에 섞는다.'] }),
    scene('s5', 'tip', '다 부친 전은 겹치지 마세요!', { visual: 'result' }),
    scene('s6', 'outro', '오늘도 맛있게!'),
  ],
};
const timings: SceneTiming[] = script.scenes.map((s, i) => ({ sceneId: s.id, from: i * 90, durationInFrames: 90, speechFrames: 70 }));

describe('실제 촬영 영상이 덮는 구간', () => {
  it('묶음 첫 장면에 올리면 묶음 전체, 다른 장면에 따로 올리면 그 앞에서 멈춘다', () => {
    const layers = clipLayers(script, timings, { s1: { url: 'a.mp4', kind: 'video', sound: true } });
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ key: 's1', from: 0 });
    expect(layers[0]!.duration).toBeGreaterThanOrEqual(90);
    expect(layerAt(layers, 0)?.key).toBe('s1');
    expect(layerAt(layers, layers[0]!.duration)).toBeUndefined();
  });

  it('완성 사진은 첫 장면(훅)과 "완성 음식 먼저" 장면에 화면 가득, 촬영 영상이 있으면 영상이 우선', () => {
    expect(photoLayers(script, timings, undefined, [])).toEqual([]);
    const photos = photoLayers(script, timings, 'p.jpg', []);
    expect(photos.map((p) => [p.sceneId, p.opening])).toEqual([
      ['s1', true],
      ['s5', false],
    ]);
    expect(photos[0]!.from).toBe(0);
    const clips = clipLayers(script, timings, { s1: { url: 'a.mp4', kind: 'video' } });
    expect(photoLayers(script, timings, 'p.jpg', clips).map((p) => p.sceneId)).toEqual(['s5']);
  });

  it('짧은 촬영 영상은 천천히 틀고(최대 0.6배), 그래도 모자라면 반복한다. 길이를 모르면 그대로', () => {
    expect(clipPlayback(undefined, 240)).toEqual({ playbackRate: 1, loopFrames: null });
    expect(clipPlayback(9, 240)).toEqual({ playbackRate: 1, loopFrames: null });
    const slow = clipPlayback(6, 240);
    expect(slow.playbackRate).toBeCloseTo(0.75, 2);
    expect(slow.loopFrames).toBeNull();
    const loop = clipPlayback(3, 240);
    expect(loop.playbackRate).toBe(MIN_PLAYBACK_RATE);
    expect(loop.loopFrames).toBe(150);
  });

  it('천천히 다가가는 확대는 1배에서 시작해 조금만 커진다', () => {
    expect(kenBurns(0, 100, 'video')).toBe(1);
    expect(kenBurns(100, 100, 'video')).toBeCloseTo(1.05);
    expect(kenBurns(100, 100, 'image')).toBeCloseTo(1.08);
    expect(kenBurns(50, 100, 'image')).toBeGreaterThan(kenBurns(10, 100, 'image'));
  });
});

describe('맛조수 작은 원 자리 (실제 영상 위)', () => {
  const box = narratorBox();
  const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const me = { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };

  it('앱 UI가 가리는 곳(위 220px·아래 420px·오른쪽 버튼 줄) 밖, 왼쪽 아래', () => {
    expect(me.top).toBeGreaterThanOrEqual(220);
    expect(me.bottom).toBeLessThanOrEqual(VIDEO.height - 420);
    expect(me.left).toBeGreaterThanOrEqual(24);
    expect(me.right).toBeLessThan(VIDEO.width / 2);
    expect(me.top).toBeGreaterThan(VIDEO.height / 2);
  });

  it('자막 자리와 위쪽 카드 자리를 가리지 않는다', () => {
    // 자막은 가운데 900px 폭, CAPTION_SAFE_BOTTOM 위 CAPTION_HEIGHT 안 (Captions.tsx)
    const caption = { left: 90, right: 990, top: CAPTION_SAFE_BOTTOM - CAPTION_HEIGHT, bottom: CAPTION_SAFE_BOTTOM };
    expect(overlaps(me, caption)).toBe(false);
    expect(me.top).toBeGreaterThan(CARDS_BOTTOM);
    // '실제 완성 사진'·'설명용 연출' 이름표(오른쪽)와도 겹치지 않는다
    expect(overlaps(me, { left: VIDEO.width - 340, right: VIDEO.width - 40, top: 860, bottom: 920 })).toBe(false);
  });
});

describe('첫 2초', () => {
  it('훅 장면 위 카드가 자막과 같은 문장이면 띄우지 않는다 (같은 문장 두 번 금지)', () => {
    const hook = script.scenes[0]!;
    expect(cardHeadline(hook, script.title)).toBe(hook.line);
    expect(openingCardVisible(hook, script.title, false)).toBe(false);
    // 실제 사진·영상으로 시작하면 카드 없이 음식과 큰 자막만
    const intro = scene('i', 'intro', '오늘의 실험 시작해 볼게요!', { cardTitle: '바삭한 김치전' });
    expect(openingCardVisible(intro, script.title, false)).toBe(true);
    expect(openingCardVisible(intro, script.title, true)).toBe(false);
  });

  it('문장 비교: 같은 말·포함·거의 같은 말은 반복으로 본다', () => {
    expect(repeatsLine('김치전, 왜 금방 눅눅해질까?', '김치전 왜 금방 눅눅해질까요?')).toBe(true);
    expect(repeatsLine('바삭한 김치전', '오늘은 바삭한 김치전을 만들어요')).toBe(true);
    expect(repeatsLine('바삭한 김치전', '반죽은 부치기 직전에 섞어요')).toBe(false);
    expect(repeatsLine('', '아무 말')).toBe(false);
  });

  it('첫 장면 동안에는 로고(브랜드 배지)를 띄우지 않는다', () => {
    expect(badgeOpacity(0, 90)).toBe(0);
    expect(badgeOpacity(89, 90)).toBe(0);
    expect(badgeOpacity(120, 90)).toBe(1);
  });

  it('3D로 시작해도 0프레임부터 움직이는 중이다 (멈춘 접시 화면 없음)', () => {
    const a = stageAt(script, timings, 0, 'pancake', 3)!;
    const b = stageAt(script, timings, 2, 'pancake', 3)!;
    // 카메라가 이미 움직이고, 맛조수도 이미 화면에 있다
    const moved = Math.hypot(...a.camera.pos.map((v, i) => v - b.camera.pos[i]!)) + Math.hypot(...a.camera.target.map((v, i) => v - b.camera.target[i]!));
    expect(moved).toBeGreaterThan(0.05);
    expect(a.chefPop).toBeGreaterThan(0.5);
    expect(OPENING_HEAD_START).toBeGreaterThan(0);
    // 처음이 가장 빠르게 다가오고, 곧 원래 구도로 멈춘다
    expect(openingPush(0)).toBeGreaterThan(openingPush(5));
    expect(openingPush(0) - openingPush(5)).toBeGreaterThan(openingPush(20) - openingPush(25));
    expect(openingPush(OPENING_PUSH_FRAMES)).toBe(1);
    // 다른 장면은 그대로 (장면 처음에 맛조수가 이미 있음)
    expect(stageAt(script, timings, 90, 'pancake', 3)!.chefPop).toBe(1);
  });
});
