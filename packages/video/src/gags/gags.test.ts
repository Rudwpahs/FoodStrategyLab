import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FOOD_KINDS, GAGS, SAMPLE_RECIPES, foodProfile, type Script } from '@mat-lab/recipe-core';
import { GagScene } from './GagScene.tsx';
import { SWING_MAX_DEG, coasterX, coasterY, deadpanEmotion, lift, progressOf, swingAngle } from './gagMotion.ts';
import { placeTransitionAt } from '../three/places.ts';
import { shotForScene } from '../three/shots.ts';
import { sfxCues } from '../sfx.ts';
import { buildTimeline } from '../timeline.ts';
import { noteCardScenes } from '../hostCues.ts';
import { cardHeadline } from '../realFootage.ts';

const kimchi = foodProfile(SAMPLE_RECIPES[0]!);

const deadpan: Script = {
  title: '눅눅한 김치전, 사막으로 가야 할까',
  style: 'ai-story',
  hookType: 'deadpan',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'curious', line: '김치전이 금방 눅눅해지셨나요?', place: 'dining', hook: true },
    { id: 's2', type: 'gag', emotion: 'confident', line: '사막 한가운데로 이사해 주세요.', place: 'dining', gag: 'desert' },
    { id: 's3', type: 'gag', emotion: 'surprised', line: '그래도 안 되면 달로 가져가세요.', place: 'dining' },
    { id: 's4', type: 'question', emotion: 'confident', line: '여기까지는 농담이에요.', place: 'dining' },
    { id: 's5', type: 'explain', emotion: 'confident', line: '소금이 수분을 끌어내요.', place: 'lab', cardTitle: '이희재 연구자의 조리 노트', cardItems: ['x'] },
    { id: 's6', type: 'outro', emotion: 'joy', line: '이희재의 맛 연구소였어요.', place: 'dining' },
  ],
};

describe('농담 그림 (2D)', () => {
  it('그림 14가지 모두 요리 종류마다 오류 없이 그려지고, 숫자·NaN이 없다 (분량처럼 보이는 글이 없게)', () => {
    for (const gag of GAGS) {
      for (const kind of FOOD_KINDS) {
        const food = { ...kimchi, kind };
        for (const frame of [0, 40, 119]) {
          const svg = renderToStaticMarkup(React.createElement(GagScene, { gag, frame, duration: 120, food, emotion: 'confident', talking: true, mouth: 0.5 }));
          expect(svg).not.toContain('NaN');
          const text = svg.replace(/<[^>]+>/g, ' ').trim();
          expect(text.replace(/Z/g, '').trim()).toBe('');
        }
      }
    }
  });

  it('맛조수는 농담 장면에서 끝까지 태연하다 (놀람·당황·실망 없이)', () => {
    expect(deadpanEmotion('surprised')).toBe('confident');
    expect(deadpanEmotion('embarrassed')).toBe('confident');
    expect(deadpanEmotion('disappointed')).toBe('confident');
    expect(deadpanEmotion('curious')).toBe('curious');
  });

  it('움직임: 그네는 정해진 폭 안에서 오가고, 크레인·로켓은 올라가고, 롤러코스터는 왼쪽에서 오른쪽으로 꼭대기를 지난다', () => {
    const angles = Array.from({ length: 150 }, (_, f) => swingAngle(f));
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(SWING_MAX_DEG);
    expect(Math.max(...angles)).toBeGreaterThan(SWING_MAX_DEG * 0.9);
    expect(lift(0)).toBe(0);
    expect(lift(1)).toBe(1);
    expect(coasterX(0)).toBeLessThan(0);
    expect(coasterX(1)).toBeGreaterThan(1080);
    const xs = Array.from({ length: 21 }, (_, i) => coasterX(i / 20));
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1]!)).toBe(true);
    expect(coasterY(420)).toBeLessThan(coasterY(0));
    expect(progressOf(10, 0)).toBe(1);
  });
});

describe('농담 장면과 영상 흐름', () => {
  const timings = buildTimeline(deadpan, deadpan.scenes.map(() => 2));

  it('농담 그림이 시작·바뀌·끝나는 경계에서 화면을 넘긴다 (장소가 같아도)', () => {
    for (const i of [1, 2, 3]) expect(placeTransitionAt(deadpan, timings, timings[i]!.from).amount).toBeGreaterThan(0.5);
  });

  it('농담 장면 뒤에 잠깐 쉰다 (그림을 볼 틈)', () => {
    const plain = { ...deadpan, scenes: deadpan.scenes.map((s) => (s.type === 'gag' ? { ...s, type: 'question' as const } : s)) };
    const before = buildTimeline(plain, plain.scenes.map(() => 2));
    expect(timings[1]!.durationInFrames).toBeGreaterThan(before[1]!.durationInFrames);
  });

  it('효과음은 첫 농담 그림에만 하나, 영상 전체 4개 이하', () => {
    const cues = sfxCues(deadpan);
    expect(cues.filter((c) => c.sceneId === 's2')).toHaveLength(1);
    expect(cues.some((c) => c.sceneId === 's3')).toBe(false);
    expect(cues.length).toBeLessThanOrEqual(4);
  });

  it('농담 장면에는 노트 카드·노트 소리·카드 글이 없다', () => {
    expect(noteCardScenes(deadpan)).toEqual([4]);
    expect(cardHeadline(deadpan.scenes[1]!, deadpan.title)).toBeNull();
  });

  it('3D 쪽은 농담 장면에 조용한 화면 하나 (불 없이)', () => {
    const shot = shotForScene(deadpan.scenes[1]!, 0, 0, 'dining');
    expect(shot.burnerOn).toBe(false);
    expect(shot.plated).toBe('none');
  });
});
