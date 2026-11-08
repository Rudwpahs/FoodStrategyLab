import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFreshCache, removeAudioWithCache, writeCache } from './audio.ts';

describe('음성 분석 결과 저장 (대사 끝 잘림 방지)', () => {
  it('음성 파일이 다시 만들어지면(크기·시각이 다르면) 옛 길이를 쓰지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const file = path.join(dir, 'line.mp3');
    const cache = `${file}.bounds3.json`;
    // 처음 만든 음성이 비어 있었던 경우: 짧은 길이가 저장됨
    fs.writeFileSync(file, Buffer.alloc(1000, 0));
    writeCache(cache, file, { start: 0, end: 4.2, silent: true });
    expect(readFreshCache(cache, file)).toEqual({ start: 0, end: 4.2, silent: true });
    // 빈 음성을 지우고 같은 이름으로 다시 만듦
    removeAudioWithCache(file);
    expect(fs.existsSync(cache)).toBe(false);
    fs.writeFileSync(file, Buffer.alloc(3000, 1));
    expect(readFreshCache(cache, file)).toBeUndefined();
    // 지우지 않고 덮어써도 크기가 다르면 옛 결과를 쓰지 않는다
    writeCache(cache, file, { start: 0, end: 5.5, silent: false });
    await new Promise((r) => setTimeout(r, 15));
    fs.writeFileSync(file, Buffer.alloc(2000, 2));
    expect(readFreshCache(cache, file)).toBeUndefined();
    // 예전 형식(크기·시각 없이 저장한 파일)도 믿지 않는다
    fs.writeFileSync(cache, JSON.stringify({ start: 0, end: 4.2, silent: false }));
    expect(readFreshCache(cache, file)).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
