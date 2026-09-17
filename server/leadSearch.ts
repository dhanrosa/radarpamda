import { createHash } from 'node:crypto';
import { formatarTelefoneBR, mergeLeads, validateSearchRequest } from '../src/lib/leadData.ts';
import type { GooglePlace } from '../src/types/places.ts';
import type { ResultadoProcessado, SearchPage } from '../src/types.ts';
import { PlacesError, searchPlacesPage } from './googlePlaces.ts';

export function placeToLead(place: GooglePlace): ResultadoProcessado | null {
  const name = place.displayName?.text?.trim();
  if (!name) return null;
  const phone = formatarTelefoneBR(place.nationalPhoneNumber);
  const location = place.location;
  const identity = JSON.stringify([name, place.formattedAddress ?? '', location ?? null]);
  return {
    id: place.id ?? `derived:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
    nome_loja: name,
    endereco: place.formattedAddress?.trim() ?? '',
    telefone: phone.formatted,
    link_whatsapp: phone.isCell ? `https://wa.me/${phone.cleanDigits}` : '',
    coordenadas: location ? { lat: location.latitude, lng: location.longitude } : null,
  };
}

export async function searchLeads(body: unknown, search = searchPlacesPage): Promise<SearchPage> {
  let input;
  try { input = validateSearchRequest(body); }
  catch (error) { throw new PlacesError((error as Error).message, 400, 'INVALID_SEARCH'); }
  let leads: ResultadoProcessado[] = [];
  const next: [string, string][] = [];
  for (const term of input.termos) {
    if (input.proximas_paginas && !Object.hasOwn(input.proximas_paginas, term)) continue;
    const result = await search(`${term} em ${input.regiao_alvo}`, input.proximas_paginas?.[term]);
    leads = mergeLeads(leads, result.places.map(placeToLead).filter((lead): lead is ResultadoProcessado => lead !== null));
    if (result.nextPageToken) next.push([term, result.nextPageToken]);
  }
  return {
    parametros_busca: { termos: input.termos, regiao_alvo: input.regiao_alvo },
    resultados_processados: leads,
    fonte: 'Google Places',
    consultado_em: new Date().toISOString(),
    proximas_paginas: Object.fromEntries(next),
  };
}
