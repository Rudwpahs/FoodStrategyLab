// 맛조수 고정 동작·소리 확인: 첫 노트 카드 장면의 고글 동작 앞·중간·뒤 프레임을 실제 영상 화면(ShortVideo)으로 그려 한 장으로 붙이고(gesture.jpg),
// 그 구간을 소리와 함께 짧은 MP4로 만든다(gesture.mp4, 절반 크기). 동작·소리 자리를 바꾼 뒤 눈과 귀로 확인하는 용도.
// 사용: npx tsx tools/content-lab/goggleframes.ts <출력폴더> [목소리.wav]
// - 대본: 호두정과 '왜' 이야기 대본 (story.test.ts 견본과 같은 모양, 원리 장면이 노트 카드).
// - 목소리 WAV(16비트)를 주면 앞 장면·노트 장면의 목소리로 넣는다 (노트 넘기는 소리가 목소리 밑에 작게 깔리는지 듣기용. 예: tools/setup/matjosu-reference.wav)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { BRAND, SAMPLE_RECIPES, finalizeStory, formatIngredient, type StoryDraft } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from '@mat-lab/video/timeline';
import { openBrowser, renderMedia, renderStill, selectComposition, type ChromiumOptions } from '@remotion/renderer';
import { getServeUrl } from '@mat-lab/video/render';
import { GOGGLE_FRAMES, INSIGHT_FRAMES, goggleSceneIndex, goggleStart, pageTurnCues } from '../../packages/video/src/hostCues.ts';

const [outDir, voiceFile] = process.argv.slice(2);
if (!outDir) {
  console.error('사용: npx tsx tools/content-lab/goggleframes.ts <출력폴더> [목소리.wav]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const font = createRequire(import.meta.url).resolve('pretendard/dist/public/static/Pretendard-Bold.otf');

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const draft: StoryDraft = {
  title: '호두정과, 왜 굳이 데칠까',
  storyType: 'why',
  audience: 'hobby-learner',
  logline: '데치기 한 단계가 떫은맛을 잡는 이유를 선생님 노트로 짚는다',
  scenes: [
    { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'sizzle', place: 'kitchen', line: '호두정과, 왜 굳이 데칠까요?' },
    { beat: 'context', type: 'question', emotion: 'curious', place: 'pantry', line: '바로 조리면 편할 텐데, 정석은 데치기부터 시작해요.' },
    { beat: 'point', type: 'explain', emotion: 'curious', place: 'lab', line: '끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어든대요.', cardTitle: BRAND.notePhrase, cardItems: [walnut.principle] },
    { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'market', line: '호두 500g에 설탕, 물엿, 꿀을 준비해요.', cardTitle: '재료', cardItems: walnut.ingredients.map(formatIngredient) },
    { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '데치고, 말리고, 조리고, 140도 정도에서 튀겨요.', cardItems: walnut.steps.slice(0, 5) },
    { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: '떫은맛은 데치는 단계에서 잡혀요. 이희재의 맛 연구소였어요.' },
  ],
};
const story = finalizeStory(walnut, draft, 'goggle-check');
if (!('script' in story)) throw new Error(story.error);
const script = story.script;
const note = goggleSceneIndex(script);

// 목소리: 16비트 WAV 길이(초)를 머리에서 읽어 앞 장면·노트 장면에 넣는다
const voice = voiceFile ? fs.readFileSync(voiceFile) : null;
const voiceSeconds = voice ? voice.readUInt32LE(voice.indexOf('data') + 4) / voice.readUInt32LE(28) : 0;
const voiced = (i: number) => voice && (i === note || i === note - 1);
const timings = buildTimeline(
  script,
  script.scenes.map((_, i) => (voiced(i) ? voiceSeconds : null)),
  script.scenes.map((_, i) => (voiced(i) ? `data:audio/wav;base64,${voice!.toString('base64')}` : undefined)),
);
const t = timings[note]!;
const g0 = goggleStart(script, timings)!;
console.log(`노트 장면 ${note + 1}번 (${t.from}~${t.from + t.durationInFrames}프레임) · 노트 소리 ${pageTurnCues(script).map((c) => timings.find((x) => x.sceneId === c.sceneId)!.from + c.offset).join(', ')} · 고글 ${g0}~${g0 + GOGGLE_FRAMES}`);

const frames: [string, number][] = [
  ['before', t.from - 12],
  ['card', t.from + 3],
  ['start', g0],
  ['down', g0 + 4],
  ['on eyes', g0 + 8],
  ['peer', g0 + 12],
  ['up', g0 + 17],
  ['push', g0 + 20],
  ['settle', g0 + 23],
  ['done', g0 + GOGGLE_FRAMES + 4],
  ['cut', t.from + INSIGHT_FRAMES + 6],
  ['later', t.from + t.durationInFrames - 8],
];

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const chromiumOptions: ChromiumOptions = { gl: (process.env.REMOTION_GL as ChromiumOptions['gl']) ?? 'swangle' };
const serveUrl = await getServeUrl();
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });
const inputProps = { script, timings, reviewed: false, cleanDraft: true, recipe: walnut } satisfies VideoProps as unknown as Record<string, unknown>;
const composition = await selectComposition({ serveUrl, id: 'ShortVideo', inputProps, browserExecutable, chromiumOptions, puppeteerInstance: browser, logLevel: 'error' });

const tiles: string[] = [];
for (const [name, f] of frames) {
  const png = path.join(outDir, `f${f}.png`);
  const jpg = path.join(outDir, `f${f}.jpg`);
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, output: png, inputProps, browserExecutable, chromiumOptions, frame: f, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 120_000 });
  const label = `drawtext=fontfile=${font}:text='${name} ${f}':x=10:y=10:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', `scale=360:-1,${label}`, '-q:v', '3', jpg]);
  fs.rmSync(png);
  tiles.push(jpg);
  console.log(`${name} ${f} · ${Date.now() - t0}ms`);
}
// 6장씩 두 줄
const rows = [tiles.slice(0, 6), tiles.slice(6)];
const rowFiles = rows.map((r, k) => {
  const file = path.join(outDir, `row${k}.jpg`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...r.flatMap((x) => ['-i', x]), '-filter_complex', `${r.map((_, i) => `[${i}]`).join('')}hstack=inputs=${r.length}`, '-q:v', '3', file]);
  return file;
});
const sheet = path.join(outDir, 'gesture.jpg');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...rowFiles.flatMap((r) => ['-i', r]), '-filter_complex', 'vstack=inputs=2', '-q:v', '3', sheet]);
for (const f of [...tiles, ...rowFiles]) fs.rmSync(f);
console.log(`→ ${sheet}`);

// 동작 구간 짧은 영상 (소리 포함, 절반 크기)
const mp4 = path.join(outDir, 'gesture.mp4');
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: mp4,
  inputProps,
  browserExecutable,
  chromiumOptions,
  puppeteerInstance: browser,
  scale: 0.5,
  crf: 26,
  frameRange: [Math.max(0, t.from - 30), Math.min(t.from + t.durationInFrames + 20, timings.at(-1)!.from + timings.at(-1)!.durationInFrames - 1)],
  enforceAudioTrack: true,
  logLevel: 'error',
  timeoutInMilliseconds: 120_000,
});
console.log(`→ ${mp4} (영상 ${Math.max(0, t.from - 30)}프레임부터)`);
await browser.close({ silent: true });
process.exit(0);
