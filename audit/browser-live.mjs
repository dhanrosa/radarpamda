// Smoke test com até duas consultas reais. Somente execução manual.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('heading', { name: 'Faça sua primeira busca' }).waitFor();
  assert.equal(await page.locator('article').count(), 0);
  await page.getByLabel('Termo 1', { exact: true }).fill('assistência técnica de celular');
  await page.getByLabel('Região da busca', { exact: true }).fill('Centro, Curitiba - PR');
  const request = page.waitForResponse(response => response.url().endsWith('/api/process-leads'));
  await page.getByRole('button', { name: 'Buscar estabelecimentos', exact: true }).click();
  const response = await request;
  assert.equal(response.status(), 200);
  const first = await response.json();
  await page.locator('article').first().waitFor();
  let nextCount = 0;
  if (Object.keys(first.proximas_paginas).length) {
    const nextRequest = page.waitForResponse(response => response.url().endsWith('/api/process-leads'));
    await page.getByRole('button', { name: 'Carregar mais resultados' }).click();
    const nextResponse = await nextRequest;
    assert.equal(nextResponse.status(), 200);
    nextCount = (await nextResponse.json()).resultados_processados.length;
    await page.getByRole('button', { name: 'Buscar estabelecimentos', exact: true }).waitFor();
  }
  await page.screenshot({ path: 'audit/site-real.png', fullPage: true });
  console.log(JSON.stringify({ firstPage: first.resultados_processados.length, nextPage: nextCount, displayed: await page.locator('article').count(), javascriptErrors: errors }, null, 2));
  assert.equal(errors.length, 0);
} finally { await browser.close(); }
