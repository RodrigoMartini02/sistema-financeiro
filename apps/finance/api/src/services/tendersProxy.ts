import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';

const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
]);

function forwardedHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const excluded = new Set(HOP_HEADERS);
  for (const header of headers.connection?.split(',') ?? []) {
    excluded.add(header.trim().toLowerCase());
  }
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}

export function createTendersProxy(destination: string | undefined, timeoutMs = 25_000): RequestHandler {
  const origin = destination ? new URL(destination) : null;
  if (origin && (
    !['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
  )) {
    throw new Error('TENDERS_API_URL must be an HTTP(S) origin without credentials, path or query');
  }

  return (req, res) => {
    if (!origin) {
      res.status(503).json({ success: false, message: 'Tenders API is not configured' });
      return;
    }

    const target = new URL(origin);
    const requestPath = req.originalUrl;
    if (!/^\/api\/tenders(?:[/?]|$)/.test(requestPath)) {
      res.status(404).json({ success: false, message: 'Route not found' });
      return;
    }

    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = request(target, {
      method: req.method,
      path: requestPath,
      headers: forwardedHeaders(req.headers),
    });
    const originalHeaders = res.getHeaders();
    const fail = (status: number, message: string) => {
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.destroy();
        }
        return;
      }
      for (const name of res.getHeaderNames()) {
        res.removeHeader(name);
      }
      for (const [name, value] of Object.entries(originalHeaders)) {
        if (value !== undefined) {
          res.setHeader(name, value);
        }
      }
      res.status(status).json({ success: false, message });
    };
    const timer = setTimeout(() => {
      fail(504, 'Tenders API timed out');
      upstream.destroy();
    }, timeoutMs);

    const cleanup = () => clearTimeout(timer);
    res.once('finish', cleanup);
    res.once('close', () => {
      cleanup();
      upstream.destroy();
    });
    req.once('aborted', () => upstream.destroy());
    upstream.on('error', () => {
      cleanup();
      fail(502, 'Tenders API is unavailable');
    });
    upstream.on('response', (response) => {
      res.status(response.statusCode ?? 502);
      const headers = forwardedHeaders(response.headers);
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) {
          res.setHeader(name, value);
        }
      }
      response.on('error', () => fail(502, 'Tenders API is unavailable'));
      response.pipe(res);
    });
    req.pipe(upstream);
  };
}
