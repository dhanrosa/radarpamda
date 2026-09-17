import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarAssistencias, PlacesError, PLACES_FIELD_MASK } from '../server/googlePlaces.ts';
import { createPlacesHandler } from '../server/placesRoute.ts';
import { readPlacesResponse } from '../src/types/places.ts';

const example = {
  displayName: { text: 'Assistência de Teste', languageCode: 'pt' },
  formattedAddress: 'Centro, Curitiba - PR',
  nationalPhoneNumber: '(41) 3333-4444',
  location: { latitude: -25.4284, longitude: -49.2733 },
};
const options = fetchImpl => ({ apiKey: 'unit-test-no-real-key', fetchImpl });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('envia POST com consulta padrão, chave no cabeçalho e máscara exata', async () => {
  let request;
  const result = await buscarAssistencias(undefined, options(async (url, init) => {
    request = { url, ...init };
    return json({ places: [example] });
  }));
  assert.equal(request.url, 'https://places.googleapis.com/v1/places:searchText');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['X-Goog-Api-Key'], 'unit-test-no-real-key');
  assert.equal(request.headers['X-Goog-FieldMask'], 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location');
  assert.equal(request.headers['X-Goog-FieldMask'], PLACES_FIELD_MASK);
  assert.deepEqual(JSON.parse(request.body), { textQuery: 'assistência técnica de celular centro, Curitiba' });
  assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(result, [example]);
});

test('aceita consulta personalizada e remove espaços externos', async () => {
  await buscarAssistencias('  autopeças Recife  ', options(async (_url, init) => {
    assert.equal(JSON.parse(init.body).textQuery, 'autopeças Recife');
    return json({ places: [] });
  }));
});

test('não chama o Google sem chave ou com consulta inválida', async () => {
  const fetchImpl = () => { throw new Error('A rede não deveria ser chamada'); };
  await assert.rejects(buscarAssistencias('teste', { apiKey: '', fetchImpl }), error => error.status === 503 && error.code === 'PLACES_NOT_CONFIGURED');
  for (const query of ['', '   ', 12, {}, null, 'a'.repeat(501)]) {
    await assert.rejects(buscarAssistencias(query, options(fetchImpl)), error => error.status === 400);
  }
});

test('resultado vazio e telefone ausente não geram dados fictícios', async () => {
  assert.deepEqual(await buscarAssistencias('teste', options(async () => json({}))), []);
  assert.deepEqual(await buscarAssistencias('teste', options(async () => json({ places: [] }))), []);
  const result = await buscarAssistencias('teste', options(async () => json({ places: [{ displayName: example.displayName }] })));
  assert.deepEqual(result, [{ displayName: example.displayName }]);
  assert.equal('nationalPhoneNumber' in result[0], false);
});

test('erros HTTP possuem código e não vazam detalhes do provedor', async () => {
  for (const [status, expected, code] of [[403, 502, 'PLACES_ACCESS_DENIED'], [429, 429, 'PLACES_QUOTA'], [500, 502, 'PLACES_UPSTREAM_ERROR']]) {
    await assert.rejects(buscarAssistencias('teste', options(async () => new Response('segredo-interno', { status }))), error => {
      assert.ok(error instanceof PlacesError);
      assert.equal(error.status, expected);
      assert.equal(error.code, code);
      assert.equal(error.message.includes('segredo-interno'), false);
      return true;
    });
  }
});

test('timeout, falha de rede e JSON inválido são erros explícitos', async () => {
  await assert.rejects(buscarAssistencias('teste', options(async () => { throw new DOMException('timeout', 'TimeoutError'); })), error => error.status === 504);
  await assert.rejects(buscarAssistencias('teste', options(async () => { throw new TypeError('network'); })), error => error.status === 502);
  await assert.rejects(buscarAssistencias('teste', options(async () => new Response('<html>erro</html>'))), error => error.code === 'PLACES_BAD_RESPONSE');
});

test('rejeita tipos inesperados e coordenadas inválidas; preserva zero válido', () => {
  for (const invalid of [null, [], { places: {} }, { places: [null] }, { places: [{ nationalPhoneNumber: 123 }] }, { places: [{ location: { latitude: 91, longitude: 0 } }] }, { places: [{ location: { latitude: 0, longitude: Infinity } }] }]) {
    assert.throws(() => readPlacesResponse(invalid));
  }
  assert.deepEqual(readPlacesResponse({ places: [{ location: { latitude: 0, longitude: 0 } }] }), [{ location: { latitude: 0, longitude: 0 } }]);
});

function invoke(handler, body) {
  const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  return Promise.resolve(handler({ body }, response, () => {})).then(() => response);
}

test('rota valida entrada antes da consulta e retorna somente places', async () => {
  let calls = 0;
  const handler = createPlacesHandler(async query => { calls++; assert.equal(query, 'teste'); return [example]; });
  assert.equal((await invoke(handler, { textQuery: {} })).statusCode, 400);
  assert.equal((await invoke(handler, undefined)).statusCode, 400);
  assert.equal(calls, 0);
  const result = await invoke(handler, { textQuery: ' teste ' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.body, { places: [example] });
  assert.equal(calls, 1);
});

test('limite de dez consultas por minuto e renovação da janela', async () => {
  let now = 0;
  let calls = 0;
  const handler = createPlacesHandler(async () => { calls++; return []; }, () => now);
  for (let i = 0; i < 10; i++) assert.equal((await invoke(handler, { textQuery: 'teste' })).statusCode, 200);
  const limited = await invoke(handler, { textQuery: 'teste' });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(calls, 10);
  now = 60_000;
  assert.equal((await invoke(handler, { textQuery: 'teste' })).statusCode, 200);
});

test('no máximo duas consultas simultâneas, liberadas após conclusão', async () => {
  const releases = [];
  const handler = createPlacesHandler(() => new Promise(resolve => releases.push(resolve)));
  const first = invoke(handler, { textQuery: 'teste' });
  const second = invoke(handler, { textQuery: 'teste' });
  assert.equal((await invoke(handler, { textQuery: 'teste' })).statusCode, 429);
  releases[0]([]);
  releases[1]([]);
  assert.equal((await first).statusCode, 200);
  assert.equal((await second).statusCode, 200);
  const next = invoke(handler, { textQuery: 'teste' });
  releases[2]([]);
  assert.equal((await next).statusCode, 200);
});

test('rota trata falhas inesperadas sem rejeição não capturada', async () => {
  const handler = createPlacesHandler(async () => { throw new Error('detalhes-sensiveis'); });
  const result = await invoke(handler, { textQuery: 'teste' });
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.error.code, 'PLACES_INTERNAL_ERROR');
  assert.equal(JSON.stringify(result.body).includes('detalhes-sensiveis'), false);
});
