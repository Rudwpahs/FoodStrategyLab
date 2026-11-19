import { describe, expect, it } from 'vitest';
import { MAX_CLIP_MB, prepareClipFile } from './clipFile.ts';

describe('촬영 영상 고르기', () => {
  it('아이폰 MOV·안드로이드 MP4·사진은 그대로 올린다', async () => {
    for (const [name, type] of [['IMG_0001.MOV', 'video/quicktime'], ['VID_2026.mp4', 'video/mp4'], ['a.jpg', 'image/jpeg']]) {
      const f = new File(['x'], name!, { type });
      expect(await prepareClipFile(f)).toBe(f);
    }
  });

  it('종류가 비어 있으면(일부 안드로이드) 확장자로 정한다', async () => {
    expect((await prepareClipFile(new File(['x'], 'clip.mov'))).type).toBe('video/quicktime');
    expect((await prepareClipFile(new File(['x'], 'clip.MP4'))).type).toBe('video/mp4');
    expect((await prepareClipFile(new File(['x'], 'clip.m4v', { type: 'video/x-m4v' }))).type).toBe('video/mp4');
  });

  it('받지 못하는 파일·너무 큰 파일은 쉬운 말로 알려 준다', async () => {
    await expect(prepareClipFile(new File(['x'], 'memo.pdf', { type: 'application/pdf' }))).rejects.toThrow('넣을 수 없어요');
    const big = new File(['x'], 'long.mov', { type: 'video/quicktime' });
    Object.defineProperty(big, 'size', { value: (MAX_CLIP_MB + 1) * 1024 * 1024 });
    await expect(prepareClipFile(big)).rejects.toThrow('너무 커요');
  });
});
