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

const { checkVoiceLines, dishMustHear, startRender } = await import('./pipeline.ts');
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
    // 옛 파일을 직접 지우지 않고, tts의 같은 파일 잠금 안에서 다시 만들게 한다 (다른 작업이 읽는 중일 수 있다)
    expect(tts.synthesize).toHaveBeenCalledWith(line, expect.any(String), {}, { regenerate: true });
    expect(fs.existsSync(first.file)).toBe(true);
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

describe('발음을 고쳐 넘긴 낱말 (떫은맛·이희재) 다시 녹음', () => {
  const line = '호두를 찬물에 헹구면 떫은맛이 빠져요';
  const script: Script = { title: 't', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line }] };
  /** 같은 파일 이름에 새 녹음을 쓰는 가짜 synthesize (실제 tts처럼 바꿔치기) */
  const takes = (file: string) => {
    let n = 1;
    tts.synthesize.mockImplementation(async () => {
      fs.writeFileSync(file, `take${++n}`);
      return { file, seconds: 1 };
    });
  };

  it('안 들리면 다시 녹음하고, 들리면 멈춘다', async () => {
    const first = audio('hard1.mp3');
    fs.writeFileSync(first.file, 'take1');
    tts.cachedAudio.mockImplementation(() => first);
    takes(first.file);
    tts.transcribeAudio
      .mockImplementationOnce(async () => ({ text: '호두를 찬물에 헹구면 깔끔한 맛이 빠져요', words: [] }))
      .mockImplementationOnce(async () => ({ text: '호두를 찬물에 헹구면 떨분맛이 빠져요', words: [] }));
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa);
    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    expect(tts.synthesize).toHaveBeenCalledWith(line, expect.any(String), {}, { regenerate: true });
    expect(fs.readFileSync(first.file, 'utf8')).toBe('take2');
    expect(qa.fixed.join(' ')).toContain('"떫은맛" 발음이 또렷하지 않아서 다시 녹음했어요');
    expect(qa.issues).toEqual([]);
    expect(fs.existsSync(`${first.file}.keep.mp3`)).toBe(false);
  });

  it('끝까지 안 들리면 두 번까지만 다시 녹음하고, 가장 나은 녹음을 남기고, 꼭 들어 보라고 알린다', async () => {
    const first = audio('hard2.mp3');
    fs.writeFileSync(first.file, 'take1');
    tts.cachedAudio.mockImplementation(() => first);
    takes(first.file);
    tts.transcribeAudio
      .mockImplementationOnce(async () => ({ text: '호두를 찬물에 헹구면 깔끔한 맛이 빠져요', words: [] }))
      // 두 번째는 중간에 끊김 (더 나쁨), 세 번째는 일치율이 더 낮음
      .mockImplementationOnce(async () => ({ text: '호두를 찬물에', words: [] }))
      .mockImplementationOnce(async () => ({ text: '호두 찬물 같은 맛이 빠져', words: [] }));
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa);
    expect(tts.synthesize).toHaveBeenCalledTimes(2);
    // 첫 녹음이 가장 나았다 → 되돌린다
    expect(fs.readFileSync(first.file, 'utf8')).toBe('take1');
    expect(fs.existsSync(`${first.file}.keep.mp3`)).toBe(false);
    const msgs = qa.issues.map((i) => i.message);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('"떫은맛"이(가) 또렷하게 들리지 않아요 (3번 녹음해 봤어요');
    expect(qa.fixed).toEqual([]);
  });

  it('처음부터 잘 들리면 다시 녹음하지 않는다', async () => {
    const first = audio('hard3.mp3');
    tts.cachedAudio.mockImplementation(() => first);
    tts.transcribeAudio.mockImplementation(async () => ({ text: '호두를 찬물에 헹구면 떫은맛이 빠져요', words: [] }));
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa);
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(qa.issues).toEqual([]);
  });
});

describe('요리 이름·주재료 (문장 첫머리에서 또렷해야 하는 말)', () => {
  it('요리 이름과 첫 재료 이름의 마지막 낱말', () => {
    expect(dishMustHear({ dishName: '바삭한 김치전', ingredients: [{ name: '잘 익은 김치', amount: '200g' }] })).toEqual(['김치전', '김치']);
    expect(dishMustHear(SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!)).toEqual(['호두정과', '호두']);
    expect(dishMustHear({ dishName: '반숙 달걀', ingredients: [{ name: '물', amount: '1L' }] })).toEqual(['달걀']);
  });

  it('대사 첫머리의 주재료가 다르게 들리면 다시 녹음한다', async () => {
    const first = audio('dish1.mp3');
    fs.writeFileSync(first.file, 'take1');
    tts.cachedAudio.mockImplementation(() => first);
    let n = 1;
    tts.synthesize.mockImplementation(async () => {
      fs.writeFileSync(first.file, `take${++n}`);
      return first;
    });
    const line = '호두를 튀기기 전에 왜 먼저 데칠까요?';
    tts.transcribeAudio
      .mockImplementationOnce(async () => ({ text: '코드를 튀기기 전에 왜 먼저 데칠까요?', words: [] }))
      .mockImplementationOnce(async () => ({ text: '호두를 튀기기 전에 왜 먼저 데칠까요?', words: [] }));
    const qa: RenderQa = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines({ title: 't', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line }] }, qa, () => false, ['호두정과', '호두']);
    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    expect(qa.fixed.join(' ')).toContain('"호두" 발음이 또렷하지 않아서 다시 녹음했어요');
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
