import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { actor, dispatch, HttpError } from '../server/platform.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required.' });
  const origin = process.env.APP_ORIGIN;
  if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: 'Origin not authorized.' });
  if (!req.headers['content-type']?.includes('application/json')) return res.status(415).json({ error: 'JSON required.' });
  if (Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > 400000) return res.status(413).json({ error: 'Request too large.' });
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new HttpError(401, 'Sign in required.');
    const user = await actor(token);
    return res.status(200).json(await dispatch(user, req.body));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof ZodError) return res.status(422).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n') });
    // Deliberately do not log payloads, bearer tokens, private keys or employee descriptions.
    return res.status(500).json({ error: 'Operation could not be confirmed. Your input is preserved; retry with the same request.' });
  }
}