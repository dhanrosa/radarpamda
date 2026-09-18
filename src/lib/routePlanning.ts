import type { Coordenadas, ResultadoProcessado, TerminalRota } from '../types';

export function distanceKm(a: Coordenadas, b: Coordenadas): number {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Aproximação por vizinho mais próximo, sem estimar ruas ou tempos de viagem.
export function orderByRoute(leads: ResultadoProcessado[], origin: Coordenadas): ResultadoProcessado[] {
  const remaining = leads.filter(lead => lead.coordenadas);
  const ordered: ResultadoProcessado[] = [];
  let position = origin;
  while (remaining.length) {
    let closest = 0;
    for (let index = 1; index < remaining.length; index++) {
      if (distanceKm(position, remaining[index].coordenadas!) < distanceKm(position, remaining[closest].coordenadas!)) closest = index;
    }
    const [next] = remaining.splice(closest, 1);
    ordered.push(next);
    position = next.coordenadas!;
  }
  return [...ordered, ...leads.filter(lead => !lead.coordenadas)];
}

export function routeLinks(leads: ResultadoProcessado[], terminal: TerminalRota): string[] {
  const stops = leads.filter(lead => lead.coordenadas);
  const urls: string[] = [];
  let origin = terminal.coordenadas;
  // Quatro destinos por trecho: até três paradas intermediárias também no navegador móvel.
  for (let start = 0; start < stops.length; start += 4) {
    const section = stops.slice(start, start + 4);
    const locations = section.map(lead => `${lead.coordenadas!.lat},${lead.coordenadas!.lng}`);
    const params = new URLSearchParams({ api: '1', origin: `${origin.lat},${origin.lng}`, destination: locations.at(-1)!, travelmode: 'driving' });
    if (start === 0 && terminal.id) params.set('origin_place_id', terminal.id);
    if (locations.length > 1) params.set('waypoints', locations.slice(0, -1).join('|'));
    urls.push(`https://www.google.com/maps/dir/?${params}`);
    origin = section.at(-1)!.coordenadas!;
  }
  return urls;
}

export function readTerminal(value: unknown): TerminalRota {
  const terminal = value as TerminalRota | null;
  if (!terminal || typeof terminal.id !== 'string' || typeof terminal.nome !== 'string' || !terminal.nome || typeof terminal.endereco !== 'string'
    || !terminal.coordenadas || !Number.isFinite(terminal.coordenadas.lat) || Math.abs(terminal.coordenadas.lat) > 90
    || !Number.isFinite(terminal.coordenadas.lng) || Math.abs(terminal.coordenadas.lng) > 180) throw new Error('Terminal inválido na resposta.');
  return terminal;
}
