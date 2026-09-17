import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLeads, placeToLead } from '../server/leadSearch.ts';
import { searchPlacesPage, PlacesError } from '../server/googlePlaces.ts';
import { createApp } from '../server/app.ts';
import { formatarTelefoneBR, validateSearchRequest, readSearchPage, mergeLeads, mapsLink } from '../src/lib/leadData.ts';
import { toCSV, strictPayload } from '../src/lib/geoUtils.ts';

// Dados sinteticos restritos aos testes; nunca importados pelo produto.
const query = { termos: ['reparos', 'acessórios'], regiao_alvo: 'Curitiba - PR' };
const fixture = { id: 'test-place-a', displayName: { text: 'Empresa A' }, formattedAddress: 'Endereço de teste', nationalPhoneNumber: '(41) 99999-9999', location: { latitude: -25.4, longitude: -49.2 } };

test('busca todos os termos na região e deduplica por place ID', async () => {
  const calls = [];
  const result = await searchLeads(query, async (text, token) => {
    calls.push([text, token]);
    return { places: [fixture], nextPageToken: 'token-' + calls.length };
  });
  assert.deepEqual(calls, [['reparos em Curitiba - PR', undefined], ['acessórios em Curitiba - PR', undefined]]);
  assert.equal(result.resultados_processados.length, 1);
  assert.equal(result.resultados_processados[0].telefone, '+55 (41) 99999-9999');
  assert.equal(result.fonte, 'Google Places');
  assert.deepEqual(result.proximas_paginas, { reparos: 'token-1', acessórios: 'token-2' });
  assert.deepEqual(readSearchPage(result), result);
});

test('consulta somente termos que ainda possuem paginação', async () => {
  const calls = [];
  const result = await searchLeads({ ...query, proximas_paginas: { reparos: 'page-2' } }, async (text, token) => {
    calls.push([text, token]);
    return { places: [] };
  });
  assert.deepEqual(calls, [['reparos em Curitiba - PR', 'page-2']]);
  assert.deepEqual(result.resultados_processados, []);
  assert.deepEqual(result.proximas_paginas, {});
});

test('paginação mantém parâmetros, idioma, país e token do Google', async () => {
  const page = await searchPlacesPage('reparos em Curitiba - PR', 'page-2', { apiKey: 'test-only', fetchImpl: async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { textQuery: 'reparos em Curitiba - PR', languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, pageToken: 'page-2' });
    assert.ok(init.headers['X-Goog-FieldMask'].includes('places.id'));
    assert.ok(init.headers['X-Goog-FieldMask'].includes('nextPageToken'));
    return new Response(JSON.stringify({ places: [fixture], nextPageToken: 'page-3' }));
  } });
  assert.equal(page.places[0].id, fixture.id);
  assert.equal(page.nextPageToken, 'page-3');
});

test('resultados vazios e campos ausentes permanecem ausentes', async () => {
  const result = await searchLeads(query, async () => ({ places: [] }));
  assert.deepEqual(result.resultados_processados, []);
  const converted = placeToLead({ id: 'missing-fields', displayName: { text: 'iPhone Serviços' } });
  assert.equal(converted.nome_loja, 'iPhone Serviços');
  assert.equal(converted.endereco, '');
  assert.equal(converted.telefone, '');
  assert.equal(converted.link_whatsapp, '');
  assert.equal(converted.coordenadas, null);
  assert.equal(placeToLead({ location: fixture.location }), null);
});

test('qualquer falha do provedor rejeita a busca sem resultados fictícios ou parciais', async () => {
  let calls = 0;
  await assert.rejects(searchLeads(query, async () => {
    calls++;
    if (calls === 2) throw new PlacesError('Falha no provedor', 502, 'PLACES_UPSTREAM_ERROR');
    return { places: [fixture] };
  }), error => error.status === 502);
});

test('validação rejeita entradas que derrubavam o servidor e paginação incorreta', async () => {
  const invalid = [null, {}, { prompt: 'texto livre' }, { termos: 'reparos', regiao_alvo: 'Curitiba' }, { termos: ['reparos'], regiao_alvo: {} }, { termos: ['a', 'b', 'c', 'd'], regiao_alvo: 'Curitiba' }, { termos: [1], regiao_alvo: 'Curitiba' }, { ...query, proximas_paginas: { inexistente: 'token' } }, { ...query, proximas_paginas: {} }];
  for (const body of invalid) await assert.rejects(searchLeads(body, () => { throw new Error('não deve chamar provedor'); }), error => error.status === 400);
  assert.deepEqual(validateSearchRequest({ termos: [' Reparos ', 'reparos'], regiao_alvo: ' Curitiba ' }), { termos: ['reparos'], regiao_alvo: 'Curitiba' });
});

test('telefones brasileiros válidos, fixos, estrangeiros e entradas inválidas', () => {
  assert.equal(formatarTelefoneBR('+55 (41) 99999-9999').isCell, true);
  assert.equal(formatarTelefoneBR('(41) 3333-4444').formatted, '+55 (41) 3333-4444');
  assert.equal(formatarTelefoneBR('(41) 3333-4444').isCell, false);
  for (const raw of ['41123456789', '20912345678', '+1 415 555 2671', 'sem telefone', '41999999999 ramal 1', 41999999999]) assert.equal(formatarTelefoneBR(raw).formatted, '');
});

test('filiais homônimas permanecem distintas e merge preserva dados já obtidos', () => {
  const first = placeToLead(fixture);
  const branch = placeToLead({ ...fixture, id: 'test-place-b' });
  const merged = mergeLeads([first], [branch, { ...first, telefone: '', coordenadas: null }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].telefone, first.telefone);
  assert.deepEqual(merged[0].coordenadas, first.coordenadas);
  const url = new URL(mapsLink(first));
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.searchParams.get('query_place_id'), fixture.id);
});

test('CSV neutraliza fórmulas e exportação JSON não inventa coordenadas', () => {
  const lead = placeToLead({ ...fixture, formattedAddress: '=1+1', location: undefined });
  assert.ok(toCSV([lead]).includes('"\'=1+1"'));
  assert.ok(toCSV([lead]).includes('"\'+55 (41) 99999-9999"'));
  const data = strictPayload({ parametros_busca: query, resultados_processados: [lead] });
  assert.equal(data.resultados_processados[0].coordenadas, null);
  assert.equal('id' in data.resultados_processados[0], false);
});

test('frontend rejeita links adulterados e coordenadas inválidas', async () => {
  const result = await searchLeads(query, async () => ({ places: [fixture] }));
  const tampered = structuredClone(result);
  tampered.resultados_processados[0].link_whatsapp = 'https://wa.me.attacker.invalid/';
  assert.throws(() => readSearchPage(tampered));
  tampered.resultados_processados[0] = { ...result.resultados_processados[0], coordenadas: { lat: 999, lng: 0 } };
  assert.throws(() => readSearchPage(tampered));
});

test('API HTTP devolve JSON nos erros e continua disponível após entrada inválida', async () => {
  const app = createApp(body => searchLeads(body, async () => ({ places: [fixture] })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = body => fetch(base + '/api/process-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    for (const body of [{ termos: ['teste'], regiao_alvo: {} }, '{}', '{']) {
      const response = await post(body);
      assert.equal(response.status, 400);
      assert.ok(response.headers.get('content-type').includes('application/json'));
      assert.ok((await response.json()).error);
    }
    const valid = await post(query);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).resultados_processados.length, 1);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    const crossOrigin = await fetch(base + '/api/process-leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.invalid' }, body: JSON.stringify(query) });
    assert.equal(crossOrigin.status, 403);
    const large = await post({ termos: ['a'.repeat(40_000)], regiao_alvo: 'Curitiba' });
    assert.equal(large.status, 413);
    assert.equal((await fetch(base + '/api/inexistente')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
