import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { PlacesError } from './googlePlaces.ts';
import { createPlacesHandler } from './placesRoute.ts';
import { searchLeads } from './leadSearch.ts';
import { findRouteTerminal } from './routeSearch.ts';

function searchBudget(): RequestHandler {
  let start = Date.now();
  let requests = 0;
  let active = 0;
  return (req, res, next) => {
    if (req.method !== 'POST') { next(); return; }
    if (Date.now() - start >= 60_000) { start = Date.now(); requests = 0; }
    if (requests >= 10 || active >= 2) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Muitas buscas em andamento. Aguarde um minuto e tente novamente.' } });
      return;
    }
    requests++;
    active++;
    let released = false;
    const release = () => { if (!released) { active--; released = true; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

export function createApp(search = searchLeads, findTerminal = findRouteTerminal) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    let crossOrigin = req.get('sec-fetch-site') === 'cross-site';
    if (origin) {
      try { crossOrigin ||= new URL(origin).host !== req.get('host'); }
      catch { crossOrigin = true; }
    }
    if (crossOrigin) { res.status(403).json({ error: { code: 'ORIGIN_DENIED', message: 'Abra o site diretamente para realizar a busca.' } }); return; }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', searchBudget());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'real', placesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()) }));
  app.post('/api/places/search', createPlacesHandler());
  app.post('/api/route-terminal', async (req, res) => {
    try { res.json(await findTerminal(req.body)); }
    catch (error) {
      const failure = error instanceof PlacesError ? error : new PlacesError('Não foi possível localizar o terminal. Tente novamente.', 500, 'ROUTE_ERROR');
      res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    }
  });
  app.post('/api/process-leads', async (req, res) => {
    try { res.json(await search(req.body)); }
    catch (error) {
      const failure = error instanceof PlacesError ? error : new PlacesError('Não foi possível concluir a busca. Tente novamente.', 500, 'SEARCH_ERROR');
      res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: { code: 'INVALID_REQUEST', message: status === 413 ? 'Os dados excedem o limite da requisição.' : status === 400 ? 'O corpo da requisição não é um JSON válido.' : 'Não foi possível processar a requisição.' } });
  };
  app.use(handleError);
  return app;
}
