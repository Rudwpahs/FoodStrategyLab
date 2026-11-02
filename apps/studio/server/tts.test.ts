import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cachedAudio, resetTtsDetection, synthesize, ttsProvider } from './tts.ts';

// 가짜 VoiceStudio: MPEG2 Layer III 24kHz 48kbps 프레임 50개 = 1.2초
const frame = Buffer.alloc(144);
frame.set([0xff, 0xf3, 0x64, 0xc4]);
const mp3 = Buffer.concat(Array.from({ length: 50 }, () => frame));

const requests: Record<string, unknown>[] = [];
let server: http.Server;
const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-test-'));

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/health') return res.end('ok');
    if (req.url === '/v1/audio/speech' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        requests.push(JSON.parse(body));
        res.setHeader('content-type', 'audio/mpeg');
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
  process.env.VOICESTUDIO_VOICE = '맛조수';
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
    expect(requests[0]).toMatchObject({ voice: '맛조수', language: 'ko', response_format: 'mp3', input: '이희재의 맛 연구소에서 오늘도 실험!' });
  });

  it('같은 문장은 캐시를 써서 다시 요청하지 않는다', async () => {
    const before = requests.length;
    await synthesize('이희재의 맛 연구소에서 오늘도 실험!', audioDir);
    expect(requests.length).toBe(before);
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, 'voicestudio')).not.toBeNull();
    expect(cachedAudio('이희재의 맛 연구소에서 오늘도 실험!', audioDir, 'edge')).toBeNull();
  });
});
