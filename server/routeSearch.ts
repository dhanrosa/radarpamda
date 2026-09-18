import type { TerminalRota } from '../src/types.ts';
import { distanceKm } from '../src/lib/routePlanning.ts';
import { PlacesError, searchPlacesPage } from './googlePlaces.ts';

export async function findRouteTerminal(body: unknown, search = searchPlacesPage): Promise<TerminalRota> {
  const region = (body as { regiao_alvo?: unknown } | null)?.regiao_alvo;
  if (typeof region !== 'string' || !region.trim() || region.trim().length > 200) {
    throw new PlacesError('Informe o bairro e a cidade da busca.', 400, 'INVALID_REGION');
  }
  const area = (await search(region.trim())).places.find(place => place.location);
  if (!area?.location) throw new PlacesError('Não foi possível localizar a região. Informe bairro e cidade na busca.', 404, 'REGION_NOT_FOUND');
  const center = { lat: area.location.latitude, lng: area.location.longitude };
  const candidates = (await search('terminal de ônibus', undefined, { terminalCenter: area.location })).places
    .filter(place => place.location && place.displayName?.text.trim())
    .map(place => ({ id: place.id ?? '', nome: place.displayName!.text.trim(), endereco: place.formattedAddress ?? '',
      coordenadas: { lat: place.location!.latitude, lng: place.location!.longitude } }))
    .filter(terminal => distanceKm(center, terminal.coordenadas) <= 50)
    .sort((a, b) => distanceKm(center, a.coordenadas) - distanceKm(center, b.coordenadas));
  if (!candidates.length) throw new PlacesError('Nenhum terminal de ônibus encontrado em até 50 km da região pesquisada.', 404, 'TERMINAL_NOT_FOUND');
  return candidates[0];
}
