/**
 * 아이폰 사진(HEIC/HEIF)을 JPG로 바꾼다.
 * 크롬(윈도우·안드로이드) 등 대부분의 브라우저와 Claude API·영상 렌더러는 HEIC를 읽지 못한다.
 * 변환기(libheif, 약 3MB)는 HEIC 사진을 골랐을 때만 내려받는다.
 */
export const isHeicFile = (f: File) => /\.(heic|heif)$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type);

/** 파일 고르기에서 HEIC도 보이게 */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export async function heicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  try {
    const { heicTo } = await import('heic-to');
    const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    return new File([jpeg], `${file.name.replace(/\.(heic|heif)$/i, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    throw new Error(`"${file.name}" 사진(HEIC)을 바꾸지 못했어요. 아이폰 설정 → 카메라 → 포맷 → "높은 호환성"으로 찍거나, JPG로 저장해 올려 주세요.`);
  }
}
