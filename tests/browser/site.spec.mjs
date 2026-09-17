import { test, expect } from '@playwright/test';

const lead = { id: 'test-a', nome_loja: 'Empresa para teste', endereco: 'Endereço para teste', telefone: '+55 (41) 99999-9999', link_whatsapp: 'https://wa.me/5541999999999', coordenadas: { lat: -25.4, lng: -49.2 } };
const pageData = (leads, next = {}) => ({ parametros_busca: { termos: ['reparos'], regiao_alvo: 'Curitiba - PR' }, resultados_processados: leads, fonte: 'Google Places', consultado_em: '2026-09-17T16:00:00.000Z', proximas_paginas: next });
async function search(page) {
  await page.getByLabel('Termo 1', { exact: true }).fill('reparos');
  await page.getByLabel('Região da busca', { exact: true }).fill('Curitiba - PR');
  await page.getByRole('button', { name: 'Buscar estabelecimentos', exact: true }).click();
}

test('inicia sem lojas, sem valores preenchidos e sem chamadas de busca', async ({ page }) => {
  let queries = 0;
  await page.route('**/api/process-leads', route => { queries++; return route.fulfill({ json: pageData([]) }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Faça sua primeira busca' })).toBeVisible();
  await expect(page.getByLabel('Termo 1', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Região da busca', { exact: true })).toHaveValue('');
  await expect(page.locator('article')).toHaveCount(0);
  expect(queries).toBe(0);
});

test('exibe dados do backend, seleciona filiais homônimas e preserva ausência de coordenadas', async ({ page }) => {
  const branch = { ...lead, id: 'test-b', endereco: 'Filial B', telefone: '', link_whatsapp: '', coordenadas: null };
  await page.route('**/api/process-leads', route => route.fulfill({ json: pageData([lead, branch]) }));
  await page.goto('/'); await search(page);
  await expect(page.locator('article')).toHaveCount(2);
  await page.locator('article').filter({ hasText: 'Filial B' }).getByRole('button', { name: 'Empresa para teste Filial B' }).click();
  await expect(page.getByRole('complementary')).toContainText('Coordenadas não informadas');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const data = JSON.parse(await page.locator('pre code').textContent());
  expect(data.resultados_processados[1].coordenadas).toBeNull();
  expect(data.resultados_processados[1].telefone).toBe('');
});

test('cria rota no Google Maps começando pelo terminal mais próximo da primeira loja', async ({ page }) => {
  const second = { ...lead, id: 'test-b', nome_loja: 'Outra empresa', coordenadas: { lat: -25.5, lng: -49.3 } };
  await page.route('**/api/process-leads', route => route.fulfill({ json: pageData([lead, second]) }));
  await page.goto('/'); await search(page);
  const href = await page.getByRole('link', { name: 'Criar rota no Google Maps' }).getAttribute('href');
  expect(href).toBeTruthy();
  const route = new URL(href);
  expect(route.pathname).toBe('/maps/dir/');
  expect(route.searchParams.get('origin')).toContain('Terminal de ônibus mais próximo');
  expect(route.searchParams.get('origin')).toContain('-25.4,-49.2');
  expect(route.searchParams.get('destination')).toBe('-25.5,-49.3');
  expect(route.searchParams.get('waypoints')).toBe('-25.4,-49.2');
});

test('paginação mantém consulta, envia token e não duplica estabelecimentos', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/process-leads', route => {
    calls++;
    if (calls === 1) return route.fulfill({ json: pageData([lead], { reparos: 'page-2' }) });
    expect(route.request().postDataJSON().proximas_paginas).toEqual({ reparos: 'page-2' });
    return route.fulfill({ json: pageData([lead, { ...lead, id: 'test-b', nome_loja: 'Outra empresa' }]) });
  });
  await page.goto('/'); await search(page);
  await page.getByRole('button', { name: 'Carregar mais resultados' }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Carregar mais resultados' })).toHaveCount(0);
});

test('erro substitui a busca anterior sem inserir lojas; busca vazia mostra estado vazio', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/process-leads', route => {
    calls++;
    if (calls === 1) return route.fulfill({ json: pageData([lead]) });
    if (calls === 2) return route.fulfill({ status: 502, json: { error: { message: 'Falha de teste no provedor' } } });
    return route.fulfill({ json: pageData([]) });
  });
  await page.goto('/'); await search(page);
  await expect(page.locator('article')).toHaveCount(1);
  await search(page);
  await expect(page.getByRole('alert')).toContainText('Falha de teste no provedor');
  await expect(page.locator('article')).toHaveCount(0);
  await search(page);
  await expect(page.getByRole('heading', { name: 'Nenhum estabelecimento encontrado' })).toBeVisible();
});

test('HTML de estabelecimento é exibido como texto, sem execução', async ({ page }) => {
  const html = '<img src=x onerror="document.body.dataset.audit=1">';
  await page.route('**/api/process-leads', route => route.fulfill({ json: pageData([{ ...lead, endereco: html }]) }));
  await page.goto('/'); await search(page);
  await expect(page.locator('article')).toContainText(html);
  await expect(page.locator('article img')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('data-audit')).toBeNull();
});

test('exporta apenas os resultados filtrados e funciona em largura de celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/process-leads', route => route.fulfill({ json: pageData([lead, { ...lead, id: 'test-b', nome_loja: 'Outra empresa' }]) }));
  await page.goto('/'); await search(page);
  await page.getByRole('textbox', { name: 'Filtrar estabelecimentos' }).fill('Outra');
  await expect(page.locator('article')).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  let content = ''; for await (const chunk of stream) content += chunk.toString('utf8');
  expect(content).toContain('Outra empresa');
  expect(content).not.toContain('Empresa para teste');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
