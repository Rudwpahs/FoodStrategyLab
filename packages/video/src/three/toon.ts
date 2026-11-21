// 음식·그릇·재료 소품을 '확실한 만화풍'으로 그리는 재질.
// 어설픈 사실풍 음식이 가장 거부감을 준다(Diel 외 2025, Appetite)는 조사에 따라, 음식은 반쯤 사실적인 질감 대신
// 단계 음영(2~3단) + 깔끔한 반사 하이라이트 + 은은한 외곽선으로 만화처럼 그린다.
// 근거·결정: docs/research/content-strategy/food-toon-2026-11.md
import { BackSide, Color, DataTexture, LinearFilter, MeshBasicMaterial, MeshToonMaterial, RedFormat, type Material, type Texture } from 'three';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * 단계 음영표(그라디언트 맵) 값. 빛이 닿는 정도(0=정반대 ~ 1=정면)를 몇 단계 밝기로 나눈다.
 * levels: 각 단계 밝기(어두운 쪽부터), edges: 단계가 바뀌는 자리(levels.length - 1개), soft: 경계 폭(0이면 칼같이).
 * 경계를 아주 조금 부드럽게 두는 이유: 맛조수가 매끈한 장난감 같은 입체라, 칼같은 셀 경계만 쓰면 음식만 따로 노는 그림이 된다.
 */
export function toonRamp(levels: number[], edges: number[], soft = 0.03, size = 64): Uint8Array {
  if (edges.length !== levels.length - 1) throw new Error('edges는 levels보다 하나 적어야 한다');
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size;
    let v = levels[0]!;
    edges.forEach((e, k) => {
      const t = soft > 0 ? clamp01((x - (e - soft)) / (2 * soft)) : x >= e ? 1 : 0;
      const s = t * t * (3 - 2 * t);
      v += (levels[k + 1]! - levels[k]!) * s;
    });
    out[i] = Math.round(clamp01(v) * 255);
  }
  return out;
}

/** 음식용 3단 음영: 그늘 · 중간 · 밝은 면. 그늘도 너무 어둡지 않게(만화 음식은 그늘이 진한 회색이 아니라 같은 색의 짙은 톤) */
export const FOOD_RAMP = { levels: [0.45, 0.7, 0.9], edges: [0.42, 0.66], soft: 0.025 };

/**
 * 채도를 조금 올린다(색상·밝기는 유지). 만화·애니 음식은 실제보다 선명한 색을 쓴다(그림 실무)
 * 지나친 채도는 인공적으로 보인다는 연구도 있어 조금만(기본 +18%).
 */
export function vivid(hex: string, amount = 0.18): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, clamp01(hsl.s + (1 - hsl.s) * amount * (hsl.s > 0.08 ? 1 : 0)), hsl.l);
  return `#${c.getHexString()}`;
}

/** 외곽선 색: 검정이 아니라 그 음식 색의 짙은 톤(갈색 음식은 짙은 갈색 선). 검은 선은 음식을 탁하게 만든다 */
export function inkColor(hex: string): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, clamp01(hsl.s * 0.9 + 0.1), Math.min(0.2, hsl.l * 0.35));
  return `#${c.getHexString()}`;
}

let ramp: Texture | null = null;
function foodRamp(): Texture {
  if (ramp) return ramp;
  const data = toonRamp(FOOD_RAMP.levels, FOOD_RAMP.edges, FOOD_RAMP.soft);
  const t = new DataTexture(data, data.length, 1, RedFormat);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  ramp = t;
  return t;
}

export interface ToonLook {
  color?: string;
  /** 윤기 0~1: 하이라이트 점의 세기. 0이면 하이라이트 없음(마른 것) */
  gloss?: number;
  /** 하이라이트 크기 0~1 (클수록 넓게). 시럽·노른자는 작고 또렷하게, 그릇 유약은 넓게 */
  spot?: number;
  /** 둘레 빛(테두리를 따라 밝게) 세기 */
  rim?: number;
  side?: 0 | 2;
  vertexColors?: boolean;
  opacity?: number;
  /** 채도 올리기 끄기 (그릇·금속처럼 이미 정한 색) */
  plain?: boolean;
}

const cache = new Map<string, Material>();

/**
 * 만화풍 재질: three.js 단계 음영 재질 + 셰이더 몇 줄.
 * - 하이라이트: 카메라 기준 왼쪽 위에서 온다고 정한 빛으로 '반짝이는 점'을 칼같이 그린다(애니 음식의 흰 하이라이트).
 *   장면 조명 위치와 상관없이 늘 보이게 화면 기준으로 둔다 — 만화 하이라이트는 원래 연출로 넣는 것.
 * - 그늘 채도 지키기: 그늘에도 음식 자기 색을 조금 더해 회색으로 죽지 않게.
 * - 둘레 빛: 가장자리를 따라 밝은 띠(윤곽을 또렷하게).
 * 반사 환경·겉 막(클리어코트)을 쓰지 않아 예전 사실풍 재질보다 화소당 계산이 훨씬 적다(소프트웨어 렌더에서 중요).
 * 같은 설정이면 같은 재질을 돌려준다(셰이더도 하나라 그리기 준비가 빠르다).
 */
export function toonMaterial(look: ToonLook = {}): Material {
  const color = look.plain ? look.color ?? '#FFFFFF' : vivid(look.color ?? '#FFFFFF');
  const gloss = clamp01(look.gloss ?? 0);
  const spot = clamp01(look.spot ?? 0.35);
  const rim = look.rim ?? 0.12;
  const key = [color, gloss.toFixed(2), spot.toFixed(2), rim.toFixed(2), look.side ?? 0, look.vertexColors ? 1 : 0, look.opacity ?? 1].join('|');
  let m = cache.get(key);
  if (m) return m;
  const mat = new MeshToonMaterial({
    color,
    gradientMap: foodRamp(),
    side: look.side ?? 0,
    vertexColors: !!look.vertexColors,
    transparent: look.opacity !== undefined && look.opacity < 1,
    opacity: look.opacity ?? 1,
    depthWrite: !(look.opacity !== undefined && look.opacity < 0.9),
  });
  // 하이라이트 경계: 윤기가 셀수록 작고 또렷하게
  const edge = 0.99 - spot * 0.04;
  const uniforms = { uGloss: { value: gloss }, uEdge: { value: edge }, uRim: { value: rim } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uGloss;\nuniform float uEdge;\nuniform float uRim;\nvoid main() {')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          // 그늘 채도 지키기: 자기 색을 조금 더한다
          totalEmissiveRadiance += diffuseColor.rgb * 0.07;
          // 반짝이는 점: 화면 기준 왼쪽 위 앞에서 오는 빛
          vec3 hl = normalize(vec3(-0.45, 0.65, 0.62));
          float nh = max(dot(normal, normalize(hl + geometryViewDir)), 0.0);
          float spec = smoothstep(uEdge - 0.004, uEdge + 0.004, nh);
          // 넓고 약한 윤기 띠 (하이라이트 둘레)
          float sheen = smoothstep(uEdge - 0.05, uEdge - 0.025, nh) * 0.12;
          totalEmissiveRadiance += vec3(1.0, 0.97, 0.88) * (spec * 0.85 + sheen) * uGloss;
          // 둘레 빛
          float facing = max(dot(normal, geometryViewDir), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * (1.0 - smoothstep(0.12, 0.22, facing)) * uRim;
        }`,
      );
  };
  // 모든 음식 재질이 같은 셰이더를 쓴다(값만 다름)
  mat.customProgramCacheKey = () => 'food-toon-1';
  cache.set(key, mat);
  return mat;
}

const inkCache = new Map<string, Material>();
/**
 * 외곽선 재질(뒤집은 껍데기): 같은 모양을 법선 쪽으로 조금 부풀려 뒷면만 그리면 윤곽에 선이 남는다.
 * 선 굵기는 모양 크기의 일정 비율(작은 조각은 가늘게)이고, 최대 굵기는 실제 길이(멀리서 보면 자연히 가늘어짐).
 * 화면 전체 후처리(윤곽 검출)는 1080×1920 전체를 다시 계산해 소프트웨어 렌더에서 비싸서 쓰지 않는다.
 */
export function inkMaterial(color = '#3A2418', opts: { max?: number; rel?: number; instanced?: boolean } = {}): Material {
  const max = opts.max ?? 0.0015;
  const rel = opts.rel ?? 0.05;
  const key = `${color}|${max}|${rel}`;
  let m = inkCache.get(key);
  if (m) return m;
  const mat = new MeshBasicMaterial({ color, side: BackSide });
  const uniforms = { uInkMax: { value: max }, uInkRel: { value: rel } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float uInkMax;\nuniform float uInkRel;\nvoid main() {').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec3 inkN = normal;
        mat4 inkM = modelMatrix;
        #ifdef USE_INSTANCING
          inkN = mat3(instanceMatrix) * inkN;
          inkM = modelMatrix * instanceMatrix;
        #endif
        float inkScale = length(inkM[0].xyz);
        inkN = normalize(normalMatrix * inkN);
        mvPosition.xyz += inkN * min(uInkMax, uInkRel * inkScale);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'food-ink-1';
  inkCache.set(key, mat);
  return mat;
}
