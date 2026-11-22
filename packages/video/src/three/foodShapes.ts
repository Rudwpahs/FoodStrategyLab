// 음식 조각 3D 모양. 정육면체 대신 실제 썬 모양(콩알·깍둑 두부·송송 썬 고추·배추 잎·채 썬 양파 등)을
// 울퉁불퉁하게 만든다. 같은 입력이면 항상 같은 모양 (영상 프레임마다 모양이 바뀌면 안 된다).
import {
  BoxGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceShape } from '@mat-lab/recipe-core';
import { seeded } from '../random.ts';

/** 같은 레시피면 항상 같은 모양이 나오도록 고정 난수 */
export { seeded };

/** 부드러운 울퉁불퉁함 (사인파 몇 개를 겹친 값, 대략 -1~1) */
function bumps(x: number, y: number, z: number, k: number, seed: number): number {
  return (
    Math.sin(x * k + seed) * Math.cos(y * k * 1.3 + seed * 0.7) * 0.5 +
    Math.sin(z * k * 1.7 + seed * 1.9) * Math.cos(x * k * 0.8 - seed) * 0.35 +
    Math.sin((x + y + z) * k * 2.3 + seed * 3.1) * 0.15
  );
}

/** 꼭짓점 색(밝기 하나 또는 RGB 배율). 재질 색에 곱해진다: 1 = 그대로, 작을수록 어둡게 */
export type Shade = number | [number, number, number];

/**
 * 이음매를 붙이고(매끈한 음영) 각 꼭짓점을 옮긴 뒤 법선을 다시 계산.
 * fn이 값을 돌려주면 그 꼭짓점의 색 배율로 쓴다 — 주름 사이는 어둡게(틈 그늘), 전 가장자리는 노릇하게.
 * 음식이 한 가지 색으로 칠한 덩어리처럼 보이지 않게 하는 가장 값싼 방법이다(텍스처·조명 추가 없음).
 */
export function deform(g: BufferGeometry, fn: (v: Vector3) => Shade | void): BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  g.dispose();
  const pos = m.getAttribute('position');
  const v = new Vector3();
  let colors: Float32Array | null = null;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const shade = fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
    if (shade !== undefined) {
      colors ??= new Float32Array(pos.count * 3).fill(1);
      const [r, gg, b] = typeof shade === 'number' ? [shade, shade, shade] : shade;
      colors.set([r, gg, b], i * 3);
    }
  }
  if (colors) m.setAttribute('color', new Float32BufferAttribute(colors, 3));
  m.computeVertexNormals();
  return m;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 모서리가 둥근 상자 (두부·감자 깍둑썰기) — 크기 1 */
function roundedBox(r: number, seed: number): BufferGeometry {
  const inner = 0.5 - r;
  return deform(new BoxGeometry(1, 1, 1, 6, 6, 6), (v) => {
    const c = new Vector3(Math.max(-inner, Math.min(inner, v.x)), Math.max(-inner, Math.min(inner, v.y)), Math.max(-inner, Math.min(inner, v.z)));
    const d = v.clone().sub(c);
    if (d.lengthSq() > 0) d.setLength(r);
    v.copy(c.add(d));
    // 손으로 썬 듯 살짝 고르지 않게
    v.multiplyScalar(1 + bumps(v.x, v.y, v.z, 5, seed) * 0.04);
  });
}

function blob(rough: number, k: number, seed: number, squash: [number, number, number] = [1, 1, 1]): BufferGeometry {
  return deform(new SphereGeometry(1, 20, 14), (v) => {
    v.multiplyScalar(1 + bumps(v.x, v.y, v.z, k, seed) * rough);
    v.set(v.x * squash[0], v.y * squash[1], v.z * squash[2]);
  });
}

/** 구겨지고 살짝 말린 잎 조각 (배추·깻잎 등 잎채소) — 가로 1. 가장자리는 짙게(얇은 판이라 껍데기 외곽선 대신 안쪽 외곽선) */
function leaf(seed: number): BufferGeometry {
  return deform(new PlaneGeometry(1, 0.75, 12, 10), (v) => {
    const wave = Math.sin(v.x * 11 + seed) * Math.cos(v.y * 9 + seed * 0.5) * 0.05;
    const curl = v.x * v.x * 0.35 + v.y * v.y * 0.2;
    const rim = Math.max(Math.abs(v.x) / 0.5, Math.abs(v.y) / 0.375);
    // 가장자리를 들쭉날쭉하게
    const edge = 1 + Math.sin(Math.atan2(v.y, v.x) * 5 + seed) * 0.08;
    v.set(v.x * edge, v.y * edge, wave + curl);
    return 1 - 0.45 * smoothstep(0.8, 0.97, rim);
  });
}

/** 채 썬 조각 (양파·당근·고기) — 길이 1, 살짝 휘어 있다. 가늘게 (도톰하면 나무 조각·소시지처럼 보였다) */
function strip(seed: number): BufferGeometry {
  return deform(new BoxGeometry(1, 0.11, 0.16, 14, 2, 2), (v) => {
    const t = v.x;
    v.z += t * t * 0.55 + bumps(t, 0, 0, 6, seed) * 0.03;
    v.y += Math.sin(t * 4 + seed) * 0.02;
  });
}

/** 납작한 반달 조각 (마늘·버섯·애호박) — 반지름 1 */
function slice(seed: number): BufferGeometry {
  return deform(new CylinderGeometry(1, 1, 0.18, 24, 1, false, 0, Math.PI), (v) => {
    v.multiplyScalar(1 + bumps(v.x, v.y, v.z, 4, seed) * 0.05);
  });
}

/** 색(16진수) → 꼭짓점 색 값(선형). 꼭짓점 색은 재질 색에 곱해지므로, 색을 꼭짓점에 굽는 조각은 재질·조각 색을 흰색으로 둔다 */
function lin(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * 호두 반쪽 알맹이 (만화풍): 긴 쪽을 따라 깊은 가운데 골로 나뉜 두 덩이 + 덩이마다 굵은 가로 주름 세 줄 + 양 끝의 갈라진 홈,
 * 아래는 평평 — 길이 약 2.6, 폭 약 2, 높이 약 0.9.
 * 위에서 보면 윤곽이 주름 자리마다 오목하게 파여 '호두 반쪽' 실루엣이 된다 (예전: 골이 얕고 주름이 잔잔해 주황 젤리·과자처럼 보였다).
 * 골·주름 안쪽은 꼭짓점 색으로 짙게 (두 단계로 칼같이).
 */
function walnut(seed: number): BufferGeometry {
  const ph = [seed * 1.7, seed * 2.9 + 1.1];
  return deform(new SphereGeometry(1, 40, 24), (p) => {
    const { x, y, z } = p;
    const top = smoothstep(-0.3, 0.35, y);
    const ax = Math.abs(x);
    // 가운데 깊은 골 (긴 쪽을 따라)
    const groove = Math.exp(-((x / 0.15) ** 2)) * 0.4 * top;
    // 양 끝에서 골이 갈라지며 오목하게 (위에서 보면 끝이 하트처럼 파인다)
    const ends = Math.exp(-((x / 0.32) ** 2)) * smoothstep(0.55, 0.95, Math.abs(z)) * 0.22;
    // 덩이마다 굵은 가로 주름 네 줄 (덩이마다 자리가 조금 다르게) + 비스듬한 잔주름 하나
    const fold = Math.cos(z * 6.3 + ph[x >= 0 ? 0 : 1]! + ax * 2.2);
    const crease = smoothstep(0.45, 0.9, fold) * 0.24 * (0.45 + 0.55 * top);
    const wrinkle = smoothstep(0.7, 0.95, Math.cos((z - x * 1.3) * 9 + seed)) * 0.08 * top;
    // 덩이는 통통하게
    const bulge = Math.sin(Math.min(1, ax / 0.95) * Math.PI) * 0.08 * top;
    p.multiplyScalar(1 - groove - ends - crease - wrinkle + bulge);
    p.set(p.x, p.y > 0 ? p.y * 0.68 : p.y * 0.24, p.z * 1.3);
    // 그늘 두 단계: 골·주름 안쪽만 짙게
    return 1 - 0.5 * smoothstep(0.06, 0.1, groove * 1.2 + crease + wrinkle + ends * 0.8);
  });
}

/**
 * 배추김치 한 조각 (썬 김치): 길이 1(x), 폭 약 0.75(z), 아주 얇다(두께 약 0.07). 색을 꼭짓점에 굽는다.
 * variant 0·2: 구겨져 물결치는 납작한 잎 조각 (윤곽이 고르지 않은 덩이 모양, 짙은 빨강·주황 + 접힌 골은 더 짙게). 2번은 한쪽에 연한 줄기 띠
 * variant 1: 연한 배추 줄기 조각 (길쭉한 띠, 결 두어 줄, 가장자리에 고춧가루 양념 빨강)
 * 예전 1차: 종이처럼 얇은 빨간 판(피자 토핑). 2차 초안: 모서리 둥근 도톰한 네모라 깍둑 썬 토마토·페퍼로니·딸기처럼 보였다.
 * 김치는 잎이다: 납작하고, 윤곽이 들쭉날쭉하고, 물결친다.
 */
function kimchiPiece(variant: number): BufferGeometry {
  const v3 = variant % 3;
  const seed = 1.9 + v3 * 2.4;
  const red = lin('#C23A1E');
  const redDeep = lin('#8E2512');
  const redHi = lin('#D9582C');
  const rib = lin('#EEC594');
  const ribSpice = lin('#CF5A2A');
  if (v3 === 1) {
    // 줄기 조각: 짧고 납작한 띠, 양념 물이 든 연한 주황 (길고 하얀 띠는 막대·치즈 스틱처럼 서 보였다)
    return deform(new BoxGeometry(0.62, 0.055, 0.34, 10, 1, 4), (v) => {
      const t = v.x / 0.62 + 0.5;
      v.z *= 1 + 0.12 * Math.sin(t * 5 + seed);
      v.y += Math.sin(t * Math.PI) * 0.025 + v.z * v.z * 0.5;
      const edge = smoothstep(0.09, 0.15, Math.abs(v.z));
      const line = smoothstep(0.75, 0.95, Math.cos(v.z * 40 + seed)) * 0.3;
      const end = smoothstep(0.85, 1, t) * 0.7;
      return lerp3(lerp3(rib, ribSpice, Math.max(edge * 0.75, end)), ribSpice, line);
    });
  }
  return deform(new SphereGeometry(0.5, 28, 8), (v) => {
    const a = Math.atan2(v.z, v.x);
    const flat = Math.min(1, Math.hypot(v.x, v.z) * 2);
    // 고르지 않은 잎 윤곽 (큰 굴곡 + 잔 톱니)
    const r = (1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 5 + seed * 2) + 0.05 * Math.sin(a * 11 + seed * 3)) * flat * 0.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.78;
    // 구겨진 잎: 큰 물결 + 잔 주름 (위아래로 출렁여 일부는 반죽에 잠기고 일부는 올라온다)
    const fold = Math.sin(x * 8 + seed) * Math.cos(z * 7 - seed);
    const y = v.y * 0.07 + fold * 0.07 + Math.sin(x * 15 + z * 5 + seed) * 0.02;
    v.set(x, y, z);
    // 2번: 한쪽 가장자리에 연한 줄기 띠
    if (v3 === 2 && x < -0.22) return lerp3(rib, ribSpice, smoothstep(-0.26, -0.22, x) * 0.6);
    const c = lerp3(lerp3(red, redDeep, smoothstep(-0.2, -0.6, fold)), redHi, smoothstep(0.45, 0.8, fold) * 0.6);
    // 가장자리는 짙게 (얇은 잎도 윤곽이 보이게: 안쪽 외곽선)
    return lerp3(c, redDeep, smoothstep(0.82, 0.98, flat) * 0.5);
  });
}

/**
 * 시금치 한 잎 (데친 잎): 둥근 숟가락 모양 잎 + 연두 줄기 (0번은 뿌리 끝이 분홍) — 길이 1(x), 폭 약 0.55(z), 위가 y.
 * 축 처지고 가장자리가 살짝 말렸다. 가운데 잎맥은 줄기색 쪽으로, 가장자리는 짙게(안쪽 외곽선). 색을 꼭짓점에 굽는다.
 * palette: fresh(끓는 물 속 갓 넣은 잎, 밝은 초록) · cooked(데쳐 무친 잎, 짙은 초록) · mushy(너무 익어 누렇게 뜬 실패작, 칙칙한 올리브색).
 * 예전: 끝이 뾰족한 길쭉한 띠(대나무 잎·풀잎처럼 보였다).
 */
export type GreensPalette = 'fresh' | 'cooked' | 'mushy';
const GREENS: Record<GreensPalette, { leaf: string; deep: string; stem: string }> = {
  fresh: { leaf: '#4FA238', deep: '#2F7424', stem: '#A3CF5E' },
  cooked: { leaf: '#2E6A28', deep: '#1B4318', stem: '#78A848' },
  mushy: { leaf: '#6E7436', deep: '#4A4F22', stem: '#A3A15C' },
};
function spinachLeaf(variant: number, palette: GreensPalette): BufferGeometry {
  const seed = 0.8 + variant * 2.2;
  const pal = GREENS[palette];
  const leaf = lin(pal.leaf);
  const deep = lin(pal.deep);
  const stem = lin(pal.stem);
  const root = lin(palette === 'mushy' ? '#9A7A62' : '#B9707A');
  const blade0 = 0.3;
  const len = [1, 0.88, 1.06][variant % 3]!;
  return deform(new PlaneGeometry(1, 1, 18, 10), (v) => {
    const t = v.x + 0.5; // 0 = 뿌리 끝, 1 = 잎 끝
    const s = v.y * 2; // -1 ~ 1 (폭 방향)
    const u = clamp01((t - blade0) / (1 - blade0));
    const blade = t >= blade0 ? 0.27 * Math.pow(Math.max(0, 1 - (2 * u - 1) ** 2), 0.42) : 0;
    const half = Math.max(0.026, blade);
    // 축 처진 잎: 가운데가 조금 높고 양 끝이 처진다 + 가장자리는 살짝 말려 오르고 잔물결
    const droop = -0.3 * (t - 0.5) ** 2;
    // 데친 잎은 가운데 잎맥을 따라 살짝 접히고 쭈글쭈글하다 (생 잎처럼 판판하면 바질·담쟁이 잎처럼 보였다)
    const cup = Math.abs(s) * half * 0.55;
    const wave = (Math.sin(t * 13 + seed) * Math.cos(s * 3.5 + seed * 0.5) * 0.045 + Math.sin(t * 23 + s * 5 + seed) * 0.015) * smoothstep(0.25, 0.45, t);
    v.set((t - 0.5) * len, droop + cup + wave, s * half);
    if (t < blade0 + 0.02) return variant % 3 === 0 && t < 0.045 ? root : stem;
    const vein = (1 - smoothstep(0.06, 0.14, Math.abs(s))) * (1 - u * 0.7);
    const rim = smoothstep(0.82, 0.97, Math.abs(s)) * 0.6 + smoothstep(0.93, 1, u) * 0.4;
    return lerp3(lerp3(leaf, stem, vein * 0.6), deep, Math.min(1, rim));
  });
}

/**
 * 고사리 한 줄기: 가늘고 긴 갈색 줄기, 살짝 휘었다. 0번은 끝이 말린 고사리 순 머리 — 길이 1.
 * 예전에는 채 썬 납작한 막대(소시지·나무토막처럼 보였다).
 */
function stalk(variant: number): BufferGeometry {
  const v = variant % 3;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const bend = v === 2 ? Math.sin(t * Math.PI * 2) * 0.05 : Math.sin(t * Math.PI) * 0.07;
    pts.push(new Vector3(t - 0.5, 0, bend));
  }
  if (v === 0) {
    // 말린 머리 (3/4 바퀴, 안으로 갈수록 작게)
    const end = pts[pts.length - 1]!;
    for (let i = 1; i <= 7; i++) {
      const a = (i / 7) * Math.PI * 1.6;
      const r = 0.075 * (1 - i / 10);
      pts.push(new Vector3(end.x + Math.sin(a) * r, 0, end.z + (1 - Math.cos(a)) * r));
    }
  }
  return deform(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.042, 6, false), (p) => {
    p.y *= 0.8;
    return 0.86 + 0.14 * smoothstep(-0.02, 0.03, p.y);
  });
}

/** 밥알: 길쭉한 타원 — 길이 1 */
function grain(): BufferGeometry {
  return deform(new SphereGeometry(0.5, 10, 6), (v) => {
    v.set(v.x, v.y * 0.46, v.z * 0.5);
  });
}

const cache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/** 조각 모양 (variant로 같은 재료도 몇 가지 다른 모양을 섞는다) */
export function pieceGeometry(shape: PieceShape | 'grain', variant = 0): BufferGeometry {
  const v = variant % 3;
  return cached(`${shape}:${v}`, () => {
    const seed = 1.3 + v * 2.7;
    switch (shape) {
      case 'cube':
        return roundedBox(0.12, seed);
      case 'bean':
        // 으깬 콩알: 둥글고 한쪽이 눌린 타원
        return blob(0.12, 3, seed, [1, 0.72, 0.82]);
      case 'chunk':
        return blob(0.22, 2.4, seed);
      case 'nut':
        return walnut(seed);
      case 'ring':
        return deform(new TorusGeometry(1, 0.2, 10, 26), (p) => {
          p.multiplyScalar(1 + bumps(p.x, p.y, p.z, 3, seed) * 0.06);
        });
      case 'curl':
        return new TorusGeometry(1, 0.42, 12, 22, Math.PI * 1.3);
      case 'leaf':
        return leaf(seed);
      case 'kimchi':
        return kimchiPiece(v);
      case 'strip':
        return strip(seed);
      case 'stalk':
        return stalk(v);
      case 'slice':
        return slice(seed);
      case 'seed':
        return blob(0.05, 2, seed, [1, 0.42, 0.62]);
      case 'mince':
        // 다진 마늘·생강: 작고 모난 알갱이
        return blob(0.28, 3.4, seed, [1, 0.62, 0.85]);
      case 'grain':
        return grain();
    }
  });
}

/** 시금치 잎 모양 (variant로 세 가지, 색은 palette: 끓는 물 속 밝은 초록 · 데쳐 무친 짙은 초록 · 너무 익은 올리브색) */
export function spinachGeometry(variant = 0, palette: GreensPalette = 'cooked'): BufferGeometry {
  const v = variant % 3;
  return cached(`spinach:${v}:${palette}`, () => spinachLeaf(v, palette));
}

/** 꼭짓점에 색을 구운 조각 (재질·조각 색은 흰색으로 둔다) */
export const BAKED_COLOR: Partial<Record<PieceShape, boolean>> = { kimchi: true };

/** 접시·팬 위 소스 웅덩이: 가장자리가 고르지 않은 납작한 언덕 — 반지름 1, 높이 1 */
export function sauceGeometry(seed: number): BufferGeometry {
  return cached(`sauce:${seed}`, () =>
    deform(new SphereGeometry(1, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2), (v) => {
      const a = Math.atan2(v.z, v.x);
      const edge = 1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 7 + seed * 2) * 0.04;
      v.set(v.x * edge, v.y + bumps(v.x, 0, v.z, 6, seed) * 0.08 * v.y, v.z * edge);
    }),
  );
}

/** 밥 더미 바탕 (밥알 사이 틈이 비어 보이지 않게): 울퉁불퉁한 반구 — 반지름 1 */
export function moundGeometry(seed: number): BufferGeometry {
  return cached(`mound:${seed}`, () =>
    deform(new SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), (v) => {
      v.multiplyScalar(1 + bumps(v.x, v.y, v.z, 7, seed) * 0.04);
    }),
  );
}

/**
 * 바삭한 전 가장자리: 큰 물결 + 군데군데 작게 파인 자리 + 잔 레이스 (반지름 배율, 대략 0.93~1.07).
 * 얇게 펴서 기름에 지진 전은 가장자리가 고르지 않고 바삭하게 튀겨져 레이스처럼 된다. 둥근 원판이면 오믈렛·피자처럼 보였다.
 */
export function lacyEdge(a: number, seed: number): number {
  const waves = Math.sin(a * 5 + seed) * 0.032 + Math.sin(a * 9 + seed * 3) * 0.02 + Math.sin(a * 17 + seed * 2) * 0.012;
  const notch = Math.pow(0.5 + 0.5 * Math.sin(a * 23 + Math.sin(a * 5 + seed) * 2), 10) * 0.05;
  return 1 + waves - notch + Math.sin(a * 37 + seed) * 0.008;
}

/**
 * 전·부침개 (만화풍): 얇은 원판 — 반지름 1, 두께 1.
 * crisp(바삭하게 잘 부친 전): 가장자리가 레이스처럼 들쭉날쭉하고 얇게 들뜨며, 윗면은 잔 굴곡(기름 윤기가 작은 점들로 맺힌다).
 *   노릇함은 꼭짓점 색을 '단계'로 끊어 넣는다: 바깥 레이스는 짙은 갈색, 그 안쪽 고르지 않은 띠는 바삭한 갈색, 윗면에 노릇한 얼룩과 바삭한 점, 아랫면은 노릇.
 * crisp가 아니면(눅눅한 실패작): 가장자리가 둥글게 처지고 매끈하며 노릇함이 없다.
 */
export function pancakeGeometry(seed: number, crisp = true): BufferGeometry {
  return cached(`pancake:${seed}:${crisp}`, () =>
    deform(new SphereGeometry(1, 160, 36), (v) => {
      const a = Math.atan2(v.z, v.x);
      const ring = Math.hypot(v.x, v.z);
      const edge = crisp ? lacyEdge(a, seed) : 1 + Math.sin(a * 4 + seed) * 0.03 + Math.sin(a * 7 + seed * 2) * 0.015;
      const up = v.y >= 0;
      const x = v.x * edge;
      const z = v.z * edge;
      let h = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.3) * 0.5;
      if (crisp) {
        // 바삭한 가장자리는 얇고 살짝 출렁이며 들뜬다
        const outer = smoothstep(0.78, 1, ring);
        h = h * (1 - 0.45 * outer) + outer * Math.sin(a * 13 + seed) * 0.12;
      }
      // 윗면 굴곡: 바삭한 전은 잔 굴곡(윤기 점), 눅눅한 전은 느린 물결만
      const surface = up ? (crisp ? bumps(x, 0, z, 9, seed) * 0.06 + Math.sin(x * 4.2 + seed) * Math.cos(z * 3.7 - seed) * 0.05 : Math.sin(x * 3 + seed) * Math.cos(z * 2.6 - seed) * 0.09 + Math.sin(x * 5.5 - seed) * 0.03) : 0;
      v.set(x, h * (1 - ring * 0.25) + surface * (1 - ring * 0.5), z);
      return pancakeShade(ring, bumps(x, 0, z, 3.2, seed + 2.5), up, crisp ? { a, speck: bumps(x, 0, z, 13, seed + 7), seed } : null);
    }),
  );
}

/** 전 색 단계(반죽 색에 곱한다): 밝은 반죽 → 노릇한 얼룩 → 바삭한 갈색 띠 → 짙은 레이스 끝. 경계를 좁게(또렷하게) 둔다 */
export const PANCAKE_TONES = {
  base: [1, 1, 1] as [number, number, number],
  golden: [0.86, 0.66, 0.44] as [number, number, number],
  crisp: [0.66, 0.42, 0.22] as [number, number, number],
  lace: [0.48, 0.28, 0.13] as [number, number, number],
  /** 눅눅한 전 아랫면: 노릇하지 않고 살짝 짙을 뿐 */
  soggy: [0.92, 0.88, 0.82] as [number, number, number],
};
/**
 * 전 한 점의 색 단계. crisp가 없으면 눅눅한 전(노릇한 얼룩·바삭한 띠 없음).
 * crisp.a: 둘레 각도(바삭한 띠 안쪽 경계를 고르지 않게), crisp.speck: 바삭한 점 무늬 값.
 */
export function pancakeShade(ring: number, field: number, up: boolean, crisp: { a: number; speck: number; seed: number } | null = { a: 0, speck: -1, seed: 0 }): [number, number, number] {
  if (!crisp) return up ? PANCAKE_TONES.base : PANCAKE_TONES.soggy;
  if (!up) return PANCAKE_TONES.golden;
  // 노릇한 자리는 몇 군데만 (전체가 갈색이면 해시브라운·피자처럼 보였다)
  const patch = smoothstep(0.5, 0.55, field) * smoothstep(0.2, 0.45, ring);
  // 바삭한 띠: 가장자리 얇게, 안쪽 경계가 들쭉날쭉 (둥근 띠면 오믈렛 테두리처럼 보인다)
  const start = 0.86 + Math.sin(crisp.a * 7 + crisp.seed) * 0.03 + Math.sin(crisp.a * 13 + crisp.seed * 2) * 0.018;
  const band = smoothstep(start, start + 0.025, ring);
  const lace = smoothstep(0.945, 0.97, ring);
  // 바삭하게 튀겨진 작은 점: 가장자리 가까이만
  const speck = smoothstep(0.66, 0.7, crisp.speck) * smoothstep(0.62, 0.8, ring);
  let c = lerp3(PANCAKE_TONES.base, PANCAKE_TONES.golden, patch);
  c = lerp3(c, PANCAKE_TONES.crisp, Math.max(band, speck));
  return lerp3(c, PANCAKE_TONES.lace, lace);
}

/** 꼭짓점 색: 아래쪽 가닥일수록 짙게 (면 더미의 깊이. 두 단계 남짓으로 또렷하게) */
function shadeByHeight(g: BufferGeometry, y0: number, y1: number, low: number): BufferGeometry {
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = smoothstep(y0, y1, pos.getY(i));
    const s = low + (1 - low) * (0.35 * k + 0.65 * smoothstep(0.35, 0.55, k));
    colors.set([s, s, s * 0.97], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

/**
 * 면 가닥 묶음을 하나의 모양으로 합친다(가닥마다 따로 그리면 그리기 호출이 수십 번 → 한 번). 꼭짓점 색으로 아래 가닥을 짙게.
 * nest: 접시에 돌돌 말아 올린 봉긋한 둥지 (가닥이 비스듬히 서로 엇갈리며 감겨 올라간다).
 * 아니면 냄비 속: 소스 위로 봉긋하게 쌓인 느슨한 면 더미 + 둘레에 늘어진 고리 + 위로 들린 가닥 몇 개.
 * 예전: 가는 가닥이 같은 높이에 동심원처럼 깔려 위에서 보면 지문·나선 무늬처럼 보였다 → 굵은 가닥, 높이 차, 엇갈림, 깊이 그늘.
 */
export function noodleGeometry(o: { radius: number; height: number; nest: boolean }): BufferGeometry {
  return cached(`noodles:${o.radius}:${o.height}:${o.nest}`, () => {
    const rnd = seeded(11);
    const parts: BufferGeometry[] = [];
    const R = o.radius;
    const H = o.height;
    const tube = (pts: Vector3[], seg: number, r: number) => parts.push(new TubeGeometry(new CatmullRomCurve3(pts), seg, r, 7, false));
    // 고리 하나: 가운데에서 조금 비켜난 중심을 돌며 높이가 바뀌고, 비스듬히 기운다 (동심원이 되지 않게)
    const loop = (k: number, o2: { r0: number; r1: number; y0: number; y1: number; turns: number; tilt: number; off: number; dome: boolean }) => {
      const a0 = rnd() * Math.PI * 2;
      const cx = (rnd() - 0.5) * R * o2.off;
      const cz = (rnd() - 0.5) * R * o2.off;
      const ta = rnd() * Math.PI * 2;
      const tilt = (rnd() - 0.5) * o2.tilt;
      const n = 30;
      return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const a = a0 + t * o2.turns * Math.PI * 2;
        const y = o2.y0 + (o2.y1 - o2.y0) * t;
        const wob = 0.88 + 0.12 * Math.sin(a * 2 + k);
        const r = (o2.dome ? R * Math.sqrt(Math.max(0.03, 1 - (y / (H * 1.08)) ** 2)) : o2.r0 + (o2.r1 - o2.r0) * t) * wob;
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        // 기울기: 고리 면을 ta 방향으로 살짝 기울인다
        const lift = (px * Math.cos(ta) + pz * Math.sin(ta)) * tilt;
        return new Vector3(px + cx, Math.max(0.002, y + lift), pz + cz);
      });
    };
    if (o.nest) {
      // 접시 둥지: 아래에서 위로 감겨 올라가는 가닥 18개 (각자 다른 높이·기울기)
      for (let k = 0; k < 18; k++) {
        const y0 = H * (0.04 + rnd() * 0.35);
        tube(loop(k, { r0: 0, r1: 0, y0, y1: Math.min(H, y0 + H * (0.35 + rnd() * 0.5)), turns: 1 + rnd() * 0.8, tilt: 0.8, off: 0.28, dome: true }), 72, 0.0052);
      }
      // 둥지 위를 비스듬히 가로지르는 가닥 (감은 줄이 모두 수평이면 바구니·밧줄 뭉치처럼 보인다)
      for (let k = 0; k < 4; k++) {
        const a = rnd() * Math.PI * 2;
        const pts = Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          const u = (t - 0.5) * 1.7;
          const w = Math.sin(t * Math.PI);
          return new Vector3(Math.cos(a) * u * R + Math.sin(a) * w * R * 0.25, H * (0.45 + 0.6 * w), Math.sin(a) * u * R - Math.cos(a) * w * R * 0.25);
        });
        tube(pts, 40, 0.0052);
      }
      // 둥지 바깥으로 늘어진 짧은 가닥 끝 몇 개
      for (let k = 0; k < 4; k++) {
        const a = rnd() * Math.PI * 2;
        const pts = Array.from({ length: 8 }, (_, i) => {
          const t = i / 7;
          const r = R * (0.75 + t * 0.45);
          return new Vector3(Math.cos(a + t * 0.6) * r, Math.max(0.002, H * 0.25 * (1 - t)), Math.sin(a + t * 0.6) * r);
        });
        tube(pts, 20, 0.0054);
      }
      return shadeByHeight(mergeGeometries(parts)!, 0, H, 0.72);
    }
    // 냄비 속: 가운데가 봉긋한 느슨한 더미 + 둘레 고리 (소스 위아래로 드나든다)
    for (let k = 0; k < 14; k++) {
      const y0 = H * (0.05 + rnd() * 0.3);
      tube(loop(k, { r0: 0, r1: 0, y0, y1: Math.min(H, y0 + H * (0.3 + rnd() * 0.45)), turns: 0.9 + rnd() * 0.7, tilt: 0.5, off: 0.35, dome: true }), 64, 0.0042);
    }
    for (let k = 0; k < 7; k++) {
      const r0 = R * (0.62 + rnd() * 0.3);
      tube(loop(k + 20, { r0, r1: r0 * (0.85 + rnd() * 0.2), y0: -0.004, y1: H * 0.2, turns: 0.45 + rnd() * 0.35, tilt: 0.25, off: 0.15, dome: false }), 40, 0.0042);
    }
    // 위로 들린 가닥: 더미에서 솟아 아치를 그리며 바깥으로 (저을 때 들린 면)
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      const pts = Array.from({ length: 12 }, (_, i) => {
        const t = i / 11;
        const r = R * (0.15 + t * 0.7);
        return new Vector3(Math.cos(a + t * 0.9) * r, H * 0.5 + Math.sin(t * Math.PI) * H * 0.75, Math.sin(a + t * 0.9) * r);
      });
      tube(pts, 36, 0.0042);
    }
    return shadeByHeight(mergeGeometries(parts)!, 0, H * 1.6, 0.74);
  });
}

/**
 * 접시: 굽 + 평평한 바닥 + 살짝 올라온 테두리 (돌림판으로 깎은 단면을 돌려 만든다) — 반지름 약 0.2, 바닥 위 윗면 높이 약 0.018.
 * (예전: 납작한 원기둥이라 모서리가 각지고 흔한 흰 원판처럼 보였다)
 */
export function plateGeometry(): BufferGeometry {
  return cached('plate', () => {
    const pts = [
      [0, 0.016],
      [0.12, 0.016],
      [0.15, 0.018],
      [0.178, 0.024],
      [0.198, 0.029],
      [0.205, 0.028],
      [0.206, 0.025],
      [0.196, 0.022],
      [0.17, 0.014],
      [0.135, 0.006],
      [0.125, 0.0],
      [0.112, 0.0],
      [0.108, 0.004],
      [0, 0.004],
    ].map(([x, y]) => new Vector2(x, y));
    const g = new LatheGeometry(pts, 72);
    g.computeVertexNormals();
    return g;
  });
}

let steamTex: Texture | null = null;
/**
 * 만화 김 한 가닥: 위로 구불구불 올라가는 흰 S자 선(끝이 둥근 붓선 + 살짝 번진 테두리). 코드로 한 번만 그린다.
 * 만화·애니에서 '뜨겁다'를 알리는 상징 모양. 카메라를 향하는 판(스프라이트)에 붙여 올라가며 흔들리고 흐려지게 움직인다
 * (움직이는 김만 효과가 있다 — Zhang 외 2024).
 */
export function steamTexture(): Texture | null {
  if (steamTex) return steamTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = 32 + Math.sin(t * Math.PI * 2.2) * 14 * (0.5 + t * 0.5);
      const y = 148 - t * 136;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  // 번진 테두리 → 또렷한 가운데 선
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 16;
  path();
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 9;
  path();
  g.stroke();
  steamTex = new CanvasTexture(c);
  steamTex.colorSpace = SRGBColorSpace;
  return steamTex;
}
