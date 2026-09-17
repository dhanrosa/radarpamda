export const DEFAULT_PLACES_QUERY = 'assistência técnica de celular centro, Curitiba';

// Campos podem estar ausentes quando o estabelecimento nao os disponibiliza.
export interface GooglePlace {
  id?: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  location?: { latitude: number; longitude: number };
}

export function readPlacesResponse(data: unknown): GooglePlace[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const invalid = () => new Error('Resposta inválida da busca de estabelecimentos.');
  if (!isObject(data)) throw invalid();
  if (!('places' in data)) return [];
  if (!Array.isArray(data.places)) throw invalid();

  return data.places.map((place): GooglePlace => {
    if (!isObject(place)) throw invalid();
    const result: GooglePlace = {};
    if (place.id !== undefined) {
      if (typeof place.id !== 'string' || !place.id || place.id.length > 256) throw invalid();
      result.id = place.id;
    }
    if (place.displayName !== undefined) {
      if (!isObject(place.displayName) || typeof place.displayName.text !== 'string') throw invalid();
      result.displayName = { text: place.displayName.text };
      if (typeof place.displayName.languageCode === 'string') result.displayName.languageCode = place.displayName.languageCode;
    }
    for (const field of ['formattedAddress', 'nationalPhoneNumber'] as const) {
      if (place[field] !== undefined) {
        if (typeof place[field] !== 'string') throw invalid();
        result[field] = place[field];
      }
    }
    if (place.location !== undefined) {
      if (!isObject(place.location)) throw invalid();
      const { latitude, longitude } = place.location;
      if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
          typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw invalid();
      result.location = { latitude, longitude };
    }
    return result;
  });
}
