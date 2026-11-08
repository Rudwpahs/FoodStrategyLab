import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import type { Script } from '@mat-lab/recipe-core';
import { decodeGrayPng, splitPngs } from './audio.ts';
import { QA_STEP, abruptCuts, auditAudio, auditFrames, lineMatch, quietRuns, rmsDb } from './qa.ts';
import type { SceneTiming } from './timeline.ts';

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
    expect(abruptCuts(db).map((t) => t.toFixed(2))).toEqual(['7.50']);
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
    expect(abruptCuts(db).map((t) => t.toFixed(2))).toEqual(['10.20']);
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
  it('이름이 다르게 들리면 그 어절을 알려 준다', () => {
    const m = lineMatch('오늘의 실험 끝! 이희재의 맛 연구소였어요.', '오늘의 실험 끝! 이제의 맛연구소였어요!');
    expect(m.truncated).toBe(false);
    expect(m.missing).toEqual(['이희재의']);
  });
});
