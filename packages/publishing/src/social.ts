import { BRAND, brandDescription, instagramCaption, type RecipeInput } from '@mat-lab/recipe-core';

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

  const youtubeTitle = `${recipe.topic} #shorts`.slice(0, 100);
  return {
    // 인스타그램은 재료·순서를 본문에 싣는 구성 (대본이 없으면 주제로 시작)
    instagram: instagramCaption(recipe, null, reviewed, tags),
    youtubeTitle,
    youtubeDescription: [recipe.topic, tip, brandDescription(reviewed), AI_DISCLOSURE, `#shorts ${hashtags}`].filter(Boolean).join('\n\n'),
  };
}
