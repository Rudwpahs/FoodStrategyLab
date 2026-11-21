// 음식 조각 3D 모양. 정육면체 대신 실제 썬 모양(콩알·깍둑 두부·송송 썬 고추·배추 잎·채 썬 양파 등)을
// 울퉁불퉁하게 만든다. 같은 입력이면 항상 같은 모양 (영상 프레임마다 모양이 바뀌면 안 된다).
import {
  BoxGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  BufferGeometry,
  CanvasTexture,
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

/** 구겨지고 살짝 말린 잎 조각 (김치·배추·시금치) — 가로 1 */
function leaf(seed: number): BufferGeometry {
  return deform(new PlaneGeometry(1, 0.75, 10, 8), (v) => {
    const wave = Math.sin(v.x * 11 + seed) * Math.cos(v.y * 9 + seed * 0.5) * 0.05;
    const curl = v.x * v.x * 0.35 + v.y * v.y * 0.2;
    // 가장자리를 들쭉날쭉하게
    const edge = 1 + Math.sin(Math.atan2(v.y, v.x) * 5 + seed) * 0.08;
    v.set(v.x * edge, v.y * edge, wave + curl);
  });
}

/** 채 썬 조각 (양파·당근·고기) — 길이 1, 살짝 휘어 있다 */
function strip(seed: number): BufferGeometry {
  return deform(new BoxGeometry(1, 0.16, 0.24, 14, 2, 2), (v) => {
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

/**
 * 호두 반쪽 알맹이 (만화풍): 가운데 골로 나뉜 두 덩이 + 굵고 큰 주름 서너 줄, 아래는 평평 — 길이 약 2.7.
 * 예전에는 뇌 모양 잔주름 + 틈 그늘을 꼼꼼히 넣어 '어설픈 사실풍'(가장 거부감이 큰 구간)이었다.
 * 만화 음식은 모양을 단순하게, 그늘은 두 단계로만 끊어 그린다(그림 실무). 꼭짓점 수도 줄였다(36×24 → 28×18).
 */
function walnut(seed: number): BufferGeometry {
  return deform(new SphereGeometry(1, 28, 18), (p) => {
    const { x, y, z } = p;
    const top = smoothstep(-0.35, 0.4, y);
    const groove = Math.exp(-((x / 0.2) ** 2)) * 0.3 * top;
    // 굵은 주름 몇 줄만 (덩이마다 결이 조금 다르게)
    const wave = Math.sin(z * 5.2 + Math.sin(x * 2.2 + seed) * 0.9 + seed);
    const ridge = wave * 0.12 * (0.35 + 0.65 * top);
    const lobe = bumps(x, y, z, 2.4, seed) * 0.05;
    p.multiplyScalar(1 - groove + ridge + lobe);
    p.set(p.x * 1.35, p.y > 0 ? p.y * 0.7 : p.y * 0.26, p.z);
    // 그늘 두 단계: 골·주름 안쪽만 짙게 (칼같이 끊음)
    return 0.6 + 0.4 * smoothstep(-0.05, -0.02, ridge - groove * 0.8);
  });
}

/**
 * 데쳐서 무친 나물 한 가닥: 길쭉한 잎이 비틀리고 휘었다. 줄기 쪽(왼쪽 끝)은 연두색으로 밝다 — 길이 1.
 * 만화풍에서는 잎맥 같은 잔무늬를 넣지 않는다(줄기 색만 또렷하게).
 */
function wilted(seed: number): BufferGeometry {
  return deform(new PlaneGeometry(1, 0.26, 14, 2), (v) => {
    const t = v.x + 0.5; // 0 = 줄기 끝, 1 = 잎 끝
    const leaf = smoothstep(0.25, 0.45, t);
    const width = 0.28 + 0.72 * leaf * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.04, (t - 0.2) / 0.8 + 0.08))), 0.6);
    const y0 = v.y * width;
    const twist = (t - 0.3) * 2.4 + seed;
    const y = y0 * Math.cos(twist);
    const z = y0 * Math.sin(twist) + (t - 0.5) * (t - 0.5) * 0.45 + Math.sin(t * 6 + seed) * 0.05;
    v.set(v.x, y, z);
    // 줄기는 밝은 연두 (두 단계로 끊어서)
    const stem: [number, number, number] = [1.45, 1.35, 0.85];
    return lerp3(stem, [1, 1, 1], smoothstep(0.3, 0.36, t));
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
      case 'strip':
        return strip(seed);
      case 'slice':
        return slice(seed);
      case 'seed':
        return blob(0.05, 2, seed, [1, 0.42, 0.62]);
      case 'grain':
        return grain();
    }
  });
}

/** 나물 가닥 모양 (variant로 세 가지) */
export function wiltedGeometry(variant = 0): BufferGeometry {
  const v = variant % 3;
  return cached(`wilted:${v}`, () => wilted(0.7 + v * 2.1));
}

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
 * 전·부침개 (만화풍): 가장자리가 둥글게 물결치는 납작한 원판 — 반지름 1, 두께 1.
 * 노릇함은 꼭짓점 색을 '단계'로 끊어 넣는다: 가장자리를 도는 바삭한 갈색 띠 + 윗면의 큰 노릇한 얼룩 몇 개(경계가 또렷하게), 아랫면은 전체가 노릇.
 * 예전에는 잔 얼룩(촘촘한 무늬)과 잔물결로 사실처럼 만들려 했는데, 멀리서는 덜 익은 반죽, 가까이서는 어색한 사진처럼 보였다.
 */
export function pancakeGeometry(seed: number): BufferGeometry {
  return cached(`pancake:${seed}`, () =>
    deform(new SphereGeometry(1, 96, 36), (v) => {
      const a = Math.atan2(v.z, v.x);
      const ring = Math.hypot(v.x, v.z);
      // 큰 물결 몇 개만 (만화 전은 테두리가 둥글게 출렁인다)
      const edge = 1 + Math.sin(a * 5 + seed) * 0.045 + Math.sin(a * 9 + seed * 3) * 0.02;
      const up = v.y >= 0;
      const h = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.3) * 0.5;
      const x = v.x * edge;
      const z = v.z * edge;
      // 윗면은 느린 물결로 살짝 도톰하게 (잔물결 없음)
      const surface = up ? Math.sin(x * 4.2 + seed) * Math.cos(z * 3.7 - seed) * 0.06 : 0;
      v.set(x, h * (1 - ring * 0.25) + surface * (1 - ring * 0.5), z);
      return pancakeShade(ring, bumps(x, 0, z, 3.2, seed + 2.5), up);
    }),
  );
}

/** 전 색 단계: 밝은 반죽 → 노릇한 얼룩 → 바삭한 갈색 테두리. 경계를 좁게(또렷하게) 둔다 */
export const PANCAKE_TONES = {
  base: [1, 1, 1] as [number, number, number],
  golden: [0.84, 0.6, 0.34] as [number, number, number],
  crisp: [0.58, 0.33, 0.14] as [number, number, number],
};
export function pancakeShade(ring: number, field: number, up: boolean): [number, number, number] {
  if (!up) return PANCAKE_TONES.golden;
  const patch = smoothstep(0.32, 0.37, field);
  const rim = smoothstep(0.82, 0.86, ring);
  return lerp3(lerp3(PANCAKE_TONES.base, PANCAKE_TONES.golden, patch), PANCAKE_TONES.crisp, rim);
}

/**
 * 면 가닥 묶음을 하나의 모양으로 합친다(가닥마다 따로 그리면 그리기 호출이 수십 번 → 한 번).
 * nest면 접시에 돌돌 말아 올린 둥지 모양, 아니면 냄비 속에 흩어진 가닥.
 * 만화풍: 가닥을 조금 굵고 적게 (가는 가닥 수십 개는 멀리서 회색 실뭉치처럼 보였다).
 */
export function noodleGeometry(o: { radius: number; height: number; nest: boolean }): BufferGeometry {
  return cached(`noodles:${o.radius}:${o.height}:${o.nest}`, () => {
    const rnd = seeded(11);
    const parts: BufferGeometry[] = [];
    if (o.nest) {
      for (let k = 0; k < 22; k++) {
        const start = rnd() * Math.PI * 2;
        const turns = 1.2 + rnd() * 0.9;
        const pts = Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          const a = start + t * turns * Math.PI * 2;
          const r = o.radius * (1 - t * 0.78) * (0.85 + rnd() * 0.25);
          const y = o.height * (0.15 + t * 0.95) * (1 - (r / o.radius) ** 2 * 0.4) + (rnd() - 0.5) * 0.006 + (k % 3) * 0.002;
          return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        });
        parts.push(new TubeGeometry(new CatmullRomCurve3(pts), 72, 0.0045, 6, false));
      }
    } else {
      // 냄비 속: 물속에서 빙글 도는 긴 곡선 가닥 (짧게 꺾인 직선은 감자튀김처럼 보였다)
      for (let k = 0; k < 18; k++) {
        const start = rnd() * Math.PI * 2;
        const turns = 0.5 + rnd() * 0.6;
        const r0 = o.radius * (0.3 + rnd() * 0.6);
        const pts = Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          const a = start + t * turns * Math.PI * 2;
          const r = Math.min(o.radius * 0.95, r0 * (0.8 + 0.4 * Math.sin(t * 3 + k)));
          return new Vector3(Math.cos(a) * r, o.height * (0.4 + 0.6 * Math.sin(t * 5 + k) ** 2), Math.sin(a) * r);
        });
        parts.push(new TubeGeometry(new CatmullRomCurve3(pts), 48, 0.0045, 6, false));
      }
    }
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    return merged;
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
