import type { ResultadoProcessado, SearchPage, SearchRequest } from '../types';

const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

export function formatarTelefoneBR(raw: unknown) {
  const empty = { formatted: '', isCell: false, cleanDigits: '' };
  if (typeof raw !== 'string' || !raw.trim()) return empty;
  if (!/^[+\d\s().-]+$/.test(raw.trim())) return empty;
  if (raw.trim().startsWith('+') && !raw.trim().startsWith('+55')) return empty;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (!DDDS.has(digits.slice(0, 2))) return empty;
  const local = digits.slice(2);
  const isCell = /^9\d{8}$/.test(local);
  if (!isCell && !/^[2-5]\d{7}$/.test(local)) return empty;
  const split = isCell ? 5 : 4;
  return { formatted: `+55 (${digits.slice(0, 2)}) ${local.slice(0, split)}-${local.slice(split)}`, isCell, cleanDigits: `55${digits}` };
}

export function mapsLink(lead: ResultadoProcessado): string {
  const params = new URLSearchParams({ api: '1', query: [lead.nome_loja, lead.endereco].filter(Boolean).join(' ') });
  if (lead.id && !lead.id.startsWith('derived:')) params.set('query_place_id', lead.id);
  return `https://www.google.com/maps/search/?${params}`;
}

function routeLocation(lead: ResultadoProcessado): string {
  return lead.coordenadas ? `${lead.coordenadas.lat},${lead.coordenadas.lng}` : [lead.nome_loja, lead.endereco].filter(Boolean).join(', ');
}

export function routeLink(leads: ResultadoProcessado[]): string | null {
  const locations = leads.filter(lead => lead.coordenadas || lead.endereco).slice(0, 10);
  if (!locations.length) return null;
  const first = locations[0];
  const orderedStops = locations.map(routeLocation);
  const params = new URLSearchParams({
    api: '1',
    origin: `Terminal de ônibus mais próximo de ${routeLocation(first)}`,
    destination: orderedStops[orderedStops.length - 1],
    travelmode: 'driving',
  });
  if (orderedStops.length > 1) params.set('waypoints', orderedStops.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function mergeLeads(current: ResultadoProcessado[], incoming: ResultadoProcessado[]): ResultadoProcessado[] {
  const items = new Map(current.map(lead => [lead.id, lead]));
  for (const lead of incoming) {
    const previous = items.get(lead.id);
    items.set(lead.id, previous ? {
      ...previous, ...lead,
      telefone: lead.telefone || previous.telefone,
      link_whatsapp: lead.link_whatsapp || previous.link_whatsapp,
      endereco: lead.endereco || previous.endereco,
      coordenadas: lead.coordenadas ?? previous.coordenadas,
    } : lead);
  }
  return [...items.values()];
}

export function validateSearchRequest(value: unknown): SearchRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Informe os termos e a região da busca.');
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.termos) || body.termos.length < 1 || body.termos.length > 3 ||
    body.termos.some(term => typeof term !== 'string' || !term.trim() || term.trim().length > 100)) {
    throw new Error('Informe de um a três termos, com até 100 caracteres cada.');
  }
  if (typeof body.regiao_alvo !== 'string' || !body.regiao_alvo.trim() || body.regiao_alvo.trim().length > 200) throw new Error('Informe bairro, cidade ou região com até 200 caracteres.');
  const termos = [...new Map((body.termos as string[]).map(term => [term.trim().toLocaleLowerCase('pt-BR'), term.trim()])).values()];
  const result: SearchRequest = { termos, regiao_alvo: body.regiao_alvo.trim() };
  if (body.proximas_paginas !== undefined) {
    if (!body.proximas_paginas || typeof body.proximas_paginas !== 'object' || Array.isArray(body.proximas_paginas)) throw new Error('Paginação inválida.');
    const entries = Object.entries(body.proximas_paginas);
    if (!entries.length || entries.length > 3 || entries.some(([term, token]) => !termos.includes(term) || typeof token !== 'string' || !token || token.length > 4096)) throw new Error('Paginação inválida.');
    result.proximas_paginas = Object.fromEntries(entries) as Record<string, string>;
  }
  return result;
}

export function readSearchPage(value: unknown): SearchPage {
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida da busca.');
  const data = value as SearchPage;
  const parameters = validateSearchRequest(data.parametros_busca);
  if (data.fonte !== 'Google Places' || typeof data.consultado_em !== 'string' || !Number.isFinite(Date.parse(data.consultado_em)) || !Array.isArray(data.resultados_processados)) throw new Error('Resposta inválida da busca.');
  for (const lead of data.resultados_processados) {
    if (!lead || (['id', 'nome_loja', 'endereco', 'telefone', 'link_whatsapp'] as const).some(key => typeof lead[key] !== 'string') || !lead.id || !lead.nome_loja) throw new Error('Estabelecimento inválido na resposta.');
    if (lead.coordenadas !== null && (!lead.coordenadas || !Number.isFinite(lead.coordenadas.lat) || !Number.isFinite(lead.coordenadas.lng) || Math.abs(lead.coordenadas.lat) > 90 || Math.abs(lead.coordenadas.lng) > 180)) throw new Error('Coordenadas inválidas na resposta.');
    const tel = formatarTelefoneBR(lead.telefone);
    if (lead.telefone && tel.formatted !== lead.telefone) throw new Error('Telefone inválido na resposta.');
    if (lead.link_whatsapp && (!tel.isCell || lead.link_whatsapp !== `https://wa.me/${tel.cleanDigits}`)) throw new Error('Link de contato inválido.');
  }
  if (!data.proximas_paginas || typeof data.proximas_paginas !== 'object' || Array.isArray(data.proximas_paginas)) throw new Error('Paginação inválida na resposta.');
  if (Object.keys(data.proximas_paginas).length) validateSearchRequest({ ...parameters, proximas_paginas: data.proximas_paginas });
  return data;
}
