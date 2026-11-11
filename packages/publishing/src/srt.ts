import type { Script } from '@mat-lab/recipe-core';
import { captionChunks, type SceneTiming } from '@mat-lab/video/timeline';

function stamp(frame: number, fps: number): string {
  const ms = Math.round((frame / fps) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** 영상과 같은 규칙으로 나눈 자막을 SRT 파일로 만든다 (유튜브 자막 업로드용). */
export function buildSrt(script: Script, timings: SceneTiming[], fps = 30): string {
  const byId = new Map(timings.map((t) => [t.sceneId, t]));
  const entries: string[] = [];
  for (const scene of script.scenes) {
    const t = byId.get(scene.id);
    if (!t) continue;
    for (const c of captionChunks(scene.line, Math.max(1, t.speechFrames), t.words)) {
      entries.push(`${entries.length + 1}\n${stamp(t.from + c.from, fps)} --> ${stamp(t.from + c.to, fps)}\n${c.text}\n`);
    }
  }
  return entries.join('\n');
}
