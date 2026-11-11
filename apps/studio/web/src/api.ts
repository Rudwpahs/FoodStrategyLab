import type { ContentCandidate, HookCandidate, HookInfo, HookType, IgCheck, Issue, RecipeInput, Script, StyleId, StyleInfo } from '@mat-lab/recipe-core';
import type { SceneTiming, VideoProps } from '@mat-lab/video/timeline';
import type { CandidateVoiceJob } from '../../server/pipeline.ts';
import type { BlogStyle, BlogStyleInfo, ConsistencyIssue, ExpertNotes, ExpertQuestion, LintIssue } from '@mat-lab/publishing';
import type { ProjectDetail, ProjectSummary, Publication, RenderRow } from '../../server/repo.ts';
import type { FormatInsight } from '../../server/insights.ts';
import type { HumanizeResult } from '../../server/humanize.ts';

export type { CandidateVoiceJob, FormatInsight, HumanizeResult, ProjectDetail, ProjectSummary, Publication, RenderRow };

/** 후보 + 미리보기 타임라인 (목소리를 만든 문장은 실제 목소리로) */
export type VoicedCandidate = ContentCandidate & { timings: SceneTiming[] | null; voiced: boolean };

export interface AiInfo {
  configured: boolean;
  model: string;
  spentUsd: number;
  budgetUsd: number;
  maxFiles: number;
}

export interface UploadFile {
  name: string;
  type: string;
  data: string;
}

/** 서버 오류. status로 어떤 실패인지 구분한다 (예: 409 = 이미 있음·이미 진행 중, 0 = 연결 안 됨) */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** 서버가 실패 종류를 따로 알려 줄 때 (예: 'duplicate') */
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * '이미 게시(기록)했어요 — 다시 하려면 확인' 오류인지.
 * 서버는 승인 안 됨·영상 없음 같은 다른 실패에도 409를 쓰므로 상태 코드만으로는 구분할 수 없다.
 */
export function isDuplicateError(e: unknown): e is ApiError {
  if (!(e instanceof ApiError) || e.status !== 409) return false;
  return e.code === 'duplicate' || /다시 (기록하|올리)려면 확인이 필요해요/.test(e.message);
}

export const OFFLINE_MESSAGE = '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.';
export const NOT_JSON_MESSAGE = '서버가 잠에서 깨는 중이거나 잠시 불안정해요. 30초쯤 뒤에 다시 눌러 주세요.';

/** 응답 읽기. JSON이 아니면(서버가 깨어나는 중, 게이트웨이 오류 등) 영어 오류 대신 쉬운 말로 알린다 */
export async function readResponse<T>(res: Response, url: string): Promise<T> {
  const text = await res.text();
  let data: { error?: string; code?: string } | null | undefined;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = undefined;
  }
  // 로그인이 풀렸으면 로그인 화면으로
  if (res.status === 401 && !url.startsWith('/auth/') && typeof window !== 'undefined') window.dispatchEvent(new Event('matlab:logged-out'));
  if (data === undefined) throw new ApiError(res.ok ? NOT_JSON_MESSAGE : `${NOT_JSON_MESSAGE} (응답 ${res.status})`, res.status);
  if (!res.ok) throw new ApiError(data?.error ?? `요청 실패 (${res.status})`, res.status, data?.code);
  return data as T;
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  return readResponse<T>(res, url);
}

function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  return send<T>(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 파일을 그대로 올린다 (사진·클립) */
const upload = <T>(url: string, file: File) => send<T>(url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });

/** 완성 영상 폴더의 파일 주소 */
export const renderFile = (renderId: number, file: string) => `/media/renders/${renderId}/${file}`;

export interface Meta {
  tts: { provider: 'voicestudio' | 'edge' | 'none'; voice: string };
  samples: RecipeInput[];
}

export interface RenderStatus extends RenderRow {
  files: string[];
  captionChecks: string[];
  baseUrl: string;
}

export interface VoicePreset {
  id: string;
  label: string;
  note: string;
  voiceName: string;
}
export type VoiceSampleResult = { url: string; seconds: number } | { error: string };
/** 모든 목소리로 같은 문장 들어 보기 */
export interface VoiceSamples {
  status: 'running' | 'done';
  text: string;
  tempo: number;
  items: Record<string, VoiceSampleResult | null>;
}

export interface VoiceInfo {
  voicestudio: { state: 'ok' | 'starting'; url: string; version: string } | { state: 'offline' };
  profiles: { id: string; name: string; kind: string; audioUrl: string | null }[];
  engines: { active: string; chosen: string | null; available: string[] } | null;
  selected: string;
  /** 고른 목소리 (목록에 있는 목소리면 그 id) */
  selectedPreset: string | null;
  presets: VoicePreset[];
  tempo: number;
  tempos: { value: number; label: string }[];
  provider: 'voicestudio' | 'edge' | 'none';
  describe: string;
}

export interface InstagramStatus {
  configured: boolean;
  connected: boolean;
  username: string;
  expiresAt: string;
  problem: string;
  redirectUri: string;
}

export interface InstagramJob {
  id: string;
  status: 'uploading' | 'processing' | 'publishing' | 'published' | 'failed';
  message: string;
  permalink: string;
  trial?: boolean;
  note?: string;
}

export interface AuthState {
  /** login: 계정 있음 · setup: 화면에서 첫 계정 만들기(클라우드) · local: 이 PC 전용 */
  mode: 'local' | 'login' | 'setup';
  allowed: boolean;
  user: { id: number; username: string; displayName: string } | null;
}

export const api = {
  me: () => request<AuthState>('GET', '/auth/me'),
  login: (username: string, password: string) => request<{ user: AuthState['user'] }>('POST', '/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  instagram: () => request<InstagramStatus>('GET', '/instagram'),
  instagramConnect: () => request<{ url: string }>('POST', '/instagram/connect'),
  instagramDisconnect: () => request<{ ok: true }>('POST', '/instagram/disconnect'),
  instagramDraft: (renderId: number) => request<{ caption: string; job: InstagramJob | null; checks: IgCheck[]; cards: number }>('GET', `/renders/${renderId}/instagram`),
  instagramPublish: (renderId: number, caption: string, confirmDuplicate = false, trial = false, kind: 'reel' | 'carousel' = 'reel') =>
    request<InstagramJob>('POST', `/renders/${renderId}/instagram`, { confirm: true, caption, confirmDuplicate, trial, kind }),
  instagramJob: (jobId: string) => request<InstagramJob>('GET', `/instagram/jobs/${jobId}`),
  setup: (input: { code: string; username: string; displayName: string; password: string }) => request<{ user: AuthState['user'] }>('POST', '/auth/setup', input),
  voiceSettings: () => request<VoiceInfo>('GET', '/voice'),
  setVoice: (voice: string) => request<{ selected: string }>('PUT', '/voice', { voice }),
  setVoicePreset: (id: string) => request<{ selected: string; selectedPreset: string }>('PUT', '/voice/preset', { id }),
  setVoiceTempo: (tempo: number) => request<{ tempo: number }>('PUT', '/voice/tempo', { tempo }),
  startVoiceSamples: (text: string) => request<VoiceSamples>('POST', '/voice/samples', { text }),
  voiceSamples: () => request<VoiceSamples | null>('GET', '/voice/samples'),
  meta: () => request<Meta>('GET', '/meta'),
  list: () => request<ProjectSummary[]>('GET', '/projects'),
  get: (id: number) => request<ProjectDetail>('GET', `/projects/${id}`),
  create: (recipe: RecipeInput) => request<{ id: number }>('POST', '/projects', { recipe }),
  remove: (id: number) => request<void>('DELETE', `/projects/${id}`),
  updateRecipe: (id: number, recipe: RecipeInput) => request<ProjectDetail>('PUT', `/projects/${id}/recipe`, { recipe }),
  hooks: (id: number, style?: StyleId) =>
    request<{ styles: Record<StyleId, StyleInfo>; hookInfo: Record<HookType, HookInfo>; hooks: HookCandidate[]; repetition: string | null }>('GET', `/projects/${id}/hooks${style ? `?style=${style}` : ''}`),
  styledScript: (id: number, style: StyleId, hookType?: HookType) => request<{ project: ProjectDetail; notes: string[] }>('POST', `/projects/${id}/script/styled`, { style, hookType }),
  changeHook: (id: number, hookType: HookType) => request<{ project: ProjectDetail; notes: string[] }>('POST', `/projects/${id}/script/hook`, { hookType }),
  candidates: (id: number, exclude: string[] = [], count = 5) =>
    request<{ candidates: VoicedCandidate[]; exhausted: boolean; insights: FormatInsight[]; voiceJob: CandidateVoiceJob | null }>(
      'GET',
      `/projects/${id}/candidates?count=${count}${exclude.length ? `&exclude=${encodeURIComponent(exclude.join(','))}` : ''}`,
    ),
  candidateVoices: (id: number, keys: string[]) => request<CandidateVoiceJob>('POST', `/projects/${id}/candidates/voice`, { keys }),
  candidateVoiceStatus: (id: number) => request<CandidateVoiceJob | null>('GET', `/projects/${id}/candidates/voice`),
  makeCandidate: (id: number, style: StyleId, hookType: HookType) =>
    request<{ project: ProjectDetail; renderId: number; notes: string[] }>('POST', `/projects/${id}/candidates/make`, { style, hookType }),
  aiInfo: () => request<AiInfo>('GET', '/ai'),
  moreTopics: (id: number, direction: string) => request<ProjectDetail>('POST', `/projects/${id}/topics/more`, { direction }),
  chooseTopic: (id: number, body: { topic: string; principle: string; category?: string }) => request<ProjectDetail>('PUT', `/projects/${id}/topic`, body),
  confirmAi: (id: number) => request<unknown>('POST', `/projects/${id}/source/confirm`, {}),
  createFromFiles: (files: UploadFile[], memo: string) => request<{ id: number; aiFields: string[]; problems: string[] }>('POST', '/projects/from-files', { files, memo }),
  blogCompare: (id: number) =>
    request<{ options: { style: BlogStyle; info: BlogStyleInfo; post: { title: string; markdown: string; html: string }; pending: ExpertQuestion[]; lint: LintIssue[] }[]; selected: string }>('GET', `/projects/${id}/blog/compare`),
  setBlogStyle: (id: number, style: BlogStyle | '') => request<ProjectDetail>('PUT', `/projects/${id}/blog-style`, { style }),
  addPublication: (id: number, body: { platform: Publication['platform']; status?: 'scheduled' | 'published'; url?: string; scheduledAt?: string; note?: string; confirmDuplicate?: boolean }) =>
    request<Publication>('POST', `/projects/${id}/publications`, body),
  cancelRender: (renderId: number) => request<RenderRow>('POST', `/renders/${renderId}/cancel`),
  setMetrics: (pubId: number, metrics: Record<string, number | string>) => request<Publication>('PUT', `/publications/${pubId}/metrics`, metrics),
  templateScript: (id: number) => request<ProjectDetail>('POST', `/projects/${id}/script/template`),
  aiPrompt: (id: number) => request<{ prompt: string }>('GET', `/projects/${id}/ai-prompt`),
  aiScript: (id: number, text: string) => request<ProjectDetail>('POST', `/projects/${id}/script/ai`, { text }),
  saveScript: (id: number, script: Script, note: string) => request<ProjectDetail>('PUT', `/projects/${id}/script`, { script, note }),
  restore: (id: number, version: number) => request<ProjectDetail>('POST', `/projects/${id}/versions/${version}/restore`),
  check: (id: number) => request<{ version: number; issues: Issue[]; estimatedSeconds: number }>('GET', `/projects/${id}/check`),
  review: (id: number, body: { version: number; reviewer: string; checklist: Record<string, boolean>; decision: string; note: string; acceptQa?: boolean }) =>
    request<ProjectDetail>('POST', `/projects/${id}/reviews`, body),
  voice: (id: number) => request<{ provider: string; generated: number }>('POST', `/projects/${id}/voice`),
  preview: (id: number) => request<{ version: number; voiced: boolean; props: VideoProps }>('GET', `/projects/${id}/preview`),
  blog: (id: number, style?: BlogStyle) =>
    request<{
      post: { title: string; markdown: string; html: string; tags: string[] };
      social: { instagram: string; youtubeTitle: string; youtubeDescription: string };
      consistency: ConsistencyIssue[];
      lint: LintIssue[];
      /** 적용된 im-not-ai 윤문 문단 수 */
      polished: number;
      expert: { style: BlogStyle; pending: ExpertQuestion[]; ready: boolean; blockers: string[] } | null;
      styles: Record<BlogStyle, BlogStyleInfo>;
    }>('GET', `/projects/${id}/blog${style ? `?style=${style}` : ''}`),
  humanize: (id: number, target: 'blog' | 'script', opts: { style?: BlogStyle; force?: boolean } = {}) =>
    request<HumanizeResult & { version?: number }>('POST', `/projects/${id}/humanize`, { target, ...opts }),
  applyHumanize: (id: number, target: 'blog' | 'script', items: { id: string; before: string; after: string }[], opts: { style?: BlogStyle; version?: number } = {}) =>
    request<{ applied: number; rejected: { id: string; reasons: string[] }[]; project?: ProjectDetail }>('POST', `/projects/${id}/humanize/apply`, { target, items, ...opts }),
  clearPolish: (id: number) => request<{ ok: boolean }>('DELETE', `/projects/${id}/polish`),
  aiTells: (id: number) => request<{ scenes: { id: string; tells: { rule: string; severity: string; found: string; fix: string }[] }[]; source: string }>('GET', `/projects/${id}/ai-tells`),
  expertNotes: (id: number) => request<{ notes: ExpertNotes; questions: ExpertQuestion[]; styles: Record<BlogStyle, BlogStyleInfo> }>('GET', `/projects/${id}/expert-notes`),
  saveExpertNotes: (id: number, answers: ExpertNotes['answers'], confirmBy?: string) => request<{ notes: ExpertNotes }>('PUT', `/projects/${id}/expert-notes`, { answers, confirmBy }),
  uploadPhoto: (id: number, file: File, color: string) => upload<ProjectDetail>(`/projects/${id}/photo?color=${encodeURIComponent(color)}`, file),
  uploadSceneMedia: (id: number, sceneId: string, file: File) => upload<ProjectDetail>(`/projects/${id}/scenes/${encodeURIComponent(sceneId)}/media`, file),
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
  bitmap.close();
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
