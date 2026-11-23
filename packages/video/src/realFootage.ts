import { clipGroups, isLetterTitle, lcsLength, type Scene, type Script } from '@mat-lab/recipe-core';
import { CAPTION_SAFE_BOTTOM, VIDEO } from './theme.ts';
import { CAPTION_HEIGHT } from './three/captionPlacement.ts';
import type { SceneTiming } from './timeline.ts';

/**
 * 실제 촬영 영상·사진을 주인공으로 (순수 함수: 화면 배치·시간 계산만).
 * 진짜 음식이 보이면 끝까지 보는 사람이 많다. 연구자가 찍은 영상이 있으면 그 구간은 3D 대신 영상이 화면을 꽉 채우고,
 * 맛조수는 왼쪽 아래 작은 원 안에서 이야기를 이어 간다 (시리즈 캐릭터는 그대로).
 */

/** 장면에 올린 영상·사진. sound: 촬영 소리를 작게 깔지 (휴대폰 영상만. 생성 AI 클립은 대사가 섞여 있을 수 있어 끈다) */
export interface SceneMediaItem {
  url: string;
  kind: 'video' | 'image';
  sound?: boolean;
  /** 영상 길이(초). 서버가 렌더 전에 재서 넘긴다 (모르면 비움) */
  seconds?: number;
}

export interface ClipLayer {
  key: string;
  /** 영상 전체 기준 시작 프레임과 길이 */
  from: number;
  duration: number;
  media: SceneMediaItem;
}

/** 올린 영상이 덮을 구간: 묶음 첫 장면이면 묶음 전체, 아니면 그 장면만 */
export function clipLayers(script: Script, timings: SceneTiming[], media: Record<string, SceneMediaItem>): ClipLayer[] {
  const t = new Map(timings.map((x) => [x.sceneId, x]));
  const layers: ClipLayer[] = [];
  for (const group of clipGroups(script)) {
    group.forEach((id, k) => {
      const m = media[id];
      const start = t.get(id);
      if (!m || !start) return;
      // 묶음 안 다른 장면에 따로 올린 영상이 있으면 그 앞에서 멈춘다
      let endId = id;
      if (k === 0)
        for (const g of group.slice(1)) {
          if (media[g]) break;
          endId = g;
        }
      const end = t.get(endId)!;
      layers.push({ key: id, from: start.from, duration: end.from + end.durationInFrames - start.from, media: m });
    });
  }
  return layers;
}

export const layerAt = <T extends { from: number; duration: number }>(layers: T[], frame: number): T | undefined => layers.find((l) => frame >= l.from && frame < l.from + l.duration);

/** 완성 사진을 화면 가득 보여 줄 구간: 첫 장면(훅)과 '완성 음식 먼저' 장면. 그 장면에 촬영 영상이 있으면 영상이 우선 */
export interface PhotoLayer {
  sceneId: string;
  from: number;
  duration: number;
  opening: boolean;
}

export function photoLayers(script: Script, timings: SceneTiming[], photoUrl: string | undefined, clips: ClipLayer[]): PhotoLayer[] {
  if (!photoUrl) return [];
  const out: PhotoLayer[] = [];
  timings.forEach((t, i) => {
    const scene = script.scenes.find((s) => s.id === t.sceneId);
    if (!scene) return;
    const opening = i === 0;
    if (!opening && scene.visual !== 'result') return;
    if (layerAt(clips, t.from)) return;
    out.push({ sceneId: t.sceneId, from: t.from, duration: t.durationInFrames, opening });
  });
  return out;
}

/**
 * 촬영 영상이 그 구간보다 짧을 때: 먼저 천천히 재생해(최대 MIN_RATE배 느리게, 음식 슬로모션은 자연스럽다) 늘리고,
 * 그래도 모자라면 처음부터 다시 돈다. 길이를 모르면 그대로 (끝나면 마지막 장면에서 멈추고 확대만 이어진다).
 */
export const MIN_PLAYBACK_RATE = 0.6;
export function clipPlayback(seconds: number | undefined, frames: number, fps = VIDEO.fps): { playbackRate: number; loopFrames: number | null } {
  if (!seconds || !(seconds > 0)) return { playbackRate: 1, loopFrames: null };
  const need = frames / fps;
  if (seconds >= need) return { playbackRate: 1, loopFrames: null };
  const playbackRate = Math.max(MIN_PLAYBACK_RATE, seconds / need);
  // 느리게 튼 영상이 덮는 프레임 수 (반올림 오차 1프레임은 마지막 장면에 머문다)
  const covered = Math.floor((seconds / playbackRate) * fps);
  return { playbackRate: Math.round(playbackRate * 1000) / 1000, loopFrames: covered >= frames - 1 ? null : covered };
}

/** 영상·사진의 천천히 다가가는 확대 (켄 번스). 영상은 덜, 사진은 조금 더 */
export function kenBurns(frame: number, duration: number, kind: 'video' | 'image'): number {
  const p = Math.min(1, Math.max(0, frame / Math.max(1, duration)));
  return 1 + p * (kind === 'video' ? 0.05 : 0.08);
}

/**
 * 맛조수 작은 원(왼쪽 아래). 자막 묶음(CAPTION_SAFE_BOTTOM 위 CAPTION_HEIGHT)보다 위, 위쪽 카드보다 아래,
 * 인스타 앱 UI가 가리는 위 220px·아래 420px과 오른쪽 버튼 줄 밖에 둔다.
 */
export const NARRATOR_SIZE = 250;
const NARRATOR_GAP = 18;
export function narratorBox(): { left: number; top: number; width: number; height: number } {
  const bottom = CAPTION_SAFE_BOTTOM - CAPTION_HEIGHT - NARRATOR_GAP;
  return { left: 44, top: bottom - NARRATOR_SIZE, width: NARRATOR_SIZE, height: NARRATOR_SIZE };
}

const norm = (t: string) => t.replace(/[^0-9A-Za-z가-힣]/g, '');

/** 위쪽 정보 카드에 크게 들어가는 글 (SceneCard와 같은 규칙). 카드에 따로 글이 없는 종류는 null */
export function cardHeadline(scene: Pick<Scene, 'type' | 'line' | 'cardTitle' | 'cardItems' | 'hook' | 'visual'>, topic: string): string | null {
  // 사연 카드(편지): 카드 항목(답변 원문) 또는 대사
  if (isLetterTitle(scene.cardTitle) && (scene.type === 'question' || scene.type === 'intro' || scene.type === 'mistake')) return scene.cardItems?.[0] ?? scene.line;
  switch (scene.type) {
    case 'question':
      return scene.hook || scene.visual ? scene.line : topic;
    case 'intro':
      return scene.cardTitle ?? topic;
    case 'mistake':
      return scene.cardTitle ?? scene.line;
    case 'explain':
    case 'tip':
      return scene.cardItems?.[0] ?? scene.line;
    default:
      return null;
  }
}

/** 카드 글이 자막(대사)과 거의 같은 문장인지: 같은 문장이 화면에 두 번 나오지 않게 */
export function repeatsLine(card: string, line: string): boolean {
  const a = norm(card);
  const b = norm(line);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  return lcsLength(a, b) >= Math.min(a.length, b.length) * 0.7;
}

/**
 * 첫 장면(처음 2초쯤)에 위쪽 정보 카드를 띄울지. 첫 화면은 음식과 큰 훅 자막만 또렷하게:
 * 실제 사진·영상으로 시작하면 카드를 띄우지 않고, 3D로 시작해도 카드가 자막과 같은 문장이면 띄우지 않는다.
 * 비교 화면·서명 카드처럼 이름표가 필요한 연출은 그대로 둔다 (KitchenVideo가 따로 그림).
 */
export function openingCardVisible(scene: Scene, topic: string, realOpening: boolean): boolean {
  if (realOpening) return false;
  const card = cardHeadline(scene, topic);
  return !(card && repeatsLine(card, scene.line));
}

/** 브랜드 배지는 첫 장면이 끝난 뒤에 나타난다 (첫 화면에 로고를 두지 않는다) */
export const BADGE_FADE = 8;
export function badgeOpacity(frame: number, openingEnd: number): number {
  return Math.min(1, Math.max(0, (frame - openingEnd) / BADGE_FADE));
}
