import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(here, 'entry.ts');

let serveUrl: Promise<string> | null = null;

/** Remotion 프로젝트 번들은 한 번만 만들고 재사용한다. */
export function getServeUrl(): Promise<string> {
  serveUrl ??= bundle({ entryPoint, onProgress: () => undefined }).catch((e) => {
    serveUrl = null;
    throw e;
  });
  return serveUrl;
}

/** 크롬 경로를 지정하지 않으면 Remotion이 처음 한 번 무료 headless 크롬을 내려받는다. */
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

/** 3D(WebGL) 렌더링 방식. GPU가 있는 PC는 'angle', GPU 없는 서버는 'swangle'. */
type Gl = 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl';
let chromiumOptions = { gl: (process.env.REMOTION_GL as Gl | undefined) ?? 'angle' };

/** 'angle'(GPU)이 안 되는 PC면 한 번만 소프트웨어 렌더링('swangle')으로 다시 시도한다. */
async function withGlFallback<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (process.env.REMOTION_GL || chromiumOptions.gl !== 'angle') throw e;
    chromiumOptions = { gl: 'swangle' };
    return fn();
  }
}

export interface RenderVideoOptions {
  inputProps: Record<string, unknown>;
  outputLocation: string;
  onProgress?: (progress: number) => void;
  /** 일부 구간만 렌더 (확인용) */
  frameRange?: [number, number];
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  return withGlFallback(() => renderVideoOnce(options));
}

async function renderVideoOnce({ inputProps, outputLocation, onProgress, frameRange }: RenderVideoOptions): Promise<void> {
  const url = await getServeUrl();
  const composition = await selectComposition({ serveUrl: url, id: 'ShortVideo', inputProps, browserExecutable, chromiumOptions });
  await renderMedia({
    composition,
    serveUrl: url,
    codec: 'h264',
    outputLocation,
    inputProps,
    browserExecutable,
    chromiumOptions,
    enforceAudioTrack: true,
    ...(frameRange ? { frameRange } : {}),
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}

export async function renderStillImage(id: string, inputProps: Record<string, unknown>, output: string, frame = 0): Promise<void> {
  return withGlFallback(() => renderStillOnce(id, inputProps, output, frame));
}

async function renderStillOnce(id: string, inputProps: Record<string, unknown>, output: string, frame: number): Promise<void> {
  const url = await getServeUrl();
  const composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable, chromiumOptions });
  await renderStill({ composition, serveUrl: url, output, inputProps, browserExecutable, chromiumOptions, frame });
}
