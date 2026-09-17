// Consulta o registro publico npm apenas com nomes/versoes instalados.
import fs from 'node:fs/promises';
const lock = JSON.parse(await fs.readFile(new URL('../node_modules/.package-lock.json', import.meta.url), 'utf8'));
const versions = {};
for (const [name, info] of Object.entries(lock.packages)) {
  if (!info.version || !name.includes('node_modules/')) continue;
  const packageName = name.split('node_modules/').at(-1);
  versions[packageName] ??= [];
  if (!versions[packageName].includes(info.version)) versions[packageName].push(info.version);
}
const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(versions), signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Registro npm respondeu ${response.status}`);
const advisories = await response.json();
await fs.writeFile(new URL('./dependency-advisories.json', import.meta.url), JSON.stringify({ packagesChecked: Object.keys(versions).length, advisories }, null, 2));
console.log(JSON.stringify({ packagesChecked: Object.keys(versions).length, advisories }, null, 2));
