import { BRAND, type Scene, type Script } from '@mat-lab/recipe-core';
import { openingCardVisible } from './realFootage.ts';
import { sfxCues } from './sfx.ts';
import type { SceneTiming } from './timeline.ts';

/**
 * 맛조수의 고정 신호: 말이 아니라 동작·소리로 알아보게 한다 (docs/research/content-strategy/persona-2026-11.md 5·7절).
 * 낯선 계정이 같은 말버릇을 되풀이하면 빨리 닳지만(반복과 호감은 뒤집힌 U자), 대사는 매번 바꾸고 동작·소리만 고정하면
 * 같은 계정·같은 캐릭터임을 알려 준다 (기록 담당 맛조수가 선생님 노트에서 핵심 이유를 찾는 순간).
 * - 노트 넘기는 소리: 연구자 노트 카드가 뜰 때마다 (sfx.ts page). 장면 시작 직전 쉼에서 사각 소리가 나고 카드가 나타날 때 '탁'
 * - 고글 동작: 영상마다 한 번, 처음 노트 카드가 뜨는 장면에서 고글을 눈앞으로 내려 들여다본 뒤 모자 위로 다시 올린다.
 *   그 장면 첫머리는 맛조수를 비추는 화면(shots.ts insightShot)으로 시작해 동작이 휴대폰에서도 보이게 하고, 그 뒤 장면 본래 화면으로 넘어간다.
 *   (본래 첫 원리 장면은 팬·불을 비춰 맛조수가 화면에 없다: 샘플 대본 58편 모두 그랬다)
 * 순수 함수만 둔다 (KitchenVideo·stage.ts가 쓰고 hostCues.test.ts가 확인한다).
 */

/** 이 장면에 연구자 노트 카드(📒 이희재 연구자의 조리 노트)가 뜨는지. KitchenVideo Overlay와 같은 규칙 */
export function showsNoteCard(scene: Scene, opening: boolean, topic: string, realMedia: boolean): boolean {
  if (scene.type !== 'explain' || scene.visual === 'compare' || scene.visual === 'signature') return false;
  if ((scene.cardTitle ?? BRAND.notePhrase) !== BRAND.notePhrase) return false;
  // 첫 장면은 카드가 자막과 같은 문장이거나 실제 사진·영상으로 시작하면 카드를 띄우지 않는다
  return !opening || openingCardVisible(scene, topic, realMedia);
}

/** 노트 카드가 뜨는 장면 번호들 (대본 순서). realScenes: 실제 촬영 영상·사진으로 시작하는 장면 id */
export function noteCardScenes(script: Script, realScenes: ReadonlySet<string> = NONE): number[] {
  return script.scenes.flatMap((s, i) => (showsNoteCard(s, i === 0, script.title, realScenes.has(s.id)) ? [i] : []));
}
const NONE: ReadonlySet<string> = new Set();

/**
 * 노트 넘기는 소리 자리: 장면 시작 기준 프레임. 6프레임(0.2초) 앞에서 시작해, 소리 속 '탁'(0.255초 = 약 8프레임 뒤)이
 * 장면 시작 직후 노트 카드가 나타나는 때(약 2프레임)에 온다. 사각 소리는 목소리가 시작하기 전 쉼에 들려 목소리에 묻히지 않는다
 * (장면 시작에 맞추면 소리 전체가 첫 음절과 겹쳐 묻혔다). 앞 대사는 적어도 0.45초 전에 끝나 대사 잘림 검사 구간과도 겹치지 않는다.
 */
export const PAGE_TURN_OFFSET = -6;
/** 소리 크기: 목소리보다 약 13dB 작게 (목소리 기준 녹음 -16.5 LUFS, 이 크기의 노트 소리 순간 최대 약 -30.5 LUFS). 연출 효과음(0.32)보다 작다 */
export const PAGE_TURN_VOLUME = 0.28;

export interface PageTurnCue {
  sceneId: string;
  /** 장면 시작 기준 프레임 */
  offset: number;
}

/**
 * 노트 카드가 뜨는 장면마다 노트 넘기는 소리 하나. 실제 영상 위에 카드가 떠도 난다 (카드와 함께 나는 소리).
 * 연출 효과음(sfxCues)이 이미 있는 장면은 건너뛴다 (장면마다 소리 하나).
 */
export function pageTurnCues(script: Script, realScenes: ReadonlySet<string> = NONE): PageTurnCue[] {
  const taken = new Set(sfxCues(script).map((c) => c.sceneId));
  return noteCardScenes(script, realScenes)
    .map((i) => script.scenes[i]!.id)
    .filter((id) => !taken.has(id))
    .map((sceneId) => ({ sceneId, offset: PAGE_TURN_OFFSET }));
}

/** 장면 시작 → 고글 동작 시작 (프레임). 노트 카드가 올라와 자리 잡고(약 7프레임) 장소 넘김(6프레임)이 끝난 뒤 */
export const GOGGLE_LEAD = 6;
/** 고글 동작 길이: 26프레임 = 약 0.87초 (내리기 0.2초 · 들여다보기 0.3초 · 올리기 0.2초 · 자리 잡기 0.17초) */
export const GOGGLE_FRAMES = 26;
/** 고글 장면 첫머리에 맛조수를 비추는 길이 (동작 앞뒤 여유 포함). 이 뒤로 장면 본래 화면 */
export const INSIGHT_FRAMES = GOGGLE_LEAD + GOGGLE_FRAMES + 8;
/** 맛조수 화면 뒤에 남는 장면 본래 화면이 이보다 짧으면 장면 전체를 맛조수 화면으로 (0.5초 남짓 보이고 끊기는 화면이 없게) */
const MIN_REST_FRAMES = 30;

/**
 * 고글 동작을 하는 장면 번호: 노트 카드가 뜨는 장면 중 첫 장면(훅)이 아니고 3D 맛조수가 보이는 첫 장면. 없으면 -1.
 * 첫 노트 장면이 실제 촬영 영상·사진에 덮이면(맛조수는 구석 원 안의 그림) 그다음 노트 장면에서 한다.
 * 노트 장면이 아닌 곳으로는 미루지 않는다: 고글은 '선생님 노트에서 핵심을 찾았다'는 표시라 노트 카드와 함께여야 뜻이 산다.
 */
export function goggleSceneIndex(script: Script, realScenes: ReadonlySet<string> = NONE): number {
  return noteCardScenes(script, realScenes).find((i) => i > 0 && !realScenes.has(script.scenes[i]!.id)) ?? -1;
}

/** 고글 장면 첫머리의 맛조수 화면 길이 (프레임) */
export function insightFrames(duration: number): number {
  return duration - INSIGHT_FRAMES < MIN_REST_FRAMES ? duration : INSIGHT_FRAMES;
}

/** 고글 동작이 시작하는 프레임 (영상 전체 기준). 동작이 없으면 null */
export function goggleStart(script: Script, timings: SceneTiming[], realScenes: ReadonlySet<string> = NONE): number | null {
  const i = goggleSceneIndex(script, realScenes);
  if (i < 0) return null;
  const t = timings.find((x) => x.sceneId === script.scenes[i]!.id);
  if (!t || t.durationInFrames < GOGGLE_LEAD + GOGGLE_FRAMES) return null;
  return t.from + GOGGLE_LEAD;
}

/** 고글 동작 한 프레임의 자세 (Chef3D가 그린다) */
export interface GogglePose {
  /** 고글 위치: 0 = 모자 위(평소), 1 = 눈앞. 내릴 때 살짝 넘치고, 올린 뒤 모자 위에서 한 번 튕긴다(음수) */
  down: number;
  /** 오른손: 0 = 평소 팔, 1 = 관자놀이 옆 고글 끈, 1.3 = 위로 밀어 올림 */
  hand: number;
  /** 몸을 앞으로 기울여 들여다보기 (0~1) */
  lean: number;
  /** 렌즈 너머 눈이 커 보이기 (0~1) */
  peer: number;
  /** 렌즈 반짝임이 지나가는 정도 (0~1) */
  glint: number;
  /** "찾았다" 통통 튀기 (0~1) */
  pop: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/**
 * 동작 시작 뒤 t프레임의 자세. 동작 밖(t < 0 또는 t ≥ GOGGLE_FRAMES)은 undefined (평소 모습).
 * 0~8 고글 내리기(손이 관자놀이로, 살짝 넘쳤다 자리 잡음) · 8~15 들여다보기(눈이 커지고 렌즈가 반짝) · 15~21 밀어 올리기 · 21~25 모자 위에서 튕기며 통통 · 25 평소 모습.
 * 움직임은 천천히 시작해 천천히 멈춘다: 한 프레임에 갈 길의 1/4 남짓까지만 움직여 뚝뚝 끊겨 보이지 않게 (영상에는 움직임 흐림이 없다).
 */
export function gogglePose(t: number): GogglePose | undefined {
  if (!(t >= 0 && t < GOGGLE_FRAMES)) return undefined;
  const down = t < 6 ? 1.04 * smooth(0, 6, t) : t < 8 ? 1.04 - 0.04 * smooth(6, 8, t) : t < 15 ? 1 : t < 21 ? 1 - smooth(15, 21, t) : -0.1 * Math.sin((Math.PI * Math.min(4, t - 21)) / 4);
  const hand = t < 5 ? smooth(0, 5, t) : t < 15 ? 1 : t < 18 ? 1 + 0.3 * smooth(15, 18, t) : 1.3 * (1 - smooth(18, 25, t));
  const lean = t < 14 ? smooth(1, 8, t) : 1 - smooth(14, 20, t);
  const peer = t < 14 ? smooth(6, 10, t) : 1 - smooth(14, 17, t);
  const glint = smooth(8, 14, t);
  const pop = t < 19 ? 0 : Math.sin((Math.PI * Math.min(6, t - 19)) / 6);
  return { down, hand, lean, peer, glint, pop };
}
