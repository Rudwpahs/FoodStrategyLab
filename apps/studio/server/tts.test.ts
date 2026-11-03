import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cachedAudio, measuredWords, resetTtsDetection, synthesize, ttsProvider, voicestudioVoice } from './tts.ts';
import { createDesignedVoice, findVoiceStudio, listProfiles, writeVoiceSettings } from './voicestudio.ts';

// 가짜 VoiceStudio: MPEG2 Layer III 24kHz 48kbps 프레임 50개 = 1.2초
const frame = Buffer.alloc(144);
frame.set([0xff, 0xf3, 0x64, 0xc4]);
const mp3 = Buffer.concat(Array.from({ length: 50 }, () => frame));

const requests: Record<string, unknown>[] = [];
const profiles: { id: number; name: string; kind: string }[] = [{ id: 1, name: 'default', kind: 'design' }];
let designBody = '';
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
    if (req.url === '/engines/tts') return json(200, { active: 'omnivoice', backends: [{ id: 'omnivoice', available: true }, { id: 'voxcpm2', available: true }] });
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

  it('앱이 준비 중이면 starting으로 알려준다', async () => {
    starting = true;
    expect((await findVoiceStudio()).state).toBe('starting');
    starting = false;
  });

  it('같은 문장은 캐시를 써서 다시 요청하지 않는다', async () => {
    await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    const before = requests.length;
    await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    expect(requests.length).toBe(before);
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, 'voicestudio')).not.toBeNull();
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, 'edge')).toBeNull();
  });
});
