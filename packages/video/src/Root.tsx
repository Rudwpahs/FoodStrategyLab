import React from 'react';
import { Composition, Still } from 'remotion';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { ShortVideo } from './compositions/ShortVideo.tsx';
import { CarouselCard, CharacterSheet, Cover, RecipeCard, SquareThumb, type CoverProps, type RecipeCardProps } from './compositions/Stills.tsx';
import { VIDEO } from './theme.ts';
import { buildTimeline, totalFrames, type VideoProps } from './timeline.ts';

const sampleRecipe = SAMPLE_RECIPES[0]!;
const sampleScript = generateTemplateScript(sampleRecipe);
const sampleVideo: VideoProps = {
  script: sampleScript,
  timings: buildTimeline(sampleScript, sampleScript.scenes.map(() => null)),
  reviewed: false,
  recipe: sampleRecipe,
};
const sampleCover: CoverProps = { title: sampleRecipe.topic, emotion: 'joy', recipe: sampleRecipe };
const sampleCard: RecipeCardProps = { recipe: sampleRecipe, reviewed: false };

export const COMPOSITION_IDS = {
  video: 'ShortVideo',
  cover: 'Cover',
  square: 'SquareThumb',
  recipeCard: 'RecipeCard',
  carouselCard: 'CarouselCard',
  sheet: 'CharacterSheet',
} as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id={COMPOSITION_IDS.video}
      component={ShortVideo}
      width={VIDEO.width}
      height={VIDEO.height}
      fps={VIDEO.fps}
      durationInFrames={totalFrames(sampleVideo.timings)}
      defaultProps={sampleVideo}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props.timings) })}
    />
    <Still id={COMPOSITION_IDS.cover} component={Cover} width={1080} height={1920} defaultProps={sampleCover} />
    <Still id={COMPOSITION_IDS.square} component={SquareThumb} width={1080} height={1080} defaultProps={sampleCover} />
    <Still id={COMPOSITION_IDS.recipeCard} component={RecipeCard} width={1080} height={1350} defaultProps={sampleCard} />
    <Still id={COMPOSITION_IDS.carouselCard} component={CarouselCard} width={1080} height={1350} defaultProps={{ ...sampleCard, page: 0 }} />
    <Still id={COMPOSITION_IDS.sheet} component={CharacterSheet} width={1920} height={1080} defaultProps={{}} />
  </>
);
