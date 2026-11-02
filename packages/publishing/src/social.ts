import { BRAND, brandDescription, type RecipeInput } from '@mat-lab/recipe-core';

export interface SocialCopy {
  instagram: string;
  youtubeTitle: string;
  youtubeDescription: string;
}

const AI_DISCLOSURE = '🤖 AI 캐릭터 애니메이션이며, 음성은 AI 합성(TTS)입니다.';

/** 릴스·쇼츠 게시 문구. '검토한' 표현은 승인된 콘텐츠에만 들어간다. */
export function buildSocialCopy(recipe: RecipeInput, reviewed: boolean, tags: string[]): SocialCopy {
  const hashtags = tags.map((t) => `#${t}`).join(' ');
  const tip = recipe.tips[0] ? `💡 ${BRAND.tipPhrase}: ${recipe.tips[0]}` : '';
  const lines = [recipe.topic, '', tip, '', brandDescription(reviewed), AI_DISCLOSURE, '', hashtags].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
  const youtubeTitle = `${recipe.topic} #shorts`.slice(0, 100);
  return {
    instagram: lines.join('\n').trim(),
    youtubeTitle,
    youtubeDescription: [recipe.topic, tip, brandDescription(reviewed), AI_DISCLOSURE, `#shorts ${hashtags}`].filter(Boolean).join('\n\n'),
  };
}
