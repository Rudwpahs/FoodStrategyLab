import type React from 'react';
import type { VideoProps } from '../timeline.ts';
import { KitchenVideo } from './KitchenVideo.tsx';

/** 세로형 숏폼(1080×1920): 레시피로 만든 3D 주방 영상 */
export const ShortVideo: React.FC<VideoProps> = KitchenVideo;
