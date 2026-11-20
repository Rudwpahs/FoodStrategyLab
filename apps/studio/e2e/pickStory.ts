import { storyBlocked, type finalizeStory } from '@mat-lab/recipe-core';

type Finalized = ReturnType<typeof finalizeStory>;
export type UsableStory = Exclude<Finalized, { error: string }>;

/**
 * 견본 렌더에 쓸 대본 고르기: 원본 대조를 통과한 것 가운데 원하는 시청 대상·형식을 먼저.
 * 둘 다 맞는 것 → 형식만 맞는 것 → 대상만 맞는 것 → 첫 번째.
 */
export function pickStory(stories: Finalized[], audience?: string, type?: string): UsableStory | undefined {
  const usable = stories.filter((st): st is UsableStory => !('error' in st) && !storyBlocked(st));
  return (
    (audience && type ? usable.find((st) => st.audience === audience && st.storyType === type) : undefined) ??
    (type ? usable.find((st) => st.storyType === type) : undefined) ??
    (audience ? usable.find((st) => st.audience === audience) : undefined) ??
    usable[0]
  );
}
