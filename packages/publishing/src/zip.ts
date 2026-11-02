import { strToU8, zipSync } from 'fflate';

/** 게시용 묶음을 ZIP 하나로 만든다. */
export function buildZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    entries[name] = typeof data === 'string' ? strToU8(data) : data;
  }
  return zipSync(entries, { level: 6 });
}
