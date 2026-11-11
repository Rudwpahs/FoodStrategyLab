/** 매번 같은 결과가 나오도록 고정 씨앗 난수 (0 이상 1 미만). 음식 모양·효과음이 함께 쓴다 */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
