import './testDataDir.ts';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_RECIPES, generateTemplateScript, type Script } from '@mat-lab/recipe-core';
import { DATA_DIR } from './config.ts';

/** 음성 도구를 가짜로 바꿔, 받아쓰기 대조·음성 도구 바뀜을 시험한다 */
const tts = vi.hoisted(() => ({
  ttsProvider: vi.fn(async () => 'voicestudio'),
  voiceIdentity: vi.fn(async () => 'fake-voice'),
  cachedAudio: vi.fn((): { file: string; seconds: number } | null => null),
  transcribeAudio: vi.fn(async (): Promise<{ text: string; words: [] } | undefined> => undefined),
  synthesize: vi.fn(async (): Promise<{ file: string; seconds: number }> => ({ file: '', seconds: 1 })),
  measuredWords: vi.fn(async () => undefined),
}));
vi.mock('./tts.ts', () => tts);

const { checkVoiceLines, startRender } = await import('./pipeline.ts');
const { openDb } = await import('./db.ts');
const { Repo } = await import('./repo.ts');
type RenderDeps = import('./pipeline.ts').RenderDeps;
type RenderQa = import('./repo.ts').RenderQa;

const audio = (name: string) => {
  const file = path.join(DATA_DIR, 'audio', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'fake mp3');
  return { file, seconds: 1 };
};

beforeEach(() => {
  vi.clearAllMocks();
  tts.cachedAudio.mockImplementation(() => null);
  tts.transcribeAudio.mockImplementation(async () => undefined);
});

describe('받아쓰기로 대사 대조', () => {
  const line = '호두를 찬물에 헹구면 떫은맛이 빠져요';
  const script: Script = { title: 't', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line }] };

  it('끊긴 음성을 다시 만들었는데 받아쓰기를 못 하면, 옛 판정(끊김 오류)을 붙이지 않고 확인 못 했다고 남긴다', async () => {
    const first = audio('first.mp3');
    tts.cachedAudio.mockImplementation(() => first);
    tts.synthesize.mockImplementation(async () => audio('again.mp3'));
    // 처음 음성은 대사 앞부분만 들림 → 다시 만든 음성은 받아쓰기 실패
    tts.transcribeAudio.mockImplementationOnce(async () => ({ text: '호두를 찬물에', words: [] })).mockImplementationOnce(async () => undefined);
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa);
    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    expect(qa.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(qa.issues.map((i) => i.message).join(' ')).toContain('확인하지 못했어요');
  });

  it('다시 만들어도 끊겨 들리면 오류로 남긴다', async () => {
    tts.cachedAudio.mockImplementation(() => audio('first.mp3'));
    tts.synthesize.mockImplementation(async () => audio('again.mp3'));
    tts.transcribeAudio.mockImplementation(async () => ({ text: '호두를 찬물에', words: [] }));
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa);
    expect(qa.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ')).toContain('끊겨요');
  });
});

describe('음성 도구가 바뀐 경우', () => {
  it("'auto'에서 VoiceStudio 대신 edge-tts로 만들었으면 영상 검사 결과에 알린다", async () => {
    tts.ttsProvider.mockImplementation(async () => 'edge');
    tts.synthesize.mockImplementation(async () => audio('edge.mp3'));
    const repo = new Repo(openDb(':memory:'));
    const pid = repo.createProject(SAMPLE_RECIPES[1]);
    repo.addScriptVersion(pid, generateTemplateScript(repo.getRecipe(pid)), 'template');
    const renderer = (async () => ({
      getServeUrl: async () => 'fake',
      makeCancelSignal: () => ({ cancelSignal: () => undefined, cancel: () => undefined }),
      renderVideo: async (o: { outputLocation: string }) => fs.writeFileSync(o.outputLocation, 'fake mp4'),
      renderStillImage: async (_id: string, _p: unknown, out: string) => fs.writeFileSync(out, 'fake png'),
    })) as unknown as RenderDeps['renderer'];
    const audit: RenderDeps['audit'] = async () => ({ issues: [], checked: [] });
    const rid = startRender(repo, pid, 'http://127.0.0.1:1', undefined, { renderer, audit });
    for (let i = 0; i < 500 && repo.getRender(rid).status !== 'done' && repo.getRender(rid).status !== 'failed'; i++) await new Promise((r) => setTimeout(r, 10));
    const r = repo.getRender(rid);
    expect(r.status).toBe('done');
    expect(r.qa!.issues.map((i) => i.message).join(' ')).toContain('edge-tts');
  });
});
