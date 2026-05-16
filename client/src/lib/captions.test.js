import { describe, expect, it } from 'vitest';
import { parseSSE } from './captions.js';

/** Build a ReadableStream that yields the supplied UTF-8 chunks. */
function streamOf(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
}

async function collect(stream) {
  const events = [];
  for await (const ev of parseSSE(stream)) events.push(ev);
  return events;
}

describe('parseSSE', () => {
  it('decodes a JSON-encoded delta event', async () => {
    const stream = streamOf([
      'event: delta\ndata: "hello"\n\n',
    ]);
    expect(await collect(stream)).toEqual([{ type: 'delta', data: 'hello' }]);
  });

  it('joins messages split across chunks', async () => {
    // The blank-line delimiter is split between two reads.
    const stream = streamOf([
      'event: delta\ndata: "first"\n',
      '\nevent: delta\ndata: "second"\n\n',
    ]);
    expect(await collect(stream)).toEqual([
      { type: 'delta', data: 'first' },
      { type: 'delta', data: 'second' },
    ]);
  });

  it('preserves newlines inside JSON-encoded data', async () => {
    const stream = streamOf([
      'event: delta\ndata: "line one\\nline two"\n\n',
    ]);
    expect(await collect(stream)).toEqual([
      { type: 'delta', data: 'line one\nline two' },
    ]);
  });

  it('returns raw string when data is not JSON', async () => {
    const stream = streamOf([
      'event: error\ndata: plain text\n\n',
    ]);
    expect(await collect(stream)).toEqual([{ type: 'error', data: 'plain text' }]);
  });

  it('defaults type to "message" when omitted', async () => {
    const stream = streamOf([
      'data: "hi"\n\n',
    ]);
    expect(await collect(stream)).toEqual([{ type: 'message', data: 'hi' }]);
  });

  it('emits a sequence of deltas, then done', async () => {
    const stream = streamOf([
      'event: delta\ndata: "a"\n\n',
      'event: delta\ndata: "b"\n\n',
      'event: done\ndata: ""\n\n',
    ]);
    expect(await collect(stream)).toEqual([
      { type: 'delta', data: 'a' },
      { type: 'delta', data: 'b' },
      { type: 'done', data: '' },
    ]);
  });
});
