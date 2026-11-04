import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
export { makeCancelSignal };

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

/**
 * 동시에 그릴 프레임 수 (REMOTION_CONCURRENCY). Remotion은 이 컴퓨터에 보이는 코어 수보다 크면 거절하므로
 * 보이는 코어 수 이하로 맞춘다. 정하지 않으면 Remotion 기본값.
 */
export function renderConcurrency(): number | undefined {
  const wanted = Number(process.env.REMOTION_CONCURRENCY);
  if (!(wanted > 0)) return undefined;
  return Math.max(1, Math.min(Math.floor(wanted), os.cpus().length));
}

export interface RenderVideoOptions {
  inputProps: Record<string, unknown>;
  outputLocation: string;
  onProgress?: (progress: number) => void;
  /** 일부 구간만 렌더 (확인용) */
  frameRange?: [number, number];
  /** 취소 신호 (makeCancelSignal) */
  cancelSignal?: Parameters<typeof renderMedia>[0]['cancelSignal'];
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  return withGlFallback(() => renderVideoOnce(options));
}

async function renderVideoOnce({ inputProps, outputLocation, onProgress, frameRange, cancelSignal }: RenderVideoOptions): Promise<void> {
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
    // 느린 서버(무료 ARM 2코어)에서 영상·이미지 불러오기가 늦어도 멈추지 않게
    timeoutInMilliseconds: 120_000,
    // 동시에 그릴 프레임 수. 컨테이너는 실제 쓸 수 있는 CPU보다 많이 보일 수 있어 직접 정한다 (REMOTION_CONCURRENCY)
    ...(renderConcurrency() ? { concurrency: renderConcurrency() } : {}),
    ...(frameRange ? { frameRange } : {}),
    ...(cancelSignal ? { cancelSignal } : {}),
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}

export async function renderStillImage(id: string, inputProps: Record<string, unknown>, output: string, frame = 0): Promise<void> {
  return withGlFallback(() => renderStillOnce(id, inputProps, output, frame));
}

async function renderStillOnce(id: string, inputProps: Record<string, unknown>, output: string, frame: number): Promise<void> {
  const url = await getServeUrl();
  const composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable, chromiumOptions });
  await renderStill({ composition, serveUrl: url, output, inputProps, browserExecutable, chromiumOptions, frame, timeoutInMilliseconds: 120_000 });
}
