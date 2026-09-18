import { DEFAULT_PLACES_QUERY, readPlacesResponse } from '../src/types/places.ts';
import type { GooglePlace } from '../src/types/places.ts';

export const PLACES_FIELD_MASK = 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location';
export const PLACES_SEARCH_FIELD_MASK = `places.id,${PLACES_FIELD_MASK},places.addressComponents,nextPageToken`;
type SearchOptions = { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number; pageToken?: string; paginated?: boolean;
  terminalCenter?: { latitude: number; longitude: number } };

export class PlacesError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'PlacesError';
    this.status = status;
    this.code = code;
  }
}

export function validatePlacesQuery(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw new PlacesError('Informe uma busca de 1 a 500 caracteres.', 400, 'INVALID_QUERY');
  }
  return value.trim();
}

// Exclusivo do backend: nunca importar este modulo em componentes React.
export async function buscarAssistencias(
  textQuery = DEFAULT_PLACES_QUERY,
  options: SearchOptions = {},
): Promise<GooglePlace[]> {
  return (await requestPlaces(textQuery, options)).places;
}

export async function searchPlacesPage(textQuery: string, pageToken?: string, options: SearchOptions = {}) {
  return requestPlaces(textQuery, { ...options, pageToken, paginated: true });
}

async function requestPlaces(textQuery: string, options: SearchOptions): Promise<{ places: GooglePlace[]; nextPageToken?: string }> {
  const query = validatePlacesQuery(textQuery);
  const apiKey = options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey?.trim()) {
    throw new PlacesError('Configure GOOGLE_MAPS_API_KEY no servidor.', 503, 'PLACES_NOT_CONFIGURED');
  }

  try {
    const response = await (options.fetchImpl ?? fetch)('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey.trim(),
        'X-Goog-FieldMask': options.paginated ? PLACES_SEARCH_FIELD_MASK : PLACES_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, ...(options.paginated ? { languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 } : {}), ...(options.pageToken ? { pageToken: options.pageToken } : {}),
        ...(options.terminalCenter ? { includedType: 'bus_station', strictTypeFiltering: true, rankPreference: 'DISTANCE', locationBias: { circle: { center: options.terminalCenter, radius: 50000 } } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) throw new PlacesError('Limite de consultas do Google Places atingido. Tente novamente mais tarde.', 429, 'PLACES_QUOTA');
      if (status === 401 || status === 403) throw new PlacesError('Google Places recusou a credencial. Verifique a chave, as restrições e a ativação da API no servidor.', 502, 'PLACES_ACCESS_DENIED');
      throw new PlacesError('Google Places não concluiu a consulta.', 502, 'PLACES_UPSTREAM_ERROR');
    }
    const data: unknown = await response.json();
    const places = readPlacesResponse(data);
    const next = (data as { nextPageToken?: unknown }).nextPageToken;
    if (next !== undefined && (typeof next !== 'string' || next.length > 4096)) throw new Error('Token inválido');
    return { places, ...(typeof next === 'string' && next ? { nextPageToken: next } : {}) };
  } catch (error) {
    if (error instanceof PlacesError) throw error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new PlacesError('A consulta ao Google Places excedeu o tempo limite.', 504, 'PLACES_TIMEOUT');
    }
    throw new PlacesError('Não foi possível obter uma resposta válida do Google Places.', 502, 'PLACES_BAD_RESPONSE');
  }
}
