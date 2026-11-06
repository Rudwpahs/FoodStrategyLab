import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cachedAudio, measuredWords, resetTtsDetection, synthesize, ttsProvider, voiceIdentity, voicestudioVoice } from './tts.ts';
import { createDesignedVoice, findVoiceStudio, listProfiles, writeVoiceSettings } from './voicestudio.ts';

// 가짜 VoiceStudio: MPEG2 Layer III 24kHz 48kbps 프레임 50개 = 1.2초
const frame = Buffer.alloc(144);
frame.set([0xff, 0xf3, 0x64, 0xc4]);
const mp3 = Buffer.concat(Array.from({ length: 50 }, () => frame));

const requests: Record<string, unknown>[] = [];
let busyTimes = 0;
const profiles: { id: number; name: string; kind: string }[] = [{ id: 1, name: 'default', kind: 'design' }];
let designBody = '';
let engines = [{ id: 'omnivoice', available: true }, { id: 'voxcpm2', available: true }, { id: 'moss-tts-nano', available: false }];
let starting = false;
let server: http.Server;
const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-test-'));

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const json = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (req.url === '/health') return starting ? json(503, { status: 'starting', version: '9.9' }) : json(200, { status: 'ok', version: '9.9' });
    if (req.url === '/profiles' && req.method === 'GET') return json(200, profiles);
    if (req.url === '/engines/tts') return json(200, { active: 'omnivoice', backends: engines });
    if (req.url === '/design/describe' && req.method === 'POST') {
      req.resume();
      req.on('end', () => json(200, { attrs: { Gender: 'female', Age: 'young adult', Pitch: 'high pitch', Style: 'Auto', EnglishAccent: 'Auto', ChineseDialect: 'Auto' } }));
      return;
    }
    if (req.url === '/profiles' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        designBody = body;
        const p = { id: profiles.length + 1, name: '맛조수', kind: 'design' };
        profiles.push(p);
        json(200, p);
      });
      return;
    }
    if (req.url === '/v1/audio/transcriptions' && req.method === 'POST') {
      req.resume();
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ text: '이희재의 맛 연구소에서 오늘도 실험!', words: [{ word: '이희재의', start: 0.1, end: 0.5 }, { word: '맛', start: 0.5, end: 0.7 }, { word: '연구소에서', start: 0.7, end: 1.2 }, { word: '오늘도', start: 1.2, end: 1.5 }, { word: '실험!', start: 1.5, end: 1.9 }] }));
      });
      return;
    }
    if (req.url === '/v1/audio/speech' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const parsed = JSON.parse(body);
        if (busyTimes > 0) {
          busyTimes--;
          json(429, { error: { message: 'worker pool is saturated, safe to retry' } });
          return;
        }
        requests.push(parsed);
        res.setHeader('content-type', parsed.response_format === 'wav' ? 'audio/wav' : 'audio/mpeg');
        res.end(mp3);
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  process.env.VOICESTUDIO_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  writeVoiceSettings({ voicestudioVoice: 'default' });
  process.env.TTS_PROVIDER = 'auto';
  resetTtsDetection();
});

afterAll(() => {
  server.close();
  process.env.TTS_PROVIDER = 'none';
  delete process.env.VOICESTUDIO_URL;
  resetTtsDetection();
});

describe('VoiceStudio 음성', () => {
  it('켜져 있으면 자동으로 VoiceStudio를 쓰고, 한국어로 요청한다', async () => {
    expect(await ttsProvider()).toBe('voicestudio');
    const a = await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    expect(a.seconds).toBeCloseTo(1.2, 5);
    // 비상업 OmniVoice가 활성이어도 상업 이용 가능한 VoxCPM2로 요청한다
    expect(requests[0]).toMatchObject({ model: 'voxcpm2', voice: 'default', language: 'ko', response_format: 'mp3', input: '이희재의 맛 연구소에서 오늘도 실험!' });
  });

  it('받아쓰기로 어절별 실제 시간을 잰다 (어절 수가 맞을 때만)', async () => {
    const a = await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    const words = await measuredWords(a.file, '이희재의 맛 연구소에서 오늘도 실험!');
    expect(words).toEqual([[0.1, 0.5], [0.5, 0.7], [0.7, 1.2], [1.2, 1.5], [1.5, 1.9]]);
    const b = await synthesize('다른 문장', audioDir);
    expect(await measuredWords(b.file, '다른 문장')).toBeUndefined();
  });

  it('맛조수 목소리를 디자인으로 만들고, 고른 목소리로 음성을 만든다', async () => {
    const vs = await findVoiceStudio();
    expect(vs.state).toBe('ok');
    if (vs.state !== 'ok') return;
    const made = await createDesignedVoice(vs.url, '맛조수');
    expect(made.name).toBe('맛조수');
    // VoxCPM2 목소리 디자인으로 기준 녹음을 만들고, 복제 프로필로 저장
    expect(requests.at(-1)).toMatchObject({ model: 'voxcpm2', response_format: 'wav' });
    expect(String((requests.at(-1) as { description: string }).description)).toContain('high pitch');
    expect(designBody).toContain('clone');
    expect(designBody).toContain('matjosu-reference.wav');
    expect((await listProfiles(vs.url)).map((p) => p.name)).toContain('맛조수');
    writeVoiceSettings({ voicestudioVoice: '맛조수' });
    expect(voicestudioVoice()).toBe('맛조수');
    await synthesize('맛조수 목소리 시험', audioDir);
    expect(requests.at(-1)).toMatchObject({ voice: '맛조수', input: '맛조수 목소리 시험' });
  });

  it('같은 이름으로 목소리를 다시 만들면 예전 음성을 다시 쓰지 않는다', async () => {
    writeVoiceSettings({ voicestudioVoice: '맛조수' });
    await synthesize('다시 만든 목소리 시험', audioDir);
    const before = requests.length;
    // 같은 이름, 새 프로필 (VoiceStudio에서 지우고 다시 만든 경우)
    const i = profiles.findIndex((p) => p.name === '맛조수');
    profiles.splice(i, 1, { id: 99, name: '맛조수', kind: 'clone' });
    await synthesize('다시 만든 목소리 시험', audioDir);
    expect(requests.length).toBe(before + 1);
  });

  it('쓰는 엔진이 바뀌면 음성을 새로 만든다', async () => {
    await synthesize('엔진 바뀜 시험', audioDir);
    const before = requests.length;
    engines = [{ id: 'omnivoice', available: true }, { id: 'voxcpm2', available: false }, { id: 'moss-tts-nano', available: true }];
    await synthesize('엔진 바뀜 시험', audioDir);
    expect(requests.length).toBe(before + 1);
    expect(requests.at(-1)).toMatchObject({ model: 'moss-tts-nano' });
    engines = [{ id: 'omnivoice', available: true }, { id: 'voxcpm2', available: true }, { id: 'moss-tts-nano', available: false }];
  });

  it('앱이 준비 중이면 starting으로 알려준다', async () => {
    starting = true;
    expect((await findVoiceStudio()).state).toBe('starting');
    starting = false;
  });

  it('VoiceStudio가 바쁘면(429) 기다렸다가 다시 요청한다', async () => {
    process.env.VOICESTUDIO_RETRY_MS = '20';
    busyTimes = 2;
    const before = requests.length;
    const a = await synthesize('바쁠 때 다시 시도하는 문장', audioDir);
    expect(fs.existsSync(a.file)).toBe(true);
    expect(requests.length).toBe(before + 1);
    expect(busyTimes).toBe(0);
  });

  it('같은 문장은 캐시를 써서 다시 요청하지 않는다', async () => {
    await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    const before = requests.length;
    await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    expect(requests.length).toBe(before);
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, await voiceIdentity('voicestudio'))).not.toBeNull();
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, await voiceIdentity('edge'))).toBeNull();
  });
});

describe('목소리 고르기 · 말 빠르기', () => {
  it('목록의 기본 목소리 이름은 예전 맛조수 이름과 같다 (이미 만든 음성을 그대로 쓴다)', async () => {
    const { voicePresets } = await import('./voicePresets.ts');
    const { MASCOT_REFERENCE_FILE, mascotVoiceName } = await import('./voicestudio.ts');
    const first = voicePresets()[0]!;
    expect(first.id).toBe('matjosu');
    expect(first.voiceName).toBe(mascotVoiceName(fs.readFileSync(MASCOT_REFERENCE_FILE)));
  });

  it('목록에 있는 목소리가 VoiceStudio에 없으면 기준 녹음으로 먼저 만들고, 그 목소리로 요청한다', async () => {
    const { voicePresets } = await import('./voicePresets.ts');
    const p = voicePresets()[0]!;
    designBody = '';
    await synthesize('목록 목소리 시험 문장', audioDir, { voice: p.voiceName });
    expect(designBody).toContain(p.voiceName);
    expect(designBody).toContain('clone');
    expect(requests.at(-1)).toMatchObject({ voice: p.voiceName, input: '목록 목소리 시험 문장' });
  });

  it('보통 빠르기는 예전과 같은 음성 이름, 다른 빠르기는 따로 저장한다', async () => {
    writeVoiceSettings({ voicestudioVoice: 'default', tempo: 1 });
    const normal = await voiceIdentity('voicestudio');
    expect(normal).not.toContain('tempo');
    writeVoiceSettings({ tempo: 1.1 });
    const faster = await voiceIdentity('voicestudio');
    expect(faster).toContain('tempo1.1');
    // 목록에 없는 값은 보통으로
    writeVoiceSettings({ tempo: 3 });
    expect(await voiceIdentity('voicestudio')).toBe(normal);
    writeVoiceSettings({ tempo: 1 });
  });
});

describe('말 빠르기 바꾸기 (ffmpeg)', () => {
  it('2배 빠르게 하면 길이가 절반이 된다', async () => {
    const { changeTempo } = await import('@mat-lab/video/audio');
    // 1초짜리 소리 (16kHz, 16비트 모노 WAV)
    const rate = 16000;
    const pcm = Buffer.alloc(rate * 2);
    for (let i = 0; i < rate; i++) pcm.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), i * 2);
    const head = Buffer.alloc(44);
    head.write('RIFF', 0);
    head.writeUInt32LE(36 + pcm.length, 4);
    head.write('WAVEfmt ', 8);
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22);
    head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2, 28);
    head.writeUInt16LE(2, 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36);
    head.writeUInt32LE(pcm.length, 40);
    const input = path.join(audioDir, 'tone.wav');
    const output = path.join(audioDir, 'tone-fast.mp3');
    fs.writeFileSync(input, Buffer.concat([head, pcm]));
    await changeTempo(input, output, 2);
    const { mp3DurationSeconds } = await import('./tts.ts');
    expect(mp3DurationSeconds(fs.readFileSync(output))).toBeGreaterThan(0.4);
    expect(mp3DurationSeconds(fs.readFileSync(output))).toBeLessThan(0.65);
  });
});
