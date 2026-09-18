import type { LeadExtractionPayload, ResultadoProcessado, TerminalRota } from '../types';
export { formatarTelefoneBR } from './leadData';

export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function toCSV(leads: ResultadoProcessado[], terminal?: TerminalRota): string {
  let stop = 0;
  const rows = [
    [...(terminal ? ['Ordem de visita', 'Terminal de partida', 'Endereço do terminal', 'Latitude do terminal', 'Longitude do terminal', 'Situação na rota'] : []), 'Nome da Loja', 'Bairro', 'Endereço', 'Telefone', 'Link de contato WhatsApp', 'Latitude', 'Longitude', 'Google Place ID'],
    ...leads.map(lead => [...(terminal ? [lead.coordenadas ? ++stop : '', terminal.nome, terminal.endereco, terminal.coordenadas.lat, terminal.coordenadas.lng, lead.coordenadas ? 'Visita ordenada por proximidade' : 'Sem coordenadas: organizar manualmente'] : []), lead.nome_loja, lead.bairro, lead.endereco, lead.telefone, lead.link_whatsapp, lead.coordenadas?.lat, lead.coordenadas?.lng, lead.id]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

function download(content: string, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportarParaCSV(leads: ResultadoProcessado[], filename = 'leads_prospeccao.csv', terminal?: TerminalRota) {
  download(toCSV(leads, terminal), 'text/csv;charset=utf-8;', filename);
}

export function strictPayload(data: LeadExtractionPayload) {
  return {
    parametros_busca: data.parametros_busca,
    resultados_processados: data.resultados_processados.map(({ nome_loja, endereco, telefone, link_whatsapp, coordenadas }) =>
      ({ nome_loja, endereco, telefone, link_whatsapp, coordenadas })),
  };
}

export function exportarParaJSON(data: unknown, filename = 'leads_prospeccao.json') {
  download(JSON.stringify(data, null, 2), 'application/json;charset=utf-8;', filename);
}
