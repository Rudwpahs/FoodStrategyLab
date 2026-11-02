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
  tts: { provider: 'edge' | 'none'; voice: string; rate: string; pitch: string };
  samples: RecipeInput[];
}

export interface RenderStatus extends RenderRow {
  files: string[];
  baseUrl: string;
}

export const api = {
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
