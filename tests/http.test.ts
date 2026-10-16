import { describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/platform';
async function call(method: string, headers: Record<string, string>, body: unknown = {}) {
  const result = { status: 200, headers: {} as Record<string, unknown>, body: null as unknown };
  const res = { setHeader(key: string, value: unknown) { result.headers[key] = value; }, status(status: number) { result.status = status; return this; }, json(body: unknown) { result.body = body; return this; } };
  await handler({ method, headers, body } as VercelRequest, res as unknown as VercelResponse); return result;
}
describe('trusted API HTTP boundary', () => {
  it('rejects non-POST operations and disables caching', async () => { const r = await call('GET', {}); expect(r.status).toBe(405); expect(r.headers['Cache-Control']).toBe('no-store'); });
  it('rejects cross-origin requests before processing credentials', async () => expect((await call('POST', { origin: 'https://unauthorized.example', 'content-type': 'application/json' })).status).toBe(403));
  it('requires JSON', async () => expect((await call('POST', {})).status).toBe(415));
  it('rejects missing authentication without exposing internal credentials', async () => { const r = await call('POST', { 'content-type': 'application/json' }); expect(r.status).toBe(401); expect(r.body).toEqual({ error: 'Sign in required.' }); });
  it('limits UTF-8 bytes, not just character count', async () => expect((await call('POST', { 'content-type': 'application/json' }, { text: '漢'.repeat(140000) })).status).toBe(413));
});