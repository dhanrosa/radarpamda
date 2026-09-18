import test from 'node:test';
import assert from 'node:assert/strict';
import { placeToLead } from '../server/leadSearch.ts';
import { findRouteTerminal } from '../server/routeSearch.ts';
import { searchPlacesPage } from '../server/googlePlaces.ts';
import { createApp } from '../server/app.ts';
import { orderByRoute, routeLinks, readTerminal } from '../src/lib/routePlanning.ts';
import { readPlacesResponse } from '../src/types/places.ts';
import { toCSV } from '../src/lib/geoUtils.ts';
import { mergeLeads } from '../src/lib/leadData.ts';

const terminal = { id: 'terminal-test', nome: 'Terminal de teste', endereco: 'Endereço do terminal', coordenadas: { lat: 0, lng: 0 } };
const lead = (id, lng) => ({ id, nome_loja: id, bairro: 'Bairro de teste', endereco: 'Endereço', telefone: '', link_whatsapp: '', coordenadas: lng === null ? null : { lat: 0, lng } });

test('bairro vem dos componentes, preserva acentos e não confunde cidade com bairro', () => {
  const place = readPlacesResponse({ places: [{ displayName: { text: 'Loja' }, addressComponents: [
    { longText: 'Curitiba', types: ['locality'] }, { longText: 'Água Verde', types: ['sublocality_level_1', 'sublocality'] },
  ] }] })[0];
  const result = placeToLead(place);
  assert.equal(result.bairro, 'Água Verde');
  assert.equal(placeToLead({ displayName: { text: 'Loja' }, addressComponents: [{ longText: 'Curitiba', types: ['locality'] }] }).bairro, '');
  assert.equal(placeToLead({ displayName: { text: 'Loja' }, addressComponents: [{ longText: 'Centro', types: ['neighborhood'] }] }).bairro, 'Centro');
  assert.equal(mergeLeads([result], [{ ...result, bairro: '' }])[0].bairro, 'Água Verde');
  assert.ok(toCSV([result]).includes('"Bairro"'));
  assert.ok(toCSV([result]).includes('"Água Verde"'));
  assert.throws(() => readPlacesResponse({ places: [{ addressComponents: [{ longText: 'Centro', types: [1] }] }] }));
});

test('rota começa no terminal e avança a partir da última visita, preservando lojas sem coordenadas', () => {
  const leads = [lead('Longe', 0.3), lead('Sem posição', null), lead('Oeste', -0.15), lead('Perto', 0.1)];
  const ordered = orderByRoute(leads, terminal.coordenadas);
  assert.deepEqual(ordered.map(item => item.id), ['Perto', 'Longe', 'Oeste', 'Sem posição']);
  assert.equal(leads[0].id, 'Longe');
  const rows = toCSV(ordered, terminal).split('\r\n');
  assert.ok(rows[0].includes('"Ordem de visita"'));
  assert.ok(rows[1].startsWith('"1";"Terminal de teste";'));
  assert.ok(rows[4].startsWith('"";'));
  assert.ok(rows[4].includes('Sem coordenadas: organizar manualmente'));
  assert.deepEqual(orderByRoute([], terminal.coordenadas), []);
  assert.throws(() => readTerminal({ ...terminal, coordenadas: { lat: 91, lng: 0 } }));
});

test('trechos do Maps incluem todas as visitas e continuam da última parada', () => {
  const stops = Array.from({ length: 11 }, (_, index) => lead(String(index), index / 100));
  const urls = routeLinks([...stops, lead('ausente', null)], terminal).map(url => new URL(url));
  assert.equal(urls.length, 3);
  assert.equal(urls[0].searchParams.get('origin_place_id'), terminal.id);
  assert.equal(urls[1].searchParams.get('origin'), urls[0].searchParams.get('destination'));
  assert.equal(urls[2].searchParams.get('origin'), urls[1].searchParams.get('destination'));
  const locations = urls.flatMap(url => [...(url.searchParams.get('waypoints')?.split('|') ?? []), url.searchParams.get('destination')]);
  assert.deepEqual(locations, stops.map(item => `0,${item.coordenadas.lng}`));
  assert.ok(urls.every(url => (url.searchParams.get('waypoints')?.split('|').length ?? 0) <= 3));
});

test('terminal é escolhido pela distância à região pesquisada e não pela primeira loja ou relevância', async () => {
  const calls = [];
  const result = await findRouteTerminal({ regiao_alvo: ' Bairro, Cidade ' }, async (...args) => {
    calls.push(args);
    if (calls.length === 1) return { places: [{ location: { latitude: 0, longitude: 0 } }] };
    return { places: [
      { id: 'longe', displayName: { text: 'Terminal longe' }, location: { latitude: 0, longitude: 0.2 } },
      { id: 'perto', displayName: { text: 'Terminal perto' }, location: { latitude: 0, longitude: 0.01 } },
      { id: 'sem-coordenadas', displayName: { text: 'Terminal incompleto' } },
    ] };
  });
  assert.equal(calls[0][0], 'Bairro, Cidade');
  assert.deepEqual(calls[1][2], { terminalCenter: { latitude: 0, longitude: 0 } });
  assert.equal(result.id, 'perto');
  assert.equal(readTerminal(result), result);
});

test('consulta de terminais envia filtro e referência de distância ao Google', async () => {
  await searchPlacesPage('terminal de ônibus', undefined, { apiKey: 'test', terminalCenter: { latitude: 0, longitude: 0 }, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.includedType, 'bus_station');
    assert.equal(body.strictTypeFiltering, true);
    assert.equal(body.rankPreference, 'DISTANCE');
    assert.deepEqual(body.locationBias.circle.center, { latitude: 0, longitude: 0 });
    assert.ok(init.headers['X-Goog-FieldMask'].includes('places.addressComponents'));
    return new Response('{"places":[]}');
  } });
});

test('região inválida, região ausente e terminal ausente retornam erros sem origem fictícia', async () => {
  for (const body of [null, {}, { regiao_alvo: [] }, { regiao_alvo: ' ' }]) {
    await assert.rejects(findRouteTerminal(body, async () => { throw new Error('Não deveria consultar'); }), error => error.status === 400);
  }
  await assert.rejects(findRouteTerminal({ regiao_alvo: 'Bairro' }, async () => ({ places: [] })), error => error.code === 'REGION_NOT_FOUND');
  let count = 0;
  await assert.rejects(findRouteTerminal({ regiao_alvo: 'Bairro' }, async () => ({ places: ++count === 1
    ? [{ location: { latitude: 0, longitude: 0 } }]
    : [{ displayName: { text: 'Terminal distante' }, location: { latitude: 10, longitude: 0 } }] })), error => error.code === 'TERMINAL_NOT_FOUND');
});

test('API do terminal valida entradas e devolve a origem estruturada', async () => {
  const app = createApp(undefined, body => findRouteTerminal(body, async () => ({ places: [{ id: terminal.id, displayName: { text: terminal.nome }, formattedAddress: terminal.endereco, location: { latitude: 0, longitude: 0 } }] })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/route-terminal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ regiao_alvo: {} })).status, 400);
    const response = await post({ regiao_alvo: 'Bairro, Cidade' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), terminal);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
