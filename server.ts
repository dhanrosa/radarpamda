import path from 'node:path';
import dotenv from 'dotenv';
import { createApp } from './server/app.ts';

dotenv.config({ path: ['.env.local', '.env'] });
const app = createApp();
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
const host = process.env.HOST || '127.0.0.1';

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const { default: express } = await import('express');
    const publicPath = path.resolve('dist/client');
    app.use(express.static(publicPath));
    app.get('*', (_req, res) => {
      if (path.extname(_req.path)) { res.status(404).end(); return; }
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }
  const server = app.listen(port, host, () => console.log('Client Radar Pamda disponível em http://' + host + ':' + port));
  server.on('error', error => { console.error('Não foi possível iniciar o servidor:', error.message); process.exitCode = 1; });
}
start().catch(error => { console.error('Falha na inicialização:', error.message); process.exitCode = 1; });
