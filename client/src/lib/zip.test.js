import { describe, it, expect } from 'vitest';
import { createZip } from './zip.js';

const SIG_LOCAL = 0x04034b50;
const SIG_EOCD = 0x06054b50;

async function toBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('createZip', () => {
  it('writes a valid archive with stored (uncompressed) entries', async () => {
    const a = new TextEncoder().encode('hello world');
    const b = new TextEncoder().encode('a slightly longer second file');
    const buf = await toBytes(createZip([
      { name: 'a.txt', data: a },
      { name: 'b.txt', data: b },
    ]));
    const view = new DataView(buf.buffer);

    // Archive opens with a local file header.
    expect(view.getUint32(0, true)).toBe(SIG_LOCAL);

    // No archive comment — the 22-byte EOCD record is the tail.
    const eocd = buf.length - 22;
    expect(view.getUint32(eocd, true)).toBe(SIG_EOCD);
    expect(view.getUint16(eocd + 10, true)).toBe(2); // total entries

    // First entry: name then data sit uncompressed right after the header.
    const nameLen = view.getUint16(26, true);
    expect(nameLen).toBe('a.txt'.length);
    const dataStart = 30 + nameLen;
    expect(buf.slice(dataStart, dataStart + a.length)).toEqual(a);

    // Store mode keeps compressed size equal to uncompressed size.
    expect(view.getUint32(18, true)).toBe(a.length);
    expect(view.getUint32(22, true)).toBe(a.length);
  });

  it('produces a well-formed empty archive for no entries', async () => {
    const buf = await toBytes(createZip([]));
    expect(buf.length).toBe(22);
    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(SIG_EOCD);
    expect(view.getUint16(10, true)).toBe(0);
  });
});
