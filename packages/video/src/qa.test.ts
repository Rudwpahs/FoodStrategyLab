import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import type { Script } from '@mat-lab/recipe-core';
import { decodeGrayPng, splitPngs } from './audio.ts';
import { QA_STEP, auditAudio, auditFrames, lineMatch, quietRuns, rmsDb } from './qa.ts';
import { synthSfx } from './sfx.ts';
import { speechBounds } from './speech.ts';
import { speechPlayback, speechVolume } from './speechPlayback.ts';
import { buildTimeline, totalFrames, type SceneTiming } from './timeline.ts';

const script: Script = {
  title: 't',
  scenes: [
    { id: 's1', type: 'mistake', emotion: 'embarrassed', line: '청국장덮밥, 이렇게 실패했다면 해결법 있어요!' },
    { id: 's2', type: 'intro', emotion: 'joy', line: '오늘의 실험! 청국장덮밥, 청국장은 왜 맨 나중에 넣을까?' },
    { id: 's3', type: 'explain', emotion: 'surprised', line: '선생님 노트를 보면요, 청국장을 나중에 넣고 살짝 볶으면 향이 덜 날아가요.' },
  ],
};
// 장면 3개: 0~3초, 3~8초, 8~12초 (30fps)
const timings: SceneTiming[] = [
  { sceneId: 's1', from: 0, durationInFrames: 90, speechFrames: 75, audioUrl: 'a1' },
  { sceneId: 's2', from: 90, durationInFrames: 150, speechFrames: 135, audioUrl: 'a2' },
  { sceneId: 's3', from: 240, durationInFrames: 120, speechFrames: 110, audioUrl: 'a3' },
];
/** 초 단위 구간마다 소리 크기를 정해 dB 배열을 만든다 */
const track = (parts: [number, number, number][], total = 12) => {
  const db = Array.from({ length: Math.round(total / QA_STEP) }, () => -100);
  for (const [s, e, v] of parts) for (let i = Math.round(s / QA_STEP); i < Math.round(e / QA_STEP); i++) db[i] = v;
  return db;
};

describe('완성 영상 자동 품질 검사', () => {
  it('말하던 소리가 장면 끝에서 갑자기 끊기면 "대사 잘림"으로 잡는다 (실제 오류: 8.15초 "왜 맨 나…")', () => {
    // 장면 1은 자연스럽게 줄어들며 끝남, 장면 2는 말하는 중(-25dB)에 끊김
    const db = track([
      [0, 2.4, -18],
      [2.4, 2.6, -50],
      [3.1, 7.5, -20],
      [8.1, 11.5, -19],
      [11.5, 11.7, -48],
    ]);
    const issues = auditAudio({ db, timings, script });
    const cut = issues.filter((i) => i.code === 'cut');
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ level: 'error', scene: 2, sceneId: 's2' });
    expect(cut[0]!.message).toContain('나중에 넣을까?');
  });

  it('효과음이 뚝 끝나는 것(말소리 구간 밖)이나 목소리 없는 영상은 잘림·무음으로 보지 않는다 (실제 시험 렌더에서 나온 오탐)', () => {
    // 장면 2 말소리는 3~7.5초. 10초쯤 효과음이 뚝 끝남
    const db = track([
      [0, 2.4, -18],
      [2.4, 2.6, -50],
      [3.1, 7.3, -20],
      [7.3, 7.6, -50],
      [8.1, 9.6, -19],
      [9.6, 9.8, -48],
      [9.9, 10.2, -15],
    ]);
    expect(auditAudio({ db, timings, script }).filter((i) => i.code === 'cut')).toEqual([]);
    const noVoice = timings.map(({ audioUrl: _drop, ...t }) => t);
    const issues = auditAudio({ db: track([[6.4, 6.5, -15]], 12), timings: noVoice, script });
    expect(issues).toEqual([]);
  });

  it('목소리가 들리지 않는 장면을 잡는다', () => {
    const db = track([
      [0, 2.4, -18],
      [2.4, 2.6, -50],
      [8.1, 11.5, -19],
      [11.5, 11.7, -48],
    ]);
    const silent = auditAudio({ db, timings, script }).filter((i) => i.code === 'silent');
    expect(silent.map((i) => i.scene)).toEqual([2]);
  });

  it('3초 넘는 무음은 경고, 끝의 서명 여유는 괜찮다', () => {
    expect(quietRuns(track([[0, 1, -20], [4.5, 5, -20]], 6))).toEqual([[1, 4.5]]);
    const db = track([[0, 2.4, -18], [2.4, 2.6, -50], [3.1, 4, -20], [4, 4.2, -50], [8.1, 9.5, -19], [9.5, 9.7, -48]]);
    const dead = auditAudio({ db, timings, script }).filter((i) => i.code === 'dead-air');
    expect(dead).toHaveLength(1);
    expect(dead[0]!.scene).toBe(2);
  });

  it('PCM에서 소리 크기를 잰다', () => {
    const pcm = new Int16Array(16000);
    for (let i = 0; i < 8000; i++) pcm[i] = Math.round(Math.sin(i / 5) * 8000);
    const db = rmsDb(pcm, 16000, 0.05);
    expect(db).toHaveLength(20);
    expect(db[0]!).toBeGreaterThan(-20);
    expect(db[19]!).toBe(-100);
  });

  it('검은 화면을 잡는다', () => {
    expect(auditFrames([120, 118, 3, 2, 119], 0.5)).toEqual([expect.objectContaining({ code: 'black', level: 'error', at: 1 })]);
    expect(auditFrames([120, 118, 119], 0.5)).toEqual([]);
  });

  it('흑백 PNG 여러 장을 나눠 화소를 푼다 (Remotion ffmpeg에는 rawvideo가 없어서)', () => {
    const png = (w: number, h: number, v: number) => {
      const chunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
      };
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8;
      const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array(w).fill(v)])));
      return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
    };
    const parts = splitPngs(Buffer.concat([png(4, 3, 200), png(4, 3, 5)]));
    expect(parts).toHaveLength(2);
    expect([...decodeGrayPng(parts[0]!)]).toEqual(Array(12).fill(200));
    expect([...decodeGrayPng(parts[1]!)]).toEqual(Array(12).fill(5));
  });
});

/**
 * 실제 렌더와 같은 길로 만든 소리로 '대사 잘림' 검사를 확인한다:
 * 음성(말소리 비슷한 신호) → speechBounds(서버와 같은 측정) → buildTimeline → SpeechAudio와 같은 자르기·페이드 → 음량 맞춤 → rmsDb → auditAudio
 */
describe('대사 잘림 검사: 실제 렌더처럼 끝 페이드가 걸린 소리', () => {
  const RATE = 16000;
  const FPS = 30;
  const SYL = 0.16;
  const GAP = 0.05;
  /**
   * 음절(0.16초)마다 커졌다 줄어드는 배음 소리, 세 음절마다 짧은 쉼, 아주 작은 바탕 잡음(-70dB).
   * 마지막 음절들은 endAmp 크기 (한국어 말끝은 조용하다), 끝은 서서히 사라지는 꼬리.
   */
  const utterance = (lead: number, endAmp: number, syllables = 12, endSyllables = 3, amp = 0.3) => {
    const parts: number[] = [];
    let seed = 1;
    const hiss = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 0xffffffff - 0.5) * 0.0006;
    };
    const voice = (a: number, f0: number, t: number) => a * (0.6 * Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.sin(4 * Math.PI * f0 * t) + 0.1 * Math.sin(6 * Math.PI * f0 * t));
    const push = (seconds: number, f: (t: number) => number) => {
      for (let i = 0; i < Math.round(seconds * RATE); i++) parts.push(f(i / RATE) + hiss());
    };
    push(lead, () => 0);
    for (let k = 0; k < syllables; k++) {
      const a = k >= syllables - endSyllables ? endAmp : amp;
      const f0 = 170 + 25 * Math.sin(k);
      const last = k === syllables - 1;
      // 마지막 음절은 끝까지 줄어들지 않고 꼬리(약 0.03초 시간 상수)로 사라진다
      push(SYL, (t) => voice(a * (last && t > SYL / 2 ? 1 : Math.sin((Math.PI * t) / SYL)), f0, t));
      if (last) push(0.2, (t) => voice(a * Math.exp(-t / 0.03), f0, t + SYL));
      if (k % 3 === 2 && !last) push(GAP, () => 0);
    }
    push(0.4, () => 0);
    return Float32Array.from(parts);
  };
  /** 마지막 음절 한가운데 시각 */
  const lastSyllableMiddle = (lead: number, syllables = 12) => lead + syllables * SYL + Math.floor((syllables - 1) / 3) * GAP - SYL / 2;
  const toPcm = (x: Float32Array) => Int16Array.from(x, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
  const sceneScript = (n: number): Script => ({
    title: 't',
    scenes: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, type: 'explain' as const, emotion: 'joy' as const, line: '선생님 노트를 보면요, 청국장을 나중에 넣어요.' })),
  });

  /** 장면마다 { 재생할 음성, 말소리 구간을 잰 음성(오래된 캐시면 다른 파일) } → 완성 영상 소리 */
  const render = (scenes: { audio: Float32Array; measured?: Float32Array }[], extra?: (track: Float32Array, timings: SceneTiming[]) => void) => {
    const script = sceneScript(scenes.length);
    const bounds = scenes.map((s) => speechBounds(toPcm(s.measured ?? s.audio), RATE));
    const timings = buildTimeline(
      script,
      bounds.map((b) => Math.max(0.3, b.end - b.start)),
      scenes.map((_, i) => `a${i}`),
      bounds.map((b) => ({ trimStart: b.start })),
      FPS,
    );
    const track = new Float32Array(Math.ceil((totalFrames(timings) / FPS) * RATE));
    timings.forEach((t, i) => {
      const p = speechPlayback(t);
      const start = Math.round((t.from / FPS) * RATE);
      const skip = Math.round((p.trimBefore / FPS) * RATE);
      for (let n = 0; start + n < track.length; n++) {
        const frame = (n / RATE) * FPS;
        if (frame >= p.trimAfter - p.trimBefore) break;
        // Remotion은 음량을 프레임마다 정한다
        track[start + n]! += (scenes[i]!.audio[skip + n] ?? 0) * speechVolume(Math.floor(frame), p.end);
      }
    });
    extra?.(track, timings);
    // 음량 맞춤(-14 LUFS)은 음성이 이미 기준 음량이면 거의 그대로라서 키우지 않는다 (가장 어려운 경우)
    return { script, timings, db: rmsDb(toPcm(track), RATE, QA_STEP) };
  };
  const cuts = (r: ReturnType<typeof render>) => auditAudio({ db: r.db, step: QA_STEP, timings: r.timings, script: r.script }).filter((i) => i.code === 'cut');
  /** 오래된 말소리 캐시: 지금 음성보다 짧은(끝이 잘린) 음성을 잰 결과 */
  const staleAt = (audio: Float32Array, seconds: number) => audio.slice(0, Math.round(seconds * RATE));

  it('조용한 말끝(약 -28dB)이 잘려도 칸 정렬과 상관없이 잡는다 (예전 검사는 끝 페이드 때문에 놓쳤다)', () => {
    for (const endAmp of [0.3, 0.08, 0.05]) {
      for (let k = 0; k <= 10; k++) {
        const lead = 0.25 + k * 0.005;
        const audio = utterance(lead, endAmp);
        const loud = utterance(0.3, 0.3);
        const r = render([{ audio }, { audio: loud, measured: staleAt(loud, lastSyllableMiddle(0.3) + k * 0.004) }, { audio, measured: staleAt(audio, lastSyllableMiddle(lead)) }]);
        expect(
          cuts(r).map((c) => c.scene),
          `endAmp ${endAmp}, k ${k}`,
        ).toEqual([2, 3]);
      }
    }
  });

  it('자연스럽게 끝난 대사(크게·조용하게·아주 작게 줄어들며)는 잘림이 아니다', () => {
    for (const endAmp of [0.3, 0.08, 0.04, 0.02]) {
      for (let k = 0; k <= 10; k++) {
        const r = render([{ audio: utterance(0.25 + k * 0.005, endAmp) }, { audio: utterance(0.2, endAmp, 5, 2) }]);
        expect(cuts(r), `endAmp ${endAmp}, k ${k}`).toEqual([]);
      }
    }
  });

  it('잘렸던 장면을 음성 파일 끝까지 늘려 다시 만들면 잘림이 사라진다 (서버 자동 복구)', () => {
    const audio = utterance(0.25, 0.08);
    expect(cuts(render([{ audio, measured: staleAt(audio, lastSyllableMiddle(0.25)) }]))).toHaveLength(1);
    expect(cuts(render([{ audio }]))).toEqual([]);
  });

  it('효과음이 말끝과 겹쳐 울리거나 말소리 밖에서 뚝 끝나도 잘림으로 보지 않는다', () => {
    const ding = synthSfx('ding');
    const r = render([{ audio: utterance(0.2, 0.05, 4, 1) }, { audio: utterance(0.25, 0.3) }], (track, timings) => {
      // 짧은 대사 끝에 울리는 효과음 (말끝 0.2초 전에 시작)
      const t = timings[0]!;
      const at = Math.round(((t.from + speechPlayback(t).end) / FPS - 0.2) * RATE);
      for (let i = 0; i < (ding.length * RATE) / 22050 && at + i < track.length; i++) track[at + i]! += 0.32 * ding[Math.floor((i * 22050) / RATE)]!;
      // 장면 2 앞부분에서 뚝 끝나는 효과음
      const mid = Math.round(((timings[1]!.from + 20) / FPS) * RATE);
      for (let i = 0; i < 0.3 * RATE; i++) track[mid + i]! += 0.2 * Math.sin(i / 3);
    });
    expect(cuts(r)).toEqual([]);
  });
});

describe('받아쓰기로 대사 대조', () => {
  it('음성이 대사 중간에서 끊겨 만들어진 것을 잡는다 (실제 받아쓰기 결과)', () => {
    const m = lineMatch(script.scenes[1]!.line, '오늘의 실험! 청국장덮밥! 청국장은 왜 맨 나...');
    expect(m.truncated).toBe(true);
    expect(m.missing).toEqual(expect.arrayContaining(['나중에', '넣을까?']));
  });
  it('받아쓰기가 조금 틀려도(바른→다른) 잘림으로 보지 않는다', () => {
    const m = lineMatch('바른 순서는 핵심 5단계, 전체 6단계는 블로그에!', '다른 순서는 핵심 5단계, 전체 6단계는 블로그에!');
    expect(m.truncated).toBe(false);
    expect(m.ratio).toBeGreaterThan(0.9);
  });
  it('불 세기처럼 한 글자로 뜻이 반대가 되는 조리 핵심어는 정확히 같아야 한다', () => {
    const m = lineMatch('간장 두 숟갈을 넣고 센불에서 볶아요', '된장 두 숟갈을 넣고 약불에서 볶아요');
    expect(m.missing).toEqual(expect.arrayContaining(['간장', '센불에서']));
    expect(m.critical).toEqual(['센불']);
    expect(lineMatch('중약불로 줄여요', '중약불로 줄여요').critical).toEqual([]);
    expect(lineMatch('중약불로 줄여요', '약불로 줄여요').critical).toEqual(['중약불']);
    expect(lineMatch('바른 순서는 핵심 5단계', '다른 순서는 핵심 5단계').critical).toEqual([]);
  });
  it('이름이 다르게 들리면 그 어절을 알려 준다', () => {
    const m = lineMatch('오늘의 실험 끝! 이희재의 맛 연구소였어요.', '오늘의 실험 끝! 이제의 맛연구소였어요!');
    expect(m.truncated).toBe(false);
    expect(m.missing).toEqual(['이희재의']);
  });
});
