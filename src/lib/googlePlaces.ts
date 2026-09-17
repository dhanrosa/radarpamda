import { DEFAULT_PLACES_QUERY, readPlacesResponse } from '../types/places';
import type { GooglePlace } from '../types/places';

// Funcao para componentes Vite/React. A chave permanece no servidor.
export async function buscarAssistencias(textQuery = DEFAULT_PLACES_QUERY): Promise<GooglePlace[]> {
  const response = await fetch('/api/places/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ textQuery }),
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as { error?: { message?: unknown } };
    throw new Error(typeof error?.error?.message === 'string' ? error.error.message : 'Falha ao buscar estabelecimentos.');
  }
  return readPlacesResponse(data);
}
