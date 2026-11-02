import { loadFont } from '@remotion/fonts';
import pretendardUrl from 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2';

let loaded: Promise<void> | null = null;

/** 한글 폰트(Pretendard, OFL)를 영상·미리보기 모두에서 같은 파일로 불러온다. */
export function ensureFonts(): Promise<void> {
  loaded ??= loadFont({ family: 'Pretendard', url: pretendardUrl, weight: '45 920', format: 'woff2' });
  return loaded;
}
