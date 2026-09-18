import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResultadoProcessado, TerminalRota } from '../types';
import { exportarParaCSV } from '../lib/geoUtils';
import { mapsLink } from '../lib/leadData';
import { orderByRoute, readTerminal, routeLinks } from '../lib/routePlanning';
import { Copy, Download, ExternalLink, MessageSquare, Phone, Route, Search } from 'lucide-react';

interface Props { leads: ResultadoProcessado[]; region: string; selectedLead: ResultadoProcessado | null; onSelectLead: (lead: ResultadoProcessado) => void }
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export default function LeadsList({ leads, region, selectedLead, onSelectLead }: Props) {
  const [filter, setFilter] = useState('');
  const [onlyMobile, setOnlyMobile] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [terminal, setTerminal] = useState<TerminalRota | null>(null);
  const [routeEnabled, setRouteEnabled] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const visible = useMemo(() => {
    const filtered = leads.filter(lead => (!onlyMobile || lead.link_whatsapp) && normalize(lead.nome_loja + ' ' + lead.bairro + ' ' + lead.endereco + ' ' + lead.telefone).includes(normalize(filter)));
    return routeEnabled && terminal ? orderByRoute(filtered, terminal.coordenadas) : filtered;
  }, [leads, onlyMobile, filter, routeEnabled, terminal]);
  const routes = routeEnabled && terminal ? routeLinks(visible, terminal) : [];
  const organizeRoute = async () => {
    if (request.current) return;
    if (routeEnabled) { setRouteEnabled(false); return; }
    if (terminal) { setRouteEnabled(true); return; }
    const abort = new AbortController();
    request.current = abort;
    setRouteLoading(true);
    setRouteError('');
    const timer = setTimeout(() => abort.abort('timeout'), 35_000);
    try {
      const response = await fetch('/api/route-terminal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regiao_alvo: region }), signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível localizar o terminal.');
      setTerminal(readTerminal(result));
      setRouteEnabled(true);
    } catch (error) {
      if (!abort.signal.aborted || abort.signal.reason === 'timeout') setRouteError(abort.signal.aborted ? 'A busca do terminal excedeu o tempo limite. Tente novamente.' : error instanceof Error ? error.message : 'Não foi possível organizar a rota.');
    } finally {
      clearTimeout(timer);
      request.current = null;
      if (!abort.signal.aborted || abort.signal.reason === 'timeout') setRouteLoading(false);
    }
  };
  const copy = async (phone: string) => {
    try { await navigator.clipboard.writeText(phone); setCopyStatus('Telefone copiado.'); }
    catch { setCopyStatus('Não foi possível copiar. Selecione o telefone e copie manualmente.'); }
  };
  return <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold text-white">Estabelecimentos ({visible.length} de {leads.length})</h2>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void organizeRoute()} aria-pressed={routeEnabled} disabled={routeLoading || (!routeEnabled && !visible.some(lead => lead.coordenadas))} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white hover:bg-emerald-600 disabled:opacity-40">
          <Route className="h-4 w-4" /> {routeLoading ? 'Localizando terminal…' : routeEnabled ? 'Voltar à ordem da busca' : 'Organizar por rota'}
        </button>
        <button onClick={() => exportarParaCSV(visible, routeEnabled ? 'leads_prospeccao_rota.csv' : 'leads_prospeccao.csv', routeEnabled && terminal ? terminal : undefined)} disabled={!visible.length || routeLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40">
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>
    </div>
    <div className="space-y-3 border-b border-slate-800 p-4">
      {routeError && <p role="alert" className="text-xs text-red-300">{routeError}</p>}
      {routeLoading && <p role="status" className="text-xs text-slate-300">Buscando o terminal de ônibus mais próximo de {region}…</p>}
      {routeEnabled && terminal && <div className="space-y-2 text-xs text-slate-300">
        <p>Partida: <strong>{terminal.nome}</strong>{terminal.endereco && ` · ${terminal.endereco}`}</p>
        <p>Terminal mais próximo entre os encontrados pelo Google, medido a partir do centro da região pesquisada. Visitas em sequência por proximidade em linha reta, sem considerar trânsito ou ruas. O CSV segue esta ordem.</p>
        {visible.some(lead => !lead.coordenadas) && <p className="text-amber-300">Estabelecimentos sem coordenadas estão no final e precisam de organização manual.</p>}
        <div className="flex flex-wrap gap-2">{routes.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-700 px-3 py-2 text-emerald-300">{routes.length === 1 ? 'Criar rota no Google Maps' : `Google Maps · Trecho ${index + 1} (visitas ${index * 4 + 1}–${Math.min((index + 1) * 4, visible.filter(lead => lead.coordenadas).length)})`}</a>)}</div>
      </div>}
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input aria-label="Filtrar estabelecimentos" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por nome, bairro, endereço ou telefone"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={onlyMobile} onChange={event => setOnlyMobile(event.target.checked)} className="accent-emerald-500" /> Somente celulares com link de contato</label>
      <p className="text-xs text-slate-500">O link permite tentar contato pelo WhatsApp. A existência de uma conta não é verificada.</p>
      <p role="status" className="text-xs text-emerald-300">{copyStatus}</p>
    </div>
    <div className="max-h-[700px] divide-y divide-slate-800 overflow-y-auto">
      {visible.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">Nenhum estabelecimento corresponde ao filtro.</p> : visible.map((lead, index) =>
        <article key={lead.id} className={'p-4 ' + (selectedLead?.id === lead.id ? 'border-l-2 border-emerald-500 bg-slate-800/50' : '')}>
          <button onClick={() => onSelectLead(lead)} aria-pressed={selectedLead?.id === lead.id} className="w-full text-left focus-visible:outline-emerald-500">
            <h3 className="text-sm font-semibold text-slate-100">{routeEnabled && (lead.coordenadas ? `${index + 1}. ` : 'Sem posição na rota · ')}{lead.nome_loja}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{lead.endereco || 'Endereço não informado'}</p>
            {lead.bairro && <p className="mt-1 text-xs text-slate-400">Bairro: {lead.bairro}</p>}
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {lead.telefone ? <><a className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300" href={'tel:' + lead.telefone.replace(/[^+\d]/g, '')}><Phone className="h-3.5 w-3.5" />{lead.telefone}</a>
              <button aria-label={'Copiar telefone de ' + lead.nome_loja} onClick={() => void copy(lead.telefone)} className="p-1 text-slate-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></button></> : <span className="text-xs text-slate-500">Telefone não informado</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              {lead.link_whatsapp && <a href={lead.link_whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs text-white hover:bg-emerald-600"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</a>}
              <a href={mapsLink(lead)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"><ExternalLink className="h-3.5 w-3.5" /> Google Maps</a>
            </div>
          </div>
        </article>
      )}
    </div>
  </div>;
}
