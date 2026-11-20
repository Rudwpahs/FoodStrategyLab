/** 음성 파일의 말소리 구간 찾기 (순수 함수, 브라우저·테스트에서도 사용 가능) */
const RATE = 16000;
/** 10ms 칸 소리가 이보다 크면 말소리 (자동 품질 검사의 '대사 잘림' 기준도 이 값에 맞춰져 있다: qa.ts) */
export const SPEECH_THRESHOLD_DB = -42;

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
export function speechBounds(pcm: Int16Array, rate = RATE, thresholdDb = SPEECH_THRESHOLD_DB): SpeechBounds {
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

/**
 * 말소리 사이의 쉼 [시작, 끝] (초). 10ms 칸 음량이 기준보다 작은 구간이 minGap초 넘게 이어지면 쉼으로 본다.
 * 문장·쉼표 사이의 숨 고르기를 찾아 자막 어절 시간을 다듬는 데 쓴다 (wordAlign.ts snapToSpeech).
 */
export function speechPauses(pcm: Int16Array, rate = RATE, minGap = 0.12, thresholdDb = SPEECH_THRESHOLD_DB): [number, number][] {
  const win = Math.round(rate * 0.01);
  const loud: boolean[] = [];
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j]! * pcm[j]!;
    loud.push(20 * Math.log10(Math.sqrt(sum / win) / 32768 + 1e-9) > thresholdDb);
  }
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  const out: [number, number][] = [];
  if (first === -1) return out;
  let gapStart = -1;
  for (let w = first; w <= last; w++) {
    if (!loud[w]) {
      if (gapStart === -1) gapStart = w;
    } else if (gapStart !== -1) {
      if ((w - gapStart) * 0.01 >= minGap) out.push([gapStart * 0.01, w * 0.01]);
      gapStart = -1;
    }
  }
  return out;
}
