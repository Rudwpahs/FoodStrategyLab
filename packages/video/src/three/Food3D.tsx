import React, { useMemo } from 'react';
import { Color } from 'three';
import type { FoodProfile, IngredientProp } from '@mat-lab/recipe-core';
import { Plate } from './Kitchen.tsx';
import { BURNER } from './layout.ts';

/** 같은 레시피면 항상 같은 모양이 나오도록 고정 난수 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t))).getHexString();
}

const M: React.FC<{ color: string; rough?: number; opacity?: number; emissive?: string; metal?: number }> = ({ color, rough = 0.75, opacity, emissive, metal = 0 }) => (
  <meshStandardMaterial
    color={color}
    roughness={rough}
    metalness={metal}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
    emissive={emissive ?? '#000000'}
    emissiveIntensity={emissive ? 0.9 : 0}
  />
);

/** 건더기 조각 위치 (원판 위에 흩뿌림) */
function useBits(count: number, radius: number, seed: number) {
  return useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rnd() * Math.PI, s: 0.6 + rnd() * 0.6, c: rnd() };
    });
  }, [count, radius, seed]);
}

// ---------- 조리 도구 ----------

export const Pan: React.FC<{ children?: React.ReactNode; shake?: number }> = ({ children, shake = 0 }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]} rotation={[0, 0, shake]}>
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[0.2, 0.17, 0.045, 32]} />
      <M color="#2E3036" rough={0.45} metal={0.3} />
    </mesh>
    <mesh position={[0, 0.0235, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[0.185, 32]} />
      <M color="#3A3D45" rough={0.5} />
    </mesh>
    <mesh position={[0.33, 0.02, 0.06]} rotation={[0, -0.2, 0.08]} castShadow>
      <boxGeometry args={[0.28, 0.025, 0.04]} />
      <M color="#3B2A20" />
    </mesh>
    <group position={[0, 0.025, 0]}>{children}</group>
  </group>
);

export const Pot: React.FC<{ children?: React.ReactNode; liquid?: string }> = ({ children, liquid }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]}>
    <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.17, 0.16, 0.17, 32, 1, true]} />
      <meshStandardMaterial color="#C7CCD3" roughness={0.3} metalness={0.55} side={2} />
    </mesh>
    <mesh position={[0, 0.005, 0]} receiveShadow>
      <cylinderGeometry args={[0.16, 0.16, 0.01, 32]} />
      <M color="#AEB3BA" />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 0.2, 0.13, 0]} castShadow>
        <boxGeometry args={[0.06, 0.02, 0.05]} />
        <M color="#26272B" />
      </mesh>
    ))}
    {liquid && (
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.165, 32]} />
        <M color={liquid} rough={0.15} opacity={0.85} />
      </mesh>
    )}
    <group position={[0, 0.13, 0]}>{children}</group>
  </group>
);

export const Bowl: React.FC<{ children?: React.ReactNode; liquid?: string; position?: [number, number, number] }> = ({ children, liquid, position = [0, 0.02, 0] }) => (
  <group position={position}>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow>
      <sphereGeometry args={[0.14, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#F7F3EA" roughness={0.4} side={2} />
    </mesh>
    {liquid && (
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 28]} />
        <M color={liquid} rough={0.2} />
      </mesh>
    )}
    <group position={[0, 0.05, 0]}>{children}</group>
  </group>
);

// ---------- 음식 ----------

/** 전·부침개: 원판 + 건더기 + 구운 자국. flip(0~1)이면 뒤집는다. */
const Pancake: React.FC<{ food: FoodProfile; cook: number; flip?: number; soggy?: boolean }> = ({ food, cook, flip = 0, soggy }) => {
  const bits = useBits(22, 0.125, 7);
  const spots = useBits(7, 0.11, 21);
  const color = soggy ? mix(food.rawColor, '#B8A27A', 0.4) : mix(food.rawColor, food.cookedColor, cook);
  const lift = Math.sin(flip * Math.PI) * 0.16;
  return (
    <group position={[0, 0.012 + lift, 0]} rotation={[flip * Math.PI, 0, 0]} scale={[1, soggy ? 0.55 : 1, 1]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.155, 0.022, 28]} />
        <M color={color} rough={soggy ? 0.25 : 0.8} />
      </mesh>
      {bits.map((b, i) => (
        <mesh key={i} position={[b.x, 0.0125, b.z]} rotation={[0, b.rot, 0]} scale={b.s}>
          <boxGeometry args={[0.018, 0.005, 0.009]} />
          <M color={food.bits[i % Math.max(1, food.bits.length)] ?? '#C9853F'} />
        </mesh>
      ))}
      {cook > 0.55 &&
        !soggy &&
        spots.map((b, i) => (
          <mesh key={i} position={[b.x, 0.0115, b.z]} rotation={[-Math.PI / 2, 0, 0]} scale={b.s}>
            <circleGeometry args={[0.012, 10]} />
            <M color={mix(food.cookedColor, '#7A4A1C', 0.3)} opacity={Math.min(0.8, (cook - 0.55) * 2)} />
          </mesh>
        ))}
    </group>
  );
};

/** 볶음·기타: 작은 조각 더미 */
const Heap: React.FC<{ food: FoodProfile; cook: number; jiggle?: number; radius?: number }> = ({ food, cook, jiggle = 0, radius = 0.13 }) => {
  const bits = useBits(26, radius, 3);
  // 견과류(호두 등)는 둥근 조각으로, 시럽에 조린 듯 윤기 있게
  const nutty = food.bits[0] === '#A9733F';
  const palette = nutty ? [mix(food.rawColor, food.cookedColor, cook), mix(food.rawColor, food.cookedColor, cook * 0.8)] : [mix(food.rawColor, food.cookedColor, cook), ...food.bits];
  return (
    <group>
      {bits.map((b, i) => (
        <mesh key={i} position={[b.x, 0.015 + (1 - Math.hypot(b.x, b.z) / radius) * 0.04 + Math.sin(jiggle + i) * 0.006, b.z]} rotation={[b.rot, b.rot * 2, 0]} scale={b.s} castShadow>
          {nutty ? <dodecahedronGeometry args={[0.02, 0]} /> : <boxGeometry args={[0.035, 0.022, 0.03]} />}
          <M color={palette[Math.floor(b.c * palette.length)] ?? palette[0]!} rough={nutty ? 0.45 : 0.75} />
        </mesh>
      ))}
    </group>
  );
};

const Leaves: React.FC<{ color: string; count?: number; radius?: number; mound?: number; seed?: number }> = ({ color, count = 12, radius = 0.11, mound = 0.05, seed = 5 }) => {
  const leaves = useBits(count, radius, seed);
  return (
    <group>
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.x, 0.012 + (1 - Math.hypot(l.x, l.z) / radius) * mound, l.z]} rotation={[0.3 * l.c, l.rot, 0.4]} scale={[0.055 * l.s, 0.012, 0.03 * l.s]} castShadow>
          <sphereGeometry args={[1, 10, 6]} />
          <M color={mix(color, '#2F6E2A', l.c * 0.4)} />
        </mesh>
      ))}
    </group>
  );
};

const Eggs: React.FC<{ count?: number; halved?: boolean }> = ({ count = 3, halved }) => (
  <group>
    {Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * 0.07;
      const z = Math.sin(a) * 0.07;
      return halved ? (
        <group key={i} position={[x, 0.045, z]} rotation={[0, a, 0]}>
          {/* 단면이 위를 보는 반쪽 달걀 */}
          <mesh scale={[0.045, 0.035, 0.06]} castShadow>
            <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <M color="#FFFDF6" rough={0.4} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.045, 0.06, 1]}>
            <circleGeometry args={[1, 20]} />
            <M color="#FFFDF6" rough={0.4} />
          </mesh>
          <mesh position={[0, 0.003, 0]} scale={[0.024, 0.008, 0.028]}>
            <sphereGeometry args={[1, 14, 8]} />
            <M color="#F6B526" rough={0.5} />
          </mesh>
        </group>
      ) : (
        <mesh key={i} position={[x, 0, z]} rotation={[0.4, a, 0.3]} scale={[0.04, 0.052, 0.04]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          <M color="#FFF3E0" rough={0.5} />
        </mesh>
      );
    })}
  </group>
);

const Noodles: React.FC<{ color: string }> = ({ color }) => {
  const strands = useBits(9, 0.06, 11);
  return (
    <group>
      {strands.map((s, i) => (
        <mesh key={i} position={[s.x, 0.005, s.z]} rotation={[-Math.PI / 2, 0, s.rot]}>
          <torusGeometry args={[0.04 * s.s, 0.005, 6, 20, Math.PI * 1.6]} />
          <M color={color} />
        </mesh>
      ))}
    </group>
  );
};

const RiceMound: React.FC = () => (
  <mesh position={[0, 0, 0]} scale={[0.11, 0.07, 0.11]} castShadow>
    <sphereGeometry args={[1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <M color="#FFFDF5" rough={0.9} />
  </mesh>
);

const Bubbles: React.FC<{ frame: number; on: boolean }> = ({ frame, on }) => {
  const pts = useBits(8, 0.12, 13);
  if (!on) return null;
  return (
    <group>
      {pts.map((p, i) => {
        const t = ((frame + i * 7) % 24) / 24;
        return (
          <mesh key={i} position={[p.x, 0.004, p.z]} scale={0.012 * Math.sin(t * Math.PI)}>
            <sphereGeometry args={[1, 8, 6]} />
            <M color="#FFFFFF" opacity={0.8} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 가스레인지 위 조리 중인 음식 */
export const CookingFood: React.FC<{ food: FoodProfile; cook: number; frame: number; stirring: boolean; flip: number; showFood: boolean }> = ({ food, cook, frame, stirring, flip, showFood }) => {
  const boiling = showFood && cook > 0.05;
  if (!showFood) return food.vessel === 'pan' ? <Pan /> : <Pot liquid={food.kind === 'rice' ? undefined : food.liquidColor} />;
  switch (food.kind) {
    case 'pancake':
      return (
        <Pan shake={stirring ? Math.sin(frame / 3) * 0.015 : 0}>
          <Pancake food={food} cook={cook} flip={flip} />
        </Pan>
      );
    case 'stirfry':
    case 'generic':
      return (
        <Pan shake={stirring ? Math.sin(frame / 3) * 0.02 : 0}>
          <Heap food={food} cook={cook} jiggle={stirring ? frame / 3 : 0} />
        </Pan>
      );
    case 'egg':
      return (
        <Pot liquid={food.liquidColor}>
          <Eggs />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'greens':
      return (
        <Pot liquid={food.liquidColor}>
          <Leaves color={mix(food.rawColor, food.cookedColor, cook)} radius={0.12} mound={0.01} />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'noodles':
      return (
        <Pot liquid={food.liquidColor}>
          <Noodles color={mix(food.rawColor, food.cookedColor, cook)} />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'rice':
      return (
        <Pot>
          <group position={[0, -0.05, 0]}>
            <RiceMound />
          </group>
        </Pot>
      );
    case 'soup':
      return (
        <Pot liquid={mix('#E9DCC0', food.liquidColor ?? food.cookedColor, cook)}>
          <Heap food={food} cook={cook} radius={0.11} jiggle={frame / 6} />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
  }
};

/** 접시에 담은 완성 음식 (실패 버전 포함) */
export const PlatedFood: React.FC<{ food: FoodProfile | null; failed?: boolean; frame: number; origin: [number, number, number] }> = ({ food, failed, frame, origin }) => (
  <group position={origin}>
    <Plate />
    {food && <PlateContent food={food} failed={failed} frame={frame} />}
  </group>
);

const PlateContent: React.FC<{ food: FoodProfile; failed?: boolean; frame: number }> = ({ food, failed, frame }) => {
  const sesame = useBits(10, 0.08, 31);
  const top = [0, 0.022, 0] as [number, number, number];
  const content = (() => {
    switch (food.kind) {
      case 'pancake':
        return (
          <group position={top}>
            <Pancake food={food} cook={failed ? 0.25 : 1} soggy={failed} />
          </group>
        );
      case 'egg':
        return (
          <group position={top}>
            <Eggs count={4} halved />
          </group>
        );
      case 'greens':
        return (
          <group position={top}>
            <Leaves color={failed ? '#7C8A4A' : food.cookedColor} count={16} radius={0.1} mound={failed ? 0.02 : 0.06} />
            {!failed &&
              sesame.map((s, i) => (
                <mesh key={i} position={[s.x, 0.075 - Math.hypot(s.x, s.z) * 0.4, s.z]} scale={0.006}>
                  <sphereGeometry args={[1, 6, 4]} />
                  <M color="#F1E3B8" />
                </mesh>
              ))}
          </group>
        );
      case 'soup':
        return <Bowl liquid={failed ? '#D8CBB0' : food.liquidColor ?? food.cookedColor}><Heap food={food} cook={1} radius={0.09} /></Bowl>;
      case 'noodles':
        return <Bowl liquid={food.liquidColor}><Noodles color={food.cookedColor} /></Bowl>;
      case 'rice':
        return <Bowl><RiceMound /></Bowl>;
      default:
        return (
          <group position={top}>
            <Heap food={food} cook={failed ? 0.3 : 1} radius={0.12} />
          </group>
        );
    }
  })();
  return (
    <group>
      {content}
      {!failed && <Steam origin={[0, 0.07, 0]} frame={frame} />}
    </group>
  );
};

/** 김: 반투명 구슬이 올라가며 사라진다 */
export const Steam: React.FC<{ origin: [number, number, number]; frame: number; amount?: number }> = ({ origin, frame, amount = 6 }) => {
  const pts = useBits(amount, 0.08, 17);
  return (
    <group position={origin}>
      {pts.map((p, i) => {
        const t = ((frame + i * 11) % 60) / 60;
        return (
          <mesh key={i} position={[p.x + Math.sin(t * 6 + i) * 0.02, t * 0.35, p.z]} scale={0.025 + t * 0.04}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#FFFFFF" transparent opacity={0.35 * (1 - t)} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 가스 불꽃 */
export const Flame: React.FC<{ frame: number; on: boolean }> = ({ frame, on }) => {
  if (!on) return null;
  return (
    <group position={[BURNER[0], BURNER[1] + 0.012, BURNER[2]]}>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const h = 0.035 + Math.sin(frame * 0.9 + i * 1.7) * 0.01;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.075, h / 2, Math.sin(a) * 0.075]}>
            <coneGeometry args={[0.012, h, 6]} />
            <M color="#5AA9FF" emissive="#3D8BFF" opacity={0.9} />
          </mesh>
        );
      })}
      <pointLight color="#FF9A4A" intensity={0.12} distance={0.5} position={[0, 0.02, 0.2]} />
    </group>
  );
};

// ---------- 재료 소품 ----------

export const IngredientModel: React.FC<{ prop: IngredientProp; position: [number, number, number]; pop: number }> = ({ prop, position, pop }) => {
  if (pop <= 0.001) return null;
  const s = pop;
  const body = (() => {
    switch (prop.shape) {
      case 'egg':
        return (
          <group>
            {[-0.035, 0.035].map((x, i) => (
              <mesh key={i} position={[x, 0.045, i * 0.02]} scale={[0.038, 0.05, 0.038]} castShadow>
                <sphereGeometry args={[1, 14, 10]} />
                <M color={prop.color} rough={0.5} />
              </mesh>
            ))}
          </group>
        );
      case 'bottle':
        return (
          <group>
            <mesh position={[0, 0.09, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.18, 16]} />
              <M color={prop.color} rough={0.25} opacity={0.92} />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.018, 0.035, 0.05, 12]} />
              <M color={prop.color} rough={0.25} />
            </mesh>
            <mesh position={[0, 0.235, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.025, 12]} />
              <M color="#E8553A" />
            </mesh>
          </group>
        );
      case 'jar':
        return (
          <group>
            <mesh position={[0, 0.06, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
              <M color="#EAF2F4" rough={0.2} opacity={0.75} />
            </mesh>
            <mesh position={[0, 0.045, 0]}>
              <cylinderGeometry args={[0.046, 0.046, 0.085, 16]} />
              <M color={prop.color} />
            </mesh>
            <mesh position={[0, 0.13, 0]}>
              <cylinderGeometry args={[0.052, 0.052, 0.025, 16]} />
              <M color="#8C5A35" />
            </mesh>
          </group>
        );
      case 'cup':
        return (
          <group>
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.042, 0.11, 18, 1, true]} />
              <meshStandardMaterial color="#E8F4F8" transparent opacity={0.5} side={2} />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.046, 0.042, 0.075, 18]} />
              <M color={prop.color} rough={0.15} opacity={0.7} />
            </mesh>
          </group>
        );
      case 'cloves':
        return (
          <group scale={0.7}>
          <Bowl position={[0, 0, 0]}>
            {[[-0.03, 0], [0.03, 0.01], [0, -0.03]].map(([x, z], i) => (
              <mesh key={i} position={[x!, 0.012, z!]} scale={[0.022, 0.025, 0.02]}>
                <sphereGeometry args={[1, 10, 8]} />
                <M color={prop.color} />
              </mesh>
            ))}
          </Bowl>
          </group>
        );
      case 'leaves':
        return (
          <group position={[0, 0.005, 0]}>
            <Leaves color={prop.color} count={7} radius={0.06} mound={0.04} seed={prop.label.length} />
          </group>
        );
      case 'bowl':
      default:
        return (
          <group scale={0.75}>
            <Bowl position={[0, 0, 0]} liquid={prop.color}>
              <mesh scale={[0.1, 0.04, 0.1]}>
                <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <M color={prop.color} rough={0.6} />
              </mesh>
            </Bowl>
          </group>
        );
    }
  })();
  return (
    <group position={position} scale={[s, s, s]}>
      {body}
    </group>
  );
};
