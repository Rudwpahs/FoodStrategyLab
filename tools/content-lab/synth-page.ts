/**
 * 노트 넘기는 소리 합성 → packages/video/assets/sfx/page.wav (외부 음원 없음, 이 저장소의 코드로 만든다)
 * 실행: npx tsx tools/content-lab/synth-page.ts && npx tsx tools/content-lab/embed-sfx.ts
 *
 * 종이 한 장을 넘기는 소리를 세 겹으로 만든다 (고정 씨앗 난수라 매번 같은 소리, 0.5초):
 * 1. 사각: 종이가 공기를 가르며 스치는 소리. 걸러진 잡음이 점점 커지다가(장이 빨라진다) 탁 소리와 함께 멈춘다
 * 2. 바스락: 종이 면이 부딪치는 작은 딸깍임들. 사각 소리가 클수록 촘촘하다 (매끈한 '쉬익'이 아니라 종이처럼 들리게)
 * 3. 탁: 장이 내려앉는 짧고 낮은 소리. 0.255초 = 약 8프레임 뒤: 영상은 장면 시작 6프레임 앞에서 이 소리를 틀어(hostCues.ts PAGE_TURN_OFFSET)
 *    사각 소리는 목소리 전 쉼에, '탁'은 노트 카드가 나타나는 때에 온다
 * 귀로 들어 보지 못하므로 장 넘김 참고 녹음(Freesound CC0 5개, 비교용으로만 내려받고 저장소에 넣지 않음)과 같은 잣대로 재어 맞췄다:
 * 마루비(최고점÷평균) 19dB (참고 19~25dB), 소리 대부분 500Hz~4kHz, 1ms 크기 들쭉날쭉함 0.40 (참고 0.26~0.31, 조금 더 바스락).
 * 150Hz 아래(참고 녹음에 많은 손 잡음·울림)는 빼서 목소리 밑에서 웅웅거리지 않게 했다. 영상 속 크기는 hostCues.ts PAGE_TURN_VOLUME.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seeded } from '../../packages/video/src/random.ts';

const RATE = 22050;
const LENGTH = 0.5;
const FLAP_AT = 0.255;
/** 최대 -1dBFS (다른 효과음과 같은 기준, 실제 크기는 영상에서 볼륨으로 줄인다) */
const PEAK = 0.89;

/** RBJ 쌍2차 필터 (대역통과·고역통과·저역통과). 계수는 바꿔 가며 쓸 수 있다 */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  set(kind: 'band' | 'high' | 'low', freq: number, q: number): this {
    const w = (2 * Math.PI * freq) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (kind === 'band') [this.b0, this.b1, this.b2] = [alpha, 0, -alpha];
    else if (kind === 'high') [this.b0, this.b1, this.b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [this.b0, this.b1, this.b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    [this.b0, this.b1, this.b2, this.a1, this.a2] = [this.b0 / a0, this.b1 / a0, this.b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
    return this;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    [this.x2, this.x1, this.y2, this.y1] = [this.x1, x, this.y1, y];
    return y;
  }
}

const smooth = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export function synthPage(): Float32Array {
  const n = Math.round(LENGTH * RATE);
  const out = new Float32Array(n);
  const rnd = seeded(20261122);
  const noise = () => rnd() * 2 - 1;

  // 1. 사각 (0.02~0.26초): 점점 커지다가(장이 빨라진다) 탁 소리와 함께 멈춘다
  const swishEnv = (t: number) => Math.min(1, Math.max(0, (t - 0.02) / 0.21)) ** 1.6 * (1 - smooth(0.225, 0.262, t));
  const swish = new Biquad();
  const swishHi = new Biquad().set('high', 400, 0.7);
  // 종이가 휘며 생기는 느린 떨림 (고정 씨앗의 부드러운 잡음, 약 30Hz)
  const flutterKnots = Array.from({ length: 24 }, () => rnd());
  const flutter = (t: number) => {
    const k = t * 30;
    const i = Math.floor(k);
    const f = k - i;
    const a = flutterKnots[i % 24]!;
    const b = flutterKnots[(i + 1) % 24]!;
    return a + (b - a) * (f * f * (3 - 2 * f));
  };

  // 2. 바스락: 크기가 들쭉날쭉한 짧은 딸깍임들
  const crackle = new Float32Array(n);
  const crackleMid = new Biquad().set('band', 1700, 0.5);
  const crackleTop = new Biquad().set('high', 3500, 0.7);
  let tail = 0;
  let amp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // 처음 장을 집을 때 몇 번, 넘어가는 동안 촘촘히, 내려앉은 뒤 잠깐
    const rate = 30 + 900 * swishEnv(t) + (t < 0.06 ? 180 : 0) + (t > FLAP_AT ? 250 * Math.exp(-(t - FLAP_AT) / 0.05) : 0);
    if (rnd() < rate / RATE) {
      const r = rnd();
      amp = 0.25 + 0.75 * r * r;
      tail = 1;
    }
    const grain = noise() * amp * tail;
    crackle[i] = crackleMid.run(grain) + 0.45 * crackleTop.run(grain);
    tail *= Math.exp(-1 / (RATE * 0.0014));
  }

  // 3. 탁: 장이 내려앉는 소리 (두 번째 작은 튕김 포함)
  const flapBand = new Biquad().set('band', 480, 0.7);
  const flapLow = new Biquad().set('low', 2600, 0.7);
  const flapEnv = (t: number) => {
    const hit = (at: number, decay: number) => (t < at ? 0 : Math.min(1, (t - at) / 0.002) * Math.exp(-(t - at) / decay));
    return hit(FLAP_AT, 0.028) + 0.35 * hit(FLAP_AT + 0.038, 0.018);
  };

  const hp = [new Biquad().set('high', 160, 0.7), new Biquad().set('high', 160, 0.7)];
  const lp = new Biquad().set('low', 7000, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    if (i % 32 === 0) {
      // 거르는 높이: 700Hz → 1.9kHz → 1kHz (종이가 빠르게 지나갈 때 높아진다)
      const sweep = 700 + 1200 * Math.sin(Math.PI * Math.min(1, t / 0.24)) ** 2 - 400 * smooth(0.14, 0.26, t);
      swish.set('band', sweep, 0.8);
    }
    const s = swishHi.run(swish.run(noise())) * swishEnv(t) * (0.55 + 0.9 * flutter(t));
    const c = crackle[i]! * (0.3 + 0.7 * swishEnv(t) + 0.5 * flapEnv(t));
    const f = flapLow.run(flapBand.run(noise())) * flapEnv(t);
    let v = 0.45 * s + 1.3 * c + 2.4 * f;
    v = lp.run(hp[1]!.run(hp[0]!.run(v)));
    out[i] = v;
  }
  // 끝 40ms는 서서히 줄여 뚝 끊기지 않게
  const fade = Math.round(RATE * 0.04);
  for (let i = 0; i < fade; i++) out[n - 1 - i]! *= i / fade;
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (let i = 0; i < n; i++) out[i]! *= PEAK / peak;
  return out;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const file = process.argv[2] ?? path.join(root, 'packages/video/assets/sfx/page.wav');
  const samples = synthPage();
  fs.writeFileSync(file, wav(samples));
  console.log(`노트 넘기는 소리 ${(samples.length / RATE).toFixed(2)}초 → ${path.relative(root, file)}`);
}
