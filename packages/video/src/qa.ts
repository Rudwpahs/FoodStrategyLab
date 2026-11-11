import { lcsLength, type Script } from '@mat-lab/recipe-core';
import { speechPlayback } from './speechPlayback.ts';
import type { SceneTiming } from './timeline.ts';

/**
 * 완성 영상 자동 품질 검사 (순수 함수: 소리 크기·화면 밝기 숫자만 받아 판정한다).
 * 실제로 겪은 오류를 코드로 잡는다:
 * - 대사 끝이 잘림: 장면 음성을 자르는 자리(말소리 끝)에서도 아직 말하고 있었음 (오래된 말소리 구간 캐시 등)
 * - 목소리가 안 들리는 장면 (빈 음성 파일)
 * - 너무 긴 무음 (인스타그램은 소리 없는 구간이 긴 릴스를 덜 보여 준다)
 * - 검은 화면 (렌더 실패 프레임)
 * - 대사와 다르게 들림 (음성이 중간에 끊겨 만들어졌거나 발음이 틀림) — 받아쓰기 결과로 판정
 */
export type QaCode = 'cut' | 'silent' | 'dead-air' | 'black' | 'mismatch';

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

/**
 * 품질 검사 기준값 (모두 여기 한 곳에). 소리는 완성 영상(-14 LUFS로 맞춘 뒤)을 16kHz로 읽어 잰다.
 * 소리 크기는 RMS dBFS. 음량 맞춤으로 전체 크기가 바뀌어도 판정이 같도록 '대사 잘림'은 그 장면 목소리와의 차이로 본다.
 */
/** 소리 크기를 재는 간격(초). 끝 페이드(2프레임=0.067초)보다 충분히 잘게 봐야 페이드 앞뒤를 나눠 볼 수 있다 */
export const QA_STEP = 0.01;
/** 목소리가 있다고 보는 가장 작은 크기. 말소리 구간 측정(SPEECH_THRESHOLD_DB, 원본 음성 기준)보다 음량 맞춤 오차만큼 낮게 */
const VOICE_DB = -45;
/** 이보다 작으면 '소리 없음' (긴 무음 판정) */
const QUIET_DB = -55;
/** 이만큼 이어지는 무음은 경고 */
const DEAD_AIR_SECONDS = 3;
/**
 * 대사 잘림: 페이드 바로 앞 CUT_PRE_SECONDS 동안의 소리가 그 장면 목소리(상위 10% 크기)보다 CUT_BELOW_VOICE_DB 이내면 '아직 말하는 중'.
 * 자연스럽게 끝난 대사는 말소리 측정 규칙상 끝 0.08초가 SPEECH_THRESHOLD_DB(-42dB) 아래라서, 보통 크기(상위 칸 -13dB 안팎)의
 * 목소리보다 29dB쯤 작다. 잘린 말끝은 조용한 어미라도 목소리보다 20dB 안쪽이다. 그 사이(24dB)를 기준으로 둔다.
 * 프레임 반올림(최대 1/60초)을 빼도 페이드 앞 0.03초는 그 조용한 꼬리 안에 들어간다.
 */
const CUT_PRE_SECONDS = 0.03;
const CUT_BELOW_VOICE_DB = 24;
/** 페이드가 끝나고 CUT_POST_GAP 뒤 CUT_POST_SECONDS 동안은 CUT_DROP_DB 이상 작아져야 한다 (효과음이 계속 울리면 잘림인지 알 수 없어 보지 않는다) */
const CUT_POST_GAP = 0.03;
const CUT_POST_SECONDS = 0.1;
const CUT_DROP_DB = 30;
/** 장면 목소리 크기: 말소리 구간 안 칸들의 상위 10% 크기 */
const VOICE_PERCENTILE = 0.9;
/** 화면 평균 밝기(0~255)가 이보다 어두우면 검은 화면. 가장 어두운 연출(실패 장면 조명)도 이보다 훨씬 밝다 */
const BLACK_BRIGHTNESS = 10;

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

/** [a, b]초 안에 완전히 들어가는 칸들의 크기 */
function levels(db: number[], step: number, a: number, b: number): number[] {
  return db.slice(Math.max(0, Math.ceil(a / step - 1e-9)), Math.max(0, Math.floor(b / step + 1e-9)));
}
const loudest = (xs: number[]) => xs.reduce((m, v) => Math.max(m, v), -100);

/**
 * 장면 음성이 말소리 끝에서 잘렸는지. 음성은 말소리 끝(end)에서 2프레임 페이드로 줄인 뒤 자르므로(speechPlayback),
 * '한 칸 만에 뚝 끊김'이 아니라 '페이드 직전에도 그 장면 목소리 크기로 말하고 있었는지'를 본다.
 */
export function cutAtSpeechEnd(db: number[], step: number, timing: SceneTiming, fps = 30): boolean {
  const p = speechPlayback(timing);
  const fadeStart = (timing.from + p.fadeStart) / fps;
  const fadeEnd = (timing.from + p.fadeEnd) / fps;
  const voice = levels(db, step, timing.from / fps, fadeStart).sort((x, y) => x - y);
  if (!voice.length) return false;
  const voiceDb = voice[Math.min(voice.length - 1, Math.floor(voice.length * VOICE_PERCENTILE))]!;
  const before = loudest(levels(db, step, fadeStart - CUT_PRE_SECONDS, fadeStart));
  const after = loudest(levels(db, step, fadeEnd + CUT_POST_GAP, fadeEnd + CUT_POST_GAP + CUT_POST_SECONDS));
  return before >= VOICE_DB && before >= voiceDb - CUT_BELOW_VOICE_DB && before - after >= CUT_DROP_DB;
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

  timings.forEach((t, i) => {
    if (!t.audioUrl || !cutAtSpeechEnd(db, step, t, fps)) return;
    const at = (t.from + speechPlayback(t).end) / fps;
    issues.push({ level: 'error', code: 'cut', scene: i + 1, sceneId: t.sceneId, at, message: `${label(i)} 대사 끝이 잘렸어요 (${at.toFixed(1)}초, "${line(i).slice(-14)}" 부분).` });
  });

  timings.forEach((t, i) => {
    if (!t.audioUrl || t.speechFrames < fps * 0.3) return;
    if (loudest(levels(db, step, t.from / fps, (t.from + t.speechFrames) / fps)) < VOICE_DB)
      issues.push({ level: 'error', code: 'silent', scene: i + 1, sceneId: t.sceneId, at: t.from / fps, message: `${label(i)} 목소리가 들리지 않아요 ("${line(i).slice(0, 14)}…").` });
  });

  // 목소리가 없는 영상(음성 엔진 없음)은 무음 검사를 하지 않는다
  const voiced = timings.filter((t) => t.audioUrl);
  const last = voiced.at(-1);
  if (!last) return issues;
  // 마지막 대사가 끝난 뒤(엔딩 여유)는 타임라인이 일부러 둔 조용한 구간이라 세지 않는다
  const outroFrom = (last.from + speechPlayback(last).fadeEnd) / fps;
  for (const [s, e0] of quietRuns(db, step)) {
    const e = Math.min(e0, Math.max(s, outroFrom));
    if (e - s < DEAD_AIR_SECONDS) continue;
    const i = sceneIndexAt(s, timings, fps);
    issues.push({ level: 'warning', code: 'dead-air', scene: i + 1, sceneId: timings[i]?.sceneId, at: s, message: `${label(i)}에 소리 없는 구간이 ${(e - s).toFixed(1)}초 있어요 (${s.toFixed(1)}~${e.toFixed(1)}초).` });
  }
  return issues;
}

/** 화면 밝기(0~255, 일정 간격) → 검은 화면 */
export function auditFrames(brightness: number[], step: number): QaIssue[] {
  const dark = brightness.map((b, i) => [b, i * step] as const).filter(([b]) => b < BLACK_BRIGHTNESS);
  return dark.length ? [{ level: 'error', code: 'black', at: dark[0]![1], message: `검은 화면이 있어요 (${dark[0]![1].toFixed(1)}초 등 ${dark.length}곳).` }] : [];
}

const norm = (t: string) => t.replace(/[^0-9A-Za-z가-힣]/g, '');

/**
 * 한 글자만 달라도 뜻이 반대가 되는 조리 핵심어 (불 세기). 받아쓰기가 조금 틀려도 넘어가는 어절 비교(60% 일치)와 달리
 * 이 말은 대사와 똑같이 들려야 한다. 긴 말(중약불)을 먼저 찾아 '약불'과 헷갈리지 않게 한다.
 */
const KEY_TERMS = /중강불|중약불|센불|강불|중불|약불/g;
const keyTerms = (text: string): string[] => norm(text).match(KEY_TERMS) ?? [];

/**
 * 대본 대사와 받아쓴 말을 비교한다.
 * - ratio: 대사 글자 중 들린 비율 (0~1)
 * - truncated: 들린 말이 대사보다 눈에 띄게 짧고 대사의 앞부분과 같음 → 음성이 중간에 끊겨 만들어짐
 * - missing: 들리지 않은 어절 (조리 핵심어가 다르게 들린 어절 포함)
 * - critical: 다르게 들린 조리 핵심어 (불 세기) — 받아쓰기 일치율과 상관없이 알려야 한다
 */
export function lineMatch(expected: string, heard: string): { ratio: number; truncated: boolean; missing: string[]; critical: string[] } {
  const e = norm(expected);
  const h = norm(heard);
  if (!e) return { ratio: 1, truncated: false, missing: [], critical: [] };
  const common = lcsLength(e, h);
  const ratio = common / e.length;
  const tail = norm(expected.trim().split(/\s+/).slice(-2).join(''));
  const truncated = h.length < e.length * 0.85 && tail.length > 0 && lcsLength(tail, h.slice(-tail.length - 4)) < tail.length * 0.5;
  const heardTerms = keyTerms(heard);
  const unheard = (term: string) => !heardTerms.includes(term);
  const missing = expected
    .trim()
    .split(/\s+/)
    .filter((w) => {
      const n = norm(w);
      return (n.length >= 2 && lcsLength(n, h) < n.length * 0.6) || keyTerms(w).some(unheard);
    });
  const critical = [...new Set(keyTerms(expected).filter(unheard))];
  return { ratio, truncated, missing, critical };
}
