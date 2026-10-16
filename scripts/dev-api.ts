import { createServer } from 'node:http';
import handler from '../api/platform.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Local development adapter only; production uses Vercel's managed function.
createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 400000) { res.writeHead(413); res.end(); return; } }
  try { (req as VercelRequest).body = body ? JSON.parse(body) : null; } catch { res.writeHead(400); res.end(); return; }
  const response = res as VercelResponse;
  response.status = (status: number) => { res.statusCode = status; return response; };
  response.json = (data: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return response; };
  await handler(req as VercelRequest, response);
}).listen(3000, '127.0.0.1', () => console.log('WorkPulse local API listening on 127.0.0.1:3000'));