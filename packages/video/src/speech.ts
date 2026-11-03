/** 음성 파일의 말소리 구간 찾기 (순수 함수, 브라우저·테스트에서도 사용 가능) */
const RATE = 16000;

export interface SpeechBounds {
  /** 말이 시작되는 시각(초) */
  start: number;
  /** 말이 끝나는 시각(초) */
  end: number;
  /** 들리는 소리가 전혀 없음 (빈 음성 파일) */
  silent: boolean;
}

/**
 * 10ms 단위 음량으로 말소리 구간을 찾는다.
 * 앞은 0.03초, 뒤는 0.08초 여유를 둬서 숨소리·끝소리가 잘리지 않게 한다.
 */
export function speechBounds(pcm: Int16Array, rate = RATE, thresholdDb = -42): SpeechBounds {
  const win = Math.round(rate * 0.01);
  const total = pcm.length / rate;
  let first = -1;
  let last = -1;
  for (let i = 0, w = 0; i + win <= pcm.length; i += win, w++) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j]! * pcm[j]!;
    const db = 20 * Math.log10(Math.sqrt(sum / win) / 32768 + 1e-9);
    if (db > thresholdDb) {
      if (first === -1) first = w;
      last = w;
    }
  }
  if (first === -1) return { start: 0, end: total, silent: true };
  return { start: Math.max(0, first * 0.01 - 0.03), end: Math.min(total, (last + 1) * 0.01 + 0.08), silent: false };
}

