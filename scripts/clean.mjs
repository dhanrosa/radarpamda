import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.resolve(root, 'dist');
if (path.dirname(target) !== path.resolve(root) || path.basename(target) !== 'dist') throw new Error('Destino de limpeza inválido.');
rmSync(target, { recursive: true, force: true });
