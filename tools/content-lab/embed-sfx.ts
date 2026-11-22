/**
 * packages/video/assets/sfx/*.wav (실제 녹음 효과음 + 이 저장소에서 합성한 노트 넘기는 소리, 모두 CC0) → packages/video/src/sfxData.ts
 * 화면 미리보기(Vite)와 렌더(Remotion)가 같은 소리를 쓰도록 data URL로 코드에 넣는다.
 * 실행: npx tsx tools/content-lab/embed-sfx.ts   (WAV를 바꾼 뒤에만)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'packages/video/assets/sfx');
const names = ['whoosh', 'ding', 'boing', 'pop', 'page'] as const;

const lines = names.map((n) => {
  const buf = fs.readFileSync(path.join(dir, `${n}.wav`));
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${n}.wav는 WAV가 아니에요`);
  return `  ${n}: '${buf.toString('base64')}',`;
});
const out = `// 자동 생성 파일: tools/content-lab/embed-sfx.ts가 packages/video/assets/sfx/*.wav로 만든다. 직접 고치지 않는다.
// 출처·라이선스(모두 CC0): packages/video/assets/sfx/LICENSES.md
export const SFX_WAV_BASE64 = {
${lines.join('\n')}
} as const;
`;
fs.writeFileSync(path.join(root, 'packages/video/src/sfxData.ts'), out);
console.log(`효과음 ${names.length}개를 sfxData.ts에 넣었어요 (${Math.round(out.length / 1024)}KB)`);
