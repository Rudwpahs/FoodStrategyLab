import { heicToJpeg, isHeicFile } from './heic.ts';

/** 서버가 받는 가장 큰 파일 (server/app.ts의 장면 영상 올리기와 같은 값) */
export const MAX_CLIP_MB = 300;
/** 휴대폰 사진첩에서 영상·사진을 모두 고를 수 있게 (아이폰 MOV, 안드로이드 MP4, 아이폰 사진 HEIC) */
export const PHONE_CLIP_ACCEPT = 'video/*,image/*,.mov,.mp4,.heic,.heif';

const ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'];
const BY_EXT: Record<string, string> = { mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * 고른 파일을 서버가 받는 형식으로: 아이폰 사진(HEIC)은 JPG로 바꾸고, 종류가 비어 있는 영상(일부 안드로이드)은 확장자로 정한다.
 * 받지 못하는 파일이면 쉬운 말로 알려 준다.
 */
export async function prepareClipFile(picked: File): Promise<File> {
  if (picked.size > MAX_CLIP_MB * 1024 * 1024) throw new Error(`파일이 너무 커요 (${MAX_CLIP_MB}MB까지). 휴대폰에서 영상을 10초 안쪽으로 잘라서 올려 주세요.`);
  if (isHeicFile(picked)) return heicToJpeg(picked);
  const ext = picked.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const type = picked.type === 'video/x-m4v' ? 'video/mp4' : picked.type || BY_EXT[ext] || '';
  if (!ACCEPTED.includes(type)) throw new Error('이 파일은 넣을 수 없어요. 휴대폰 카메라로 찍은 영상(MP4·MOV)이나 사진(JPG·PNG)을 골라 주세요.');
  return type === picked.type ? picked : new File([picked], picked.name, { type });
}
