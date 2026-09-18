// Atualiza a lista local para que a seleção de cidade não dependa de chamadas externas.
import { mkdir, writeFile } from 'node:fs/promises';

const source = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`IBGE retornou HTTP ${response.status}.`);
const municipalities = await response.json();
if (!Array.isArray(municipalities) || municipalities.length < 5000) throw new Error('Lista de municípios incompleta.');
const cities = municipalities.map(municipality => {
  const uf = municipality['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
    ?? municipality.microrregiao?.mesorregiao?.UF?.sigla;
  if (typeof municipality.nome !== 'string' || !municipality.nome.trim() || !/^[A-Z]{2}$/.test(uf ?? '')) throw new Error('Município inválido na resposta do IBGE.');
  return `${municipality.nome.trim()} - ${uf}`;
});
const unique = [...new Set(cities)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (unique.length !== municipalities.length) throw new Error('Municípios duplicados na resposta.');
const target = new URL('../src/data/cities.json', import.meta.url);
await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await writeFile(target, JSON.stringify({ source, updatedAt: new Date().toISOString().slice(0, 10), cities: unique }, null, 2) + '\n', 'utf8');
console.log(`${unique.length} cidades gravadas em src/data/cities.json.`);
