// Teste do build de producao; nao utiliza a chave real nem consulta o Google.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'http://127.0.0.1:31993';
const child = spawn(process.execPath, ['scripts/start.mjs'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '31993', HOST: '127.0.0.1', GOOGLE_MAPS_API_KEY: '' },
});
let output = '';
child.stderr.on('data', chunk => { output += chunk; });
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Servidor não iniciou: ' + output)), 10_000);
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Servidor encerrou: ' + output)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('disponível em')) { clearTimeout(timeout); resolve(); }
    });
  });
  for (const file of ['server.cjs', 'server.cjs.map', '.env']) {
    assert.equal((await fetch(base + '/' + file)).status, 404);
  }
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.mode, 'real');
  assert.equal(health.placesConfigured, false);
  for (const body of [{ termos: ['teste'], regiao_alvo: {} }, {}, { prompt: 'texto' }]) {
    const response = await fetch(base + '/api/process-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
  const missingKey = await fetch(base + '/api/process-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termos: ['teste'], regiao_alvo: 'Curitiba - PR' }) });
  assert.equal(missingKey.status, 503);
  assert.equal((await missingKey.json()).error.code, 'PLACES_NOT_CONFIGURED');
  const invalidJSON = await fetch(base + '/api/process-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalidJSON.status, 400);
  assert.ok(invalidJSON.headers.get('content-type').includes('application/json'));
  assert.equal((await fetch(base + '/api/health')).status, 200);
  console.log('Produção validada: backend e env inacessíveis; erros JSON; entrada inválida não derruba o servidor; chave ausente retorna 503 sem lojas fictícias.');
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
}
