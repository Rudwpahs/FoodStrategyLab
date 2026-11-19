// 실제 촬영 영상 화면 확인용: 가짜 촬영 영상·사진을 붙여 몇 프레임을 그린다 (목소리 없이 예상 길이로).
// 사용: npx tsx tools/content-lab/realframes.ts <출력폴더> <미디어 주소(http://…/)> [video 패키지 폴더]
// 미디어 주소 폴더에 tiny.mp4, tiny.png, wide.mp4가 있어야 한다. 세 번째 값을 주면 그 폴더의 렌더러로 그린다(예전 코드와 비교용).
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_RECIPES, buildStyledScript, clipGroups } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from '@mat-lab/video/timeline';

const [outDir, mediaBase, videoDir] = process.argv.slice(2);
if (!outDir || !mediaBase) {
  console.error('사용: npx tsx tools/content-lab/realframes.ts <출력폴더> <미디어 주소> [video 패키지 폴더]');
  process.exit(1);
}
const { renderStillImage } = (await import(videoDir ? path.resolve(videoDir, 'src/render.ts') : '@mat-lab/video/render')) as typeof import('@mat-lab/video/render');
const recipe = SAMPLE_RECIPES[0]!;
const script = buildStyledScript(recipe, { style: 'problem' }).script;
const timings = buildTimeline(script, script.scenes.map(() => null));
const groups = clipGroups(script);
const at = (id: string) => timings.find((t) => t.sceneId === id)!;
// 두 번째 묶음에 세로 휴대폰 영상, 세 번째 묶음에 가로 영상
const portrait = groups[1]![0]!;
const landscape = groups[2]![0]!;
const base: VideoProps = { script, timings, reviewed: false, cleanDraft: true, recipe };
const withMedia: VideoProps = {
  ...base,
  photoUrl: `${mediaBase}tiny.png`,
  sceneMedia: {
    [portrait]: { url: `${mediaBase}tiny.mp4`, kind: 'video', sound: true, seconds: 3 },
    [landscape]: { url: `${mediaBase}wide.mp4`, kind: 'video', sound: true, seconds: 4 },
  },
};
const shots: [string, VideoProps, number][] = [
  ['a-3d-frame0', base, 0],
  ['b-3d-frame20', base, 20],
  ['c-photo-frame0', withMedia, 0],
  ['d-clip-portrait', withMedia, at(portrait).from + 20],
  ['e-clip-landscape', withMedia, at(landscape).from + 40],
  ['f-after-opening', withMedia, timings[0]!.durationInFrames + 12],
];
fs.mkdirSync(outDir, { recursive: true });
for (const [name, props, frame] of shots) {
  const file = path.join(outDir, `${name}.png`);
  await renderStillImage('ShortVideo', props as unknown as Record<string, unknown>, file, frame);
  console.log(`${name} · ${frame}프레임 → ${file}`);
}
process.exit(0);
