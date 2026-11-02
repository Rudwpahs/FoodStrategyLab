import type { Issue, RecipeInput, Script } from '@mat-lab/recipe-core';
import type { VideoProps } from '@mat-lab/video/timeline';
import type { ProjectDetail, ProjectSummary, RenderRow } from '../../server/repo.ts';

export type { ProjectDetail, ProjectSummary, RenderRow };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export interface Meta {
  tts: { provider: 'voicestudio' | 'edge' | 'none'; voice: string };
  samples: RecipeInput[];
}

export interface RenderStatus extends RenderRow {
  files: string[];
  captionChecks: string[];
  baseUrl: string;
}

export interface VoiceInfo {
  voicestudio: { state: 'ok' | 'starting'; url: string; version: string } | { state: 'offline' };
  profiles: { id: string; name: string; kind: string; audioUrl: string | null }[];
  selected: string;
  provider: 'voicestudio' | 'edge' | 'none';
  describe: string;
}

export const api = {
  voiceSettings: () => request<VoiceInfo>('GET', '/voice'),
  setVoice: (voice: string) => request<{ selected: string }>('PUT', '/voice', { voice }),
  designVoice: () => request<{ profile: { name: string }; created: boolean }>('POST', '/voice/design', { name: '맛조수' }),
  voiceSample: (text?: string) => request<{ url: string; seconds: number }>('POST', '/voice/sample', { text }),
  meta: () => request<Meta>('GET', '/meta'),
  list: () => request<ProjectSummary[]>('GET', '/projects'),
  get: (id: number) => request<ProjectDetail>('GET', `/projects/${id}`),
  create: (recipe: RecipeInput) => request<{ id: number }>('POST', '/projects', { recipe }),
  remove: (id: number) => request<void>('DELETE', `/projects/${id}`),
  updateRecipe: (id: number, recipe: RecipeInput) => request<ProjectDetail>('PUT', `/projects/${id}/recipe`, { recipe }),
  templateScript: (id: number) => request<ProjectDetail>('POST', `/projects/${id}/script/template`),
  aiPrompt: (id: number) => request<{ prompt: string }>('GET', `/projects/${id}/ai-prompt`),
  aiScript: (id: number, text: string) => request<ProjectDetail>('POST', `/projects/${id}/script/ai`, { text }),
  saveScript: (id: number, script: Script, note: string) => request<ProjectDetail>('PUT', `/projects/${id}/script`, { script, note }),
  restore: (id: number, version: number) => request<ProjectDetail>('POST', `/projects/${id}/versions/${version}/restore`),
  check: (id: number) => request<{ version: number; issues: Issue[]; estimatedSeconds: number }>('GET', `/projects/${id}/check`),
  review: (id: number, body: { version: number; reviewer: string; checklist: Record<string, boolean>; decision: string; note: string }) =>
    request<ProjectDetail>('POST', `/projects/${id}/reviews`, body),
  voice: (id: number) => request<{ provider: string; generated: number }>('POST', `/projects/${id}/voice`),
  preview: (id: number) => request<{ version: number; voiced: boolean; props: VideoProps }>('GET', `/projects/${id}/preview`),
  blog: (id: number) =>
    request<{ post: { title: string; markdown: string; html: string; tags: string[] }; social: { instagram: string; youtubeTitle: string; youtubeDescription: string } }>('GET', `/projects/${id}/blog`),
  uploadPhoto: async (id: number, file: File, color: string) => {
    const res = await fetch(`/api/projects/${id}/photo?color=${encodeURIComponent(color)}`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? '사진 업로드 실패');
    return data as ProjectDetail;
  },
  uploadSceneMedia: async (id: number, sceneId: string, file: File) => {
    const res = await fetch(`/api/projects/${id}/scenes/${encodeURIComponent(sceneId)}/media`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? '업로드 실패');
    return data as ProjectDetail;
  },
  deleteSceneMedia: (id: number, sceneId: string) => request<ProjectDetail>('DELETE', `/projects/${id}/scenes/${encodeURIComponent(sceneId)}/media`),
  deletePhoto: (id: number) => request<ProjectDetail>('DELETE', `/projects/${id}/photo`),
  reelPrompts: (id: number) =>
    request<{ characterSheet: string; environment: string; clips: { file: string; frameFile: string; framePrompt: string; videoPrompt: string; line: string }[]; markdown: string }>('GET', `/projects/${id}/reel-prompts`),
  startRender: (id: number) => request<{ renderId: number }>('POST', `/projects/${id}/renders`),
  render: (renderId: number) => request<RenderStatus>('GET', `/renders/${renderId}`),
};

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

/** 서식 있는 HTML로 복사 (네이버 블로그 에디터에 붙여넣기용) */
export async function copyHtml(html: string, fallback: string) {
  if ('ClipboardItem' in window) {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([fallback], { type: 'text/plain' }) }),
    ]);
  } else {
    await copyText(fallback);
  }
}

/** 사진 가운데 부분의 평균 색 (음식 색으로 사용) */
export async function photoColor(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(bitmap.width, bitmap.height) * 0.5;
  ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, 40, 40);
  const { data } = ctx.getImageData(0, 0, 40, 40);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  const n = data.length / 4;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
