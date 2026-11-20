/**
 * 입 모양을 실제 목소리 크기에 맞추기 (순수 함수, 브라우저·테스트에서도 사용).
 *
 * 예전에는 말하는 구간 내내 일정한 파형(초당 약 6번)으로 입을 움직여서, 문장 사이 쉼에도 입이 움직이고
 * 음절과도 맞지 않았다. 만화 캐릭터 입 맞추기에서 흔히 쓰는 방법대로 소리 크기(RMS)를 0~1로 바꿔 입 벌림에 쓴다
 * (Live2D Cubism SDK의 립싱크: 음량 RMS → 입 벌림 값, 닫힐 때는 부드럽게).
 *
 * 저장 형식: 프레임마다 한 글자 '0'~'9' (음성 파일 맨 앞부터, FPS 기준). 1분 영상이 1800자라 타임라인에 그대로 넣는다.
 */

/** 이보다 작은 소리는 입을 닫는다 (말소리 판정 기준과 같다: speech.ts SPEECH_THRESHOLD_DB) */
const FLOOR_DB = -42;
/** 닫힐 때 프레임마다 남기는 비율 (열릴 때는 바로 연다: 자음이 터지는 순간을 놓치지 않게) */
const RELEASE = 0.55;

/**
 * 16kHz 모노 PCM → 프레임별 입 벌림 글자열.
 * 크게 말한 부분(상위 5%)을 다 벌림(9)으로 맞춰, 음성 파일마다 음량이 달라도 입 크기는 비슷하다.
 */
export function mouthTrack(pcm: Int16Array, rate: number, fps: number): string {
  const per = rate / fps;
  const frames = Math.floor(pcm.length / per);
  const db: number[] = [];
  for (let f = 0; f < frames; f++) {
    const a = Math.round(f * per);
    const b = Math.min(pcm.length, Math.round((f + 1) * per));
    let sum = 0;
    for (let i = a; i < b; i++) sum += pcm[i]! * pcm[i]!;
    db.push(20 * Math.log10(Math.sqrt(sum / Math.max(1, b - a)) / 32768 + 1e-9));
  }
  const voiced = db.filter((v) => v > FLOOR_DB).sort((x, y) => x - y);
  if (!voiced.length) return '0'.repeat(frames);
  const peak = Math.max(FLOOR_DB + 6, voiced[Math.floor((voiced.length - 1) * 0.95)]!);
  let prev = 0;
  let out = '';
  for (const v of db) {
    const raw = Math.max(0, Math.min(1, (v - FLOOR_DB) / (peak - FLOOR_DB)));
    prev = Math.max(raw, prev * RELEASE);
    out += String(Math.round(prev * 9));
  }
  return out;
}

/** 프레임의 입 벌림 (0~1). 기록이 없으면 undefined (그때는 예전처럼 일정한 파형으로 움직인다) */
export function mouthAt(track: string | undefined, frame: number): number | undefined {
  if (track === undefined) return undefined;
  const f = Math.floor(frame);
  if (f < 0 || f >= track.length) return 0;
  return Number(track[f]) / 9;
}
