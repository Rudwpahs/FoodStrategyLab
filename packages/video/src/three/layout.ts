/** 3D 주방의 고정 배치 (단위: 미터, 바닥 y=0, 카메라 쪽이 +z) */
export type Vec3 = [number, number, number];

export const COUNTER_TOP = 0.94;
/** 캐릭터가 올라선 발판 위치 */
export const CHEF_POS: Vec3 = [-0.62, 0.42, -0.5];
/** 가스레인지 불 위치 (팬·냄비가 놓이는 곳) */
export const BURNER: Vec3 = [-1.08, COUNTER_TOP + 0.015, -1.14];
/** 완성 접시 위치 */
export const PLATE: Vec3 = [1.12, COUNTER_TOP + 0.01, -1.15];
/** 재료 소품이 놓이는 줄 (x 시작·끝, z) */
export const PROP_CENTER: Vec3 = [0.36, COUNTER_TOP, -1.14];
const PROP_GAP = 0.21;

/** 재료 소품 배치: 3개 이하는 한 줄, 그 이상은 두 줄 */
export function propPositions(count: number): Vec3[] {
  const perRow = count <= 3 ? count : Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = row === 0 ? perRow : count - perRow;
    const col = i % perRow;
    const x = PROP_CENTER[0] + (col - (inRow - 1) / 2) * PROP_GAP + row * 0.08;
    return [x, COUNTER_TOP, PROP_CENTER[2] + 0.12 - row * 0.27];
  });
}

/** 캐릭터가 접시를 들고 보여줄 때 접시 위치 */
export function handPlate(facing: number): Vec3 {
  // 몸 앞 낮게 (그릇이 얼굴을 가리지 않도록)
  return [CHEF_POS[0] + Math.sin(facing) * 0.4, CHEF_POS[1] + 0.17, CHEF_POS[2] + Math.cos(facing) * 0.4];
}
