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

/**
 * 음식용 3단 음영: 그늘 · 중간 · 밝은 면. 그늘 색은 회색이 아니라 같은 색의 짙은 톤(셰이더가 채도를 지킨다).
 * three.js 단계 음영은 빛 방향과 면의 각도(0.5 + 0.5·cos)로 이 표를 읽는다: 0.5 아래는 빛을 등진 면.
 * 등진 면은 확실히 어둡게 둔다(예전 0.45). 등진 면까지 밝으면 뒤쪽 테두리 조명이 음식 윗면을 앞에서처럼 환하게 비춰 색이 날아갔다.
 */
export const FOOD_RAMP = { levels: [0.32, 0.68, 0.92], edges: [0.47, 0.68], soft: 0.025 };

/**
 * 빛 정리(노출): 장면 조명(분위기별 주광 + 색 테두리 조명 + 하늘빛 + 불빛)을 모두 더하면 윗면은 음식 색의 1.3~2배까지 밝아져
 * 주황 음식이 노랗게·하얗게 날아갔다(2026-11 실제 영상: 팬 속 김치전 가운데가 전구처럼 빛남, 냄비 속 파스타가 흰색).
 * 그래서 음식 재질은 받은 빛을 한 번 정리한다:
 * - 밝기: knee까지는 그대로(그늘·중간 단계는 그대로 살린다), 그 위는 max에 천천히 다가가게 눌러 '밝은 면 = 음식 색'이 되게 한다
 * - 색 조명(주황 불빛·푸른 테두리 빛)은 tint만큼만 음식에 물든다 (음식 자기 색이 먼저)
 * - 화면 톤 매핑(ACES)은 쓰지 않는다: ACES는 밝은 주황을 노랑·흰색 쪽으로 틀어 버린다(three.js 포럼·model-viewer 문서). 대신 여기서 밝기를 정리한다.
 */
export const TOON_LIGHT = { exposure: 0.92, knee: 0.62, max: 1.04, tint: 0.25 };

/** 정리된 빛 밝기 (셰이더와 같은 식, 시험용): 받은 빛 세기(음식 색 1배 = 1) → 화면에 쓰는 배율 */
export function toonExposure(light: number, o = TOON_LIGHT): number {
  const e = Math.max(0, light) * o.exposure;
  return e < o.knee ? e : o.knee + (e - o.knee) / (1 + (e - o.knee) / (o.max - o.knee));
}

/**
 * 채도를 조금 올린다(색상·밝기는 유지). 만화·애니 음식은 실제보다 선명한 색을 쓴다(그림 실무)
 * 지나친 채도는 인공적으로 보인다는 연구도 있어 조금만(기본 +10%. 톤 매핑을 빼서 예전 +18%만큼 올리지 않아도 색이 산다).
 */
export function vivid(hex: string, amount = 0.1): string {
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
  /**
   * 넓고 평평한 면(전·소스)의 하이라이트를 작은 윤기 조각들로 나누는 무늬의 촘촘함 (모양 자기 좌표 기준, 0이면 나누지 않음).
   * 평평한 면은 법선이 거의 같아 하이라이트가 한 덩어리 큰 타원(전구처럼 빛나는 가운데)이 된다 → 기름 윤기 점 몇 개로.
   */
  breakup?: number;
  /**
   * 젖은 윤기 0~1: 넓고 옅은 번들거림 (눅눅한 실패작용). 반짝이는 점과 달리 평평한 면을 비스듬히 볼 때도 보인다.
   * breakup이 있으면 같은 무늬로 군데군데만.
   */
  wet?: number;
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
 * - 빛 정리(TOON_LIGHT): 밝은 면이 음식 색 그대로 보이게 받은 빛을 정리하고, 색 조명은 조금만 물들인다.
 * - 그늘 채도 지키기: 그늘은 회색이 아니라 같은 색의 조금 더 진한 톤 + 자기 색을 조금 더한다.
 * - 하이라이트: 카메라 기준 왼쪽 위에서 온다고 정한 빛으로 '반짝이는 점'을 칼같이 그린다(애니 음식의 크림색 하이라이트).
 *   장면 조명 위치와 상관없이 늘 보이게 화면 기준으로 둔다 — 만화 하이라이트는 원래 연출로 넣는 것.
 * - 둘레 빛: 가장자리를 따라 밝은 띠(윤곽을 또렷하게).
 * 반사 환경·겉 막(클리어코트)을 쓰지 않아 사실풍 재질보다 화소당 계산이 훨씬 적다(소프트웨어 렌더에서 중요).
 * 같은 설정이면 같은 재질을 돌려준다(셰이더도 하나라 그리기 준비가 빠르다).
 */
export function toonMaterial(look: ToonLook = {}): Material {
  const color = look.plain ? look.color ?? '#FFFFFF' : vivid(look.color ?? '#FFFFFF');
  const gloss = clamp01(look.gloss ?? 0);
  const spot = clamp01(look.spot ?? 0.35);
  const rim = look.rim ?? 0.12;
  const breakup = Math.max(0, look.breakup ?? 0);
  const wet = clamp01(look.wet ?? 0);
  const key = [color, gloss.toFixed(2), spot.toFixed(2), rim.toFixed(2), breakup.toFixed(1), wet.toFixed(2), look.side ?? 0, look.vertexColors ? 1 : 0, look.opacity ?? 1].join('|');
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
    // 밝기는 셰이더의 빛 정리가 맡는다 (ACES는 밝은 주황을 노랑·흰색으로 튼다)
    toneMapped: false,
  });
  // 하이라이트 경계: 윤기가 셀수록 작고 또렷하게
  const edge = 0.99 - spot * 0.04;
  const uniforms = { uGloss: { value: gloss }, uEdge: { value: edge }, uRim: { value: rim }, uBreak: { value: breakup }, uWet: { value: wet } };
  const L = TOON_LIGHT;
  const f = (x: number) => x.toFixed(4);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vToonObj;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToonObj = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uGloss;\nuniform float uEdge;\nuniform float uRim;\nuniform float uBreak;\nuniform float uWet;\nvarying vec3 vToonObj;\nvoid main() {')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
          // 빛 정리: 받은 빛(채널별) → 색 조명은 조금만, 밝기는 knee 위에서 눌러 음식 색이 날아가지 않게
          vec3 alb = max(diffuseColor.rgb, vec3(0.02));
          vec3 fl = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / alb;
          float y = dot(fl, LUMA);
          fl = mix(vec3(y), fl, ${f(L.tint)});
          float e = y * ${f(L.exposure)};
          float t = e < ${f(L.knee)} ? e : ${f(L.knee)} + (e - ${f(L.knee)}) / (1.0 + (e - ${f(L.knee)}) / ${f(L.max - L.knee)});
          fl *= t / max(y, 1e-4);
          // 그늘 채도 지키기: 어두운 면일수록 같은 색의 조금 더 진한 톤 + 자기 색을 조금 더한다
          float al = dot(diffuseColor.rgb, LUMA);
          vec3 rich = clamp(mix(vec3(al), diffuseColor.rgb, 1.3), 0.0, 1.0);
          vec3 base = mix(rich, diffuseColor.rgb, smoothstep(0.45, 0.85, t));
          reflectedLight.directDiffuse = base * fl;
          reflectedLight.indirectDiffuse = vec3(0.0);
          totalEmissiveRadiance += diffuseColor.rgb * 0.05;
          // 반짝이는 점: 화면 기준 왼쪽 위 앞에서 오는 빛
          vec3 hl = normalize(vec3(-0.45, 0.65, 0.62));
          float nh = max(dot(normal, normalize(hl + geometryViewDir)), 0.0);
          float spec = smoothstep(uEdge - 0.004, uEdge + 0.004, nh);
          // 넓고 약한 윤기 띠 (하이라이트 둘레)
          float sheen = smoothstep(uEdge - 0.04, uEdge - 0.02, nh) * 0.06;
          float mask = 1.0;
          if (uBreak > 0.0) {
            // 넓은 면은 하이라이트를 작은 윤기 조각들로 (모양 자기 좌표의 물결 무늬)
            vec3 q = vToonObj * uBreak;
            float n = sin(q.x * 1.7 + sin(q.z * 2.3) * 1.4) * sin(q.z * 1.9 + sin(q.x * 1.3) * 1.2);
            mask = smoothstep(0.25, 0.32, n);
            spec *= mask;
            sheen *= mask;
          }
          totalEmissiveRadiance += vec3(1.0, 0.97, 0.88) * (spec * 0.85 + sheen) * uGloss;
          // 젖은 윤기: 넓고 옅게 번들 (눅눅한 실패작)
          totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * smoothstep(0.55, 0.78, nh) * mask * uWet * 0.2;
          // 둘레 빛
          float facing = max(dot(normal, geometryViewDir), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * (1.0 - smoothstep(0.12, 0.22, facing)) * uRim;
        }`,
      );
  };
  // 모든 음식 재질이 같은 셰이더를 쓴다(값만 다름)
  mat.customProgramCacheKey = () => 'food-toon-2';
  cache.set(key, mat);
  return mat;
}

const inkCache = new Map<string, Material>();
/**
 * 외곽선 재질(뒤집은 껍데기): 같은 모양을 법선 쪽으로 조금 부풀려 뒷면만 그리면 윤곽에 선이 남는다.
 * 선 굵기는 모양 크기의 일정 비율(작은 조각은 가늘게)이고, 최대 굵기는 실제 길이(멀리서 보면 자연히 가늘어짐).
 * 화면 전체 후처리(윤곽 검출)는 1080×1920 전체를 다시 계산해 소프트웨어 렌더에서 비싸서 쓰지 않는다.
 */
export function inkMaterial(color = '#3A2418', opts: { max?: number; rel?: number } = {}): Material {
  const max = opts.max ?? 0.0015;
  const rel = opts.rel ?? 0.05;
  const key = `${color}|${max}|${rel}`;
  let m = inkCache.get(key);
  if (m) return m;
  // 음식 재질과 같이 톤 매핑 없이 (짙은 선이 뿌옇게 뜨지 않게)
  const mat = new MeshBasicMaterial({ color, side: BackSide, toneMapped: false });
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
