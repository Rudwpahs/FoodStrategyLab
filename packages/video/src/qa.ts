import type { Script } from '@mat-lab/recipe-core';
import type { SceneTiming } from './timeline.ts';

/**
 * 완성 영상 자동 품질 검사 (순수 함수: 소리 크기·화면 밝기 숫자만 받아 판정한다).
 * 실제로 겪은 오류를 코드로 잡는다:
 * - 대사 끝이 잘림: 말하던 소리가 한 칸(0.05초) 만에 완전한 무음이 됨 (장면이 대사보다 먼저 끝남)
 * - 목소리가 안 들리는 장면 (빈 음성 파일)
 * - 너무 긴 무음 (인스타그램은 소리 없는 구간이 긴 릴스를 덜 보여 준다)
 * - 검은 화면 (렌더 실패 프레임)
 * - 대사와 다르게 들림 (음성이 중간에 끊겨 만들어졌거나 발음이 틀림) — 받아쓰기 결과로 판정
 */
export type QaCode = 'cut' | 'silent' | 'dead-air' | 'black' | 'mismatch' | 'no-voice';

export interface QaIssue {
  level: 'error' | 'warning';
  code: QaCode;
  /** 장면 번호 (1부터) */
  scene?: number;
  sceneId?: string;
  /** 영상 속 시각(초) */
  at?: number;
  message: string;
}

export interface QaReport {
  issues: QaIssue[];
  /** 검사한 항목 (화면에 ✓로 보여 준다) */
  checked: string[];
  /** 자동으로 고친 것 */
  fixed: string[];
}

export const QA_STEP = 0.05;
/** 말소리로 보는 크기 (dB) */
const LOUD_DB = -35;
/** 완전한 무음 (배경음이 없는 영상에서 소리가 끊긴 상태) */
const DIGITAL_SILENCE_DB = -80;
const QUIET_DB = -55;
const DEAD_AIR_SECONDS = 3;

/** 16비트 PCM → 일정 간격의 소리 크기(dB) */
export function rmsDb(pcm: Int16Array, rate = 16000, step = QA_STEP): number[] {
  const win = Math.max(1, Math.round(rate * step));
  const out: number[] = [];
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j]! * pcm[j]!;
    const rms = Math.sqrt(sum / win) / 32768;
    out.push(rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100);
  }
  return out;
}

/** 시각(초)이 몇 번째 장면인지 */
export function sceneIndexAt(seconds: number, timings: SceneTiming[], fps = 30): number {
  const f = seconds * fps;
  const i = timings.findIndex((t) => f >= t.from && f < t.from + t.durationInFrames);
  return i === -1 ? timings.length - 1 : i;
}

/** 말하던 소리가 갑자기 완전히 끊긴 시각들 */
export function abruptCuts(db: number[], step = QA_STEP): number[] {
  const out: number[] = [];
  for (let i = 1; i < db.length; i++) if (db[i - 1]! > LOUD_DB && db[i]! < DIGITAL_SILENCE_DB) out.push(i * step);
  return out;
}

/** 일정 길이 이상 이어지는 무음 구간 */
export function quietRuns(db: number[], step = QA_STEP, minSeconds = DEAD_AIR_SECONDS): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i]! < QUIET_DB;
    if (quiet && start === -1) start = i;
    if (!quiet && start !== -1) {
      if ((i - start) * step >= minSeconds) out.push([start * step, i * step]);
      start = -1;
    }
  }
  return out;
}

/** 완성 영상의 소리를 장면별로 검사한다 */
export function auditAudio(input: { db: number[]; step?: number; timings: SceneTiming[]; script: Script; fps?: number }): QaIssue[] {
  const { db, timings, script } = input;
  const step = input.step ?? QA_STEP;
  const fps = input.fps ?? 30;
  const issues: QaIssue[] = [];
  const label = (i: number) => `장면 ${i + 1}`;
  const line = (i: number) => script.scenes[i]?.line ?? '';

  // 장면이 대사보다 먼저 끝나면 '말소리 구간의 끝'에서 소리가 뚝 끊긴다. 그 근처(끝 0.6초 전 ~ 0.3초 뒤)만 본다:
  // 효과음이 뚝 끝나는 것이나 음성 속 쉼은 대사 잘림이 아니다 (대사 중간이 빠진 음성은 받아쓰기 대조가 잡는다)
  const speechWindow = (t: SceneTiming): [number, number] => {
    const end = (t.from + t.speechFrames) / fps;
    return [Math.max(t.from / fps, end - 0.6), end + 0.3];
  };
  const voiced = timings.filter((t) => t.audioUrl);
  for (const at of abruptCuts(db, step)) {
    const t = voiced.find((v) => {
      const [a, b] = speechWindow(v);
      return at >= a && at <= b;
    });
    if (!t) continue;
    const i = timings.indexOf(t);
    issues.push({ level: 'error', code: 'cut', scene: i + 1, sceneId: timings[i]?.sceneId, at, message: `${label(i)} 대사 끝이 잘렸어요 (${at.toFixed(1)}초, "${line(i).slice(-14)}" 부분).` });
  }

  timings.forEach((t, i) => {
    if (!t.audioUrl || t.speechFrames < fps * 0.3) return;
    const a = Math.floor(t.from / fps / step);
    const b = Math.min(db.length, Math.ceil((t.from + t.speechFrames) / fps / step));
    const loudest = Math.max(-100, ...db.slice(a, b));
    if (loudest < -45) issues.push({ level: 'error', code: 'silent', scene: i + 1, sceneId: t.sceneId, at: t.from / fps, message: `${label(i)} 목소리가 들리지 않아요 ("${line(i).slice(0, 14)}…").` });
  });

  // 목소리가 없는 영상(음성 엔진 없음)은 무음 검사를 하지 않는다. 끝의 서명 장면 뒤 여유(약 2초)는 무음이어도 괜찮다
  if (!voiced.length) return issues;
  const total = db.length * step;
  for (const [s, e] of quietRuns(db, step)) {
    if (e >= total - 0.1 && s >= total - 2.6) continue;
    const i = sceneIndexAt(s, timings, fps);
    issues.push({ level: 'warning', code: 'dead-air', scene: i + 1, sceneId: timings[i]?.sceneId, at: s, message: `${label(i)}에 소리 없는 구간이 ${(e - s).toFixed(1)}초 있어요 (${s.toFixed(1)}~${e.toFixed(1)}초).` });
  }
  return issues;
}

/** 화면 밝기(0~255, 일정 간격) → 검은 화면 */
export function auditFrames(brightness: number[], step: number): QaIssue[] {
  const dark = brightness.map((b, i) => [b, i * step] as const).filter(([b]) => b < 10);
  return dark.length ? [{ level: 'error', code: 'black', at: dark[0]![1], message: `검은 화면이 있어요 (${dark[0]![1].toFixed(1)}초 등 ${dark.length}곳).` }] : [];
}

const norm = (t: string) => t.replace(/[^0-9A-Za-z가-힣]/g, '');

/** 최장 공통 부분열 길이 (글자 단위) */
function lcs(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = new Uint16Array(y.length + 1);
  let cur = new Uint16Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    [prev, cur] = [cur, prev];
  }
  return prev[y.length]!;
}

/**
 * 대본 대사와 받아쓴 말을 비교한다.
 * - ratio: 대사 글자 중 들린 비율 (0~1)
 * - truncated: 들린 말이 대사보다 눈에 띄게 짧고 대사의 앞부분과 같음 → 음성이 중간에 끊겨 만들어짐
 * - missing: 들리지 않은 어절
 */
export function lineMatch(expected: string, heard: string): { ratio: number; truncated: boolean; missing: string[] } {
  const e = norm(expected);
  const h = norm(heard);
  if (!e) return { ratio: 1, truncated: false, missing: [] };
  const common = lcs(e, h);
  const ratio = common / e.length;
  const tail = norm(expected.trim().split(/\s+/).slice(-2).join(''));
  const truncated = h.length < e.length * 0.85 && tail.length > 0 && lcs(tail, h.slice(-tail.length - 4)) < tail.length * 0.5;
  const missing = expected
    .trim()
    .split(/\s+/)
    .filter((w) => {
      const n = norm(w);
      return n.length >= 2 && lcs(n, h) < n.length * 0.6;
    });
  return { ratio, truncated, missing };
}
