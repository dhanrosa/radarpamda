import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import handler from '../api/index.ts';

test('entrada da Vercel atende health, valida buscas e retorna erros de API em JSON', async () => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    for (const route of ['/api/process-leads', '/api/places/search']) {
      const response = await fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: '{}',
      });
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.ok((await response.json()).error.code);
    }

    const missing = await fetch(base + '/api/inexistente');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
