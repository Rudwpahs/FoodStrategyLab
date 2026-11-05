// 음식 조각 3D 모양. 정육면체 대신 실제 썬 모양(콩알·깍둑 두부·송송 썬 고추·배추 잎·채 썬 양파 등)을
// 울퉁불퉁하게 만든다. 같은 입력이면 항상 같은 모양 (영상 프레임마다 모양이 바뀌면 안 된다).
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceShape } from '@mat-lab/recipe-core';

/** 같은 레시피면 항상 같은 모양이 나오도록 고정 난수 */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 부드러운 울퉁불퉁함 (사인파 몇 개를 겹친 값, 대략 -1~1) */
function bumps(x: number, y: number, z: number, k: number, seed: number): number {
  return (
    Math.sin(x * k + seed) * Math.cos(y * k * 1.3 + seed * 0.7) * 0.5 +
    Math.sin(z * k * 1.7 + seed * 1.9) * Math.cos(x * k * 0.8 - seed) * 0.35 +
    Math.sin((x + y + z) * k * 2.3 + seed * 3.1) * 0.15
  );
}

/** 이음매를 붙이고(매끈한 음영) 각 꼭짓점을 옮긴 뒤 법선을 다시 계산 */
function deform(g: BufferGeometry, fn: (v: Vector3) => void): BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  g.dispose();
  const pos = m.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  m.computeVertexNormals();
  return m;
}

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
        // 호두: 주름이 많은 덩어리
        return deform(new SphereGeometry(1, 28, 20), (p) => {
          p.multiplyScalar(1 + bumps(p.x, p.y, p.z, 9, seed) * 0.13 + bumps(p.x, p.y, p.z, 3, seed + 4) * 0.12);
          p.y *= 0.75;
        });
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

/** 전·부침개: 가장자리가 들쭉날쭉한 납작한 원판 — 반지름 1, 두께 1 */
export function pancakeGeometry(seed: number): BufferGeometry {
  return cached(`pancake:${seed}`, () =>
    deform(new CylinderGeometry(1, 1, 1, 64, 2), (v) => {
      const a = Math.atan2(v.z, v.x);
      const edge = 1 + Math.sin(a * 5 + seed) * 0.035 + Math.sin(a * 13 + seed * 3) * 0.02;
      const r = Math.hypot(v.x, v.z);
      // 가운데가 살짝 도톰하고 가장자리는 얇게
      v.set(v.x * edge, v.y * (1 - r * 0.35) + bumps(v.x, 0, v.z, 9, seed) * 0.12, v.z * edge);
    }),
  );
}
