import type { RequestHandler } from 'express';
import { buscarAssistencias, PlacesError, validatePlacesQuery } from './googlePlaces.ts';

// Limite global por processo para este prototipo. Em varias instancias, usar
// autenticacao e quotas compartilhadas no gateway/banco.
export function createPlacesHandler(search = buscarAssistencias, now = Date.now): RequestHandler {
  let windowStart = now();
  let requestCount = 0;
  let inFlight = 0;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let acquired = false;
    try {
      const query = validatePlacesQuery(req.body?.textQuery);
      const current = now();
      if (current - windowStart >= 60_000) { windowStart = current; requestCount = 0; }
      if (requestCount >= 10 || inFlight >= 2) {
        res.setHeader('Retry-After', '60');
        throw new PlacesError('Limite local de consultas atingido. Aguarde um minuto.', 429, 'PLACES_RATE_LIMIT');
      }
      requestCount++;
      inFlight++;
      acquired = true;
      res.json({ places: await search(query) });
    } catch (error) {
      const failure = error instanceof PlacesError ? error : new PlacesError('Falha na busca de estabelecimentos.', 500, 'PLACES_INTERNAL_ERROR');
      res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally {
      if (acquired) inFlight--;
    }
  };
}
