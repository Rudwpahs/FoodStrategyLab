import { describe, expect, it } from 'vitest';
import { alignWords, estimateWords, snapToSpeech, type TimedWord } from './wordAlign.ts';
import { speechPauses } from './speech.ts';

const w = (word: string, start: number, end: number): TimedWord => ({ word, start, end });

describe('받아쓰기 어절 시간을 대본 어절에 맞추기', () => {
  it('띄어쓰기가 같으면 받아쓴 시간을 그대로 쓴다', () => {
    expect(alignWords('재료는 그대로예요. 섞는 타이밍만 바꿔요.', [w(' 재료는', 0, 0.5), w(' 그대로예요.', 0.55, 1.2), w(' 섞는', 1.6, 1.9), w(' 타이밍만', 1.95, 2.5), w(' 바꿔요.', 2.55, 3)])).toEqual([
      [0, 0.5],
      [0.55, 1.2],
      [1.6, 1.9],
      [1.95, 2.5],
      [2.55, 3],
    ]);
  });

  it('받아쓰기가 붙여 쓴 낱말("맛연구소")도 어절별로 나눈다 — 예전에는 단어 수가 달라 글자 수 비율로 나눴다', () => {
    // 2026-11 견본의 끝 장면 받아쓰기: "이희재의"를 "이제"로, "맛 연구소"를 "맛연구소"로 들었다 (대본 12어절, 받아쓰기 9낱말)
    const line = '떫은맛 범인 검거 완료! 이희재의 맛 연구소 수사 기록에 한 줄 남길게요.';
    const heard = [w('떡튼맛', 0, 0.5), w('범인', 0.55, 0.8), w('검거', 0.85, 1.1), w('완료.', 1.15, 1.5), w('이제', 2.0, 2.3), w('맛연구소', 2.35, 3.15), w('수사기록에', 3.2, 3.9), w('한', 3.95, 4.05), w('줄', 4.1, 4.25), w('남길게요.', 4.3, 4.9)];
    const t = alignWords(line, heard)!;
    expect(t).toHaveLength(12);
    // 문장 사이 쉼(1.5~2.0초) 뒤의 어절은 쉼이 끝난 뒤에 시작한다
    expect(t[4]![0]).toBeGreaterThanOrEqual(2.0);
    // "맛 연구소" → 맛(2.35~2.55), 연구소(2.55~3.15)
    expect(t[5]![0]).toBeCloseTo(2.35, 2);
    expect(t[6]![0]).toBeCloseTo(2.55, 2);
    expect(t[6]![1]).toBeCloseTo(3.15, 2);
    // "수사 기록에" 둘로 나뉜다
    expect(t[7]![0]).toBeCloseTo(3.2, 2);
    expect(t[8]![0]).toBeGreaterThan(3.3);
    expect(t[11]).toEqual([4.3, 4.9]);
    for (let i = 1; i < t.length; i++) expect(t[i]![0]).toBeGreaterThanOrEqual(t[i - 1]![0]);
  });

  it('받아쓰기가 숫자 낱말을 빼먹어도(시간 없는 낱말) 앞뒤 사이에 끼워 넣는다', () => {
    const line = '호두 500g에 설탕 1컵까지요.';
    // 정렬기는 숫자가 든 낱말의 시간을 주지 못해 빠졌다
    const t = alignWords(line, [w('호두', 0, 0.4), w('설탕', 1.4, 1.8), w('까지요', 2.1, 2.6)])!;
    expect(t).toHaveLength(4);
    expect(t[0]).toEqual([0, 0.4]);
    expect(t[1]![0]).toBeCloseTo(0.4, 5);
    expect(t[1]![1]).toBeLessThanOrEqual(1.4);
    expect(t[2]![0]).toBeCloseTo(1.4, 5);
    // "1컵까지요" 는 '까지요' 글자로 이어진다
    expect(t[3]![1]).toBeCloseTo(2.6, 5);
  });

  it('받아쓴 글이 대본과 거의 다르면 믿지 않는다 (예전처럼 글자 수 비율로)', () => {
    expect(alignWords('재료는 그대로예요.', [w('음악', 0, 1), w('소리', 1, 2)])).toBeUndefined();
    expect(alignWords('재료는 그대로예요.', [])).toBeUndefined();
  });

  it('시간이 없는 낱말(NaN)은 건너뛴다', () => {
    const t = alignWords('섞는 타이밍만 바꿔요', [w('섞는', 0, 0.3), w('타이밍만', Number.NaN, Number.NaN), w('바꿔요', 0.9, 1.3)])!;
    expect(t[0]).toEqual([0, 0.3]);
    expect(t[1]![0]).toBeCloseTo(0.3, 6);
    expect(t[1]![1]).toBeCloseTo(0.9, 6);
    expect(t[2]).toEqual([0.9, 1.3]);
  });
});

describe('어절 시작을 실제 쉼에 맞추기', () => {
  it('받아쓰기가 쉼을 다음 낱말에 붙였으면(쉼 안에서 시작) 쉼이 끝나는 곳으로 옮긴다', () => {
    // 2026-11 견본(받아쓰기 small): "이희재의"가 1.72초에 시작한다고 했지만 실제 쉼은 1.76~1.98초
    const t = snapToSpeech([[0.84, 1.42], [1.42, 1.72], [1.72, 2.4], [2.4, 2.53]], [[1.76, 1.98]]);
    expect(t[2]![0]).toBeCloseTo(1.98, 5);
    expect(t[1]).toEqual([1.42, 1.72]);
    // 쉼 안에서 시작한 경우
    expect(snapToSpeech([[0, 0.5], [0.6, 1.2]], [[0.5, 0.8]])[1]![0]).toBeCloseTo(0.8, 5);
  });

  it('말줄임표 같은 긴 쉼: 받아쓰기가 앞 낱말 꼬리를 붙였어도 쉼 뒤에서 시작한다', () => {
    // "넣었는데… 데치기를": 받아쓰기는 "데치기를"이 1.70초에 시작한다고 했지만 실제로는 쉼(2.07~2.95) 뒤
    const t = snapToSpeech([[1.02, 1.7], [1.7, 3.46], [3.46, 4.04]], [[2.07, 2.95]]);
    expect(t[1]![0]).toBeCloseTo(2.95, 5);
    // 받아쓰기가 없을 때 어림도 같은 쉼에 맞춘다 (말이 늘어져 어림 시각이 쉼보다 앞서도)
    const e = estimateWords('설탕은 듬뿍 넣었는데… 데치기를 건너뛴 게 문제일까요?', 0.01, 5.09, [[2.07, 2.95]]);
    expect(e[3]![0]).toBeCloseTo(2.95, 5);
  });

  it('어절 한가운데의 짧은 끊김(된소리 막힘 등)으로는 옮기지 않는다', () => {
    expect(snapToSpeech([[0, 1.2]], [[0.55, 0.68]])).toEqual([[0, 1.2]]);
  });

  it('받아쓰기가 없을 때: 문장 끝을 실제 쉼과 짝지어 나눈다 (예전 글자 수 비율은 쉼 뒤 첫 어절이 0.3~0.5초 일렀다)', () => {
    // "잠깐! 청국장덮밥, 이렇게 하면 안 돼요!" 실제 음성: 말소리 0.03~2.87초, 쉼 0.48~0.77 / 1.34~1.47(된소리 막힘) / 1.57~1.81
    const line = '잠깐! 청국장덮밥, 이렇게 하면 안 돼요!';
    const t = estimateWords(line, 0.03, 2.87, [[0.48, 0.77], [1.34, 1.47], [1.57, 1.81]]);
    expect(t).toHaveLength(6);
    expect(t[0]![0]).toBeCloseTo(0.03, 5);
    expect(t[1]![0]).toBeCloseTo(0.77, 5);
    expect(t[2]![0]).toBeCloseTo(1.81, 5);
    for (let i = 1; i < t.length; i++) expect(t[i]![0]).toBeGreaterThan(t[i - 1]![0]);
    expect(t.at(-1)![1]).toBeCloseTo(2.87, 5);
  });

  it('쉼이 없으면 예전처럼 글자 수 비율로 나눈다', () => {
    const t = estimateWords('하나 둘셋넷', 0, 1, []);
    expect(t[0]![0]).toBe(0);
    expect(t[1]![0]).toBeCloseTo(2.6 / 6.2, 5);
    expect(t[1]![1]).toBeCloseTo(1, 5);
  });

  it('speechPauses: 0.12초 넘는 조용한 구간만 쉼으로 찾는다 (앞뒤 무음은 빼고)', () => {
    const rate = 16000;
    const tone = (sec: number) => Array.from({ length: Math.round(sec * rate) }, (_, i) => Math.round(8000 * Math.sin(i * 0.3)));
    const quiet = (sec: number) => new Array(Math.round(sec * rate)).fill(0);
    const pcm = Int16Array.from([...quiet(0.3), ...tone(0.5), ...quiet(0.25), ...tone(0.4), ...quiet(0.05), ...tone(0.3), ...quiet(0.4)]);
    const p = speechPauses(pcm, rate);
    expect(p).toHaveLength(1);
    expect(p[0]![0]).toBeCloseTo(0.8, 1);
    expect(p[0]![1]).toBeCloseTo(1.05, 1);
  });
});
