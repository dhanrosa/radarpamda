import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Code2, List, LoaderCircle, Search } from 'lucide-react';
import Header from './components/Header';
import PromptInput from './components/PromptInput';
import LeadStats from './components/LeadStats';
import LeadMap from './components/LeadMap';
import LeadsList from './components/LeadsList';
import StrictJsonViewer from './components/StrictJsonViewer';
import type { ResultadoProcessado, SearchPage, SearchRequest } from './types';
import { mergeLeads, readSearchPage } from './lib/leadData';

export default function App() {
  const [data, setData] = useState<SearchPage | null>(null);
  const [selected, setSelected] = useState<ResultadoProcessado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'json'>('list');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/health', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Não foi possível verificar a conexão com o servidor.');
      const result = await response.json();
      setConfigured(Boolean(result.placesConfigured));
    }).catch(failure => {
      if (!abort.signal.aborted) { setConfigured(false); setError(failure.message); }
    });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  const search = async (request: SearchRequest, append = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    if (!append) { setData(null); setSelected(null); setView('list'); }
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort('timeout'), 55_000);
    try {
      const response = await fetch('/api/process-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Falha ao consultar estabelecimentos.');
      const page = readSearchPage(result);
      const combined = append && data ? mergeLeads(data.resultados_processados, page.resultados_processados) : page.resultados_processados;
      setData({ ...page, resultados_processados: combined });
      setSelected(current => append && current ? combined.find(lead => lead.id === current.id) || combined[0] || null : combined[0] || null);
    } catch (failure) {
      if (abort.signal.aborted) setError(abort.signal.reason === 'timeout' ? 'A busca excedeu o tempo limite. Tente novamente.' : 'Busca cancelada.');
      else setError(failure instanceof Error ? failure.message : 'Não foi possível consultar o Google Places.');
    } finally {
      clearTimeout(timer);
      controller.current = null;
      busy.current = false;
      setLoading(false);
    }
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <Header />
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {configured === null && <p className="text-sm text-slate-400" role="status">Conectando ao servidor…</p>}
      {configured === false && <div role="alert" className="rounded-xl border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-200">A busca está indisponível. Configure GOOGLE_MAPS_API_KEY no servidor e reinicie o site.</div>}
      <PromptInput onProcess={request => search(request)} isLoading={loading} available={configured === true} />
      {loading && <div className="flex items-center gap-3 text-sm text-slate-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin text-emerald-400" /> Consultando estabelecimentos… <button onClick={() => controller.current?.abort()} className="ml-auto text-xs underline">Cancelar busca</button></div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-900 bg-red-950/60 p-4 text-sm text-red-200"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {!data && !loading && <div className="rounded-2xl border border-dashed border-slate-800 px-6 py-14 text-center">
        <Search className="mx-auto mb-4 h-9 w-9 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-200">Faça sua primeira busca</h2>
        <p className="mt-2 text-sm text-slate-500">Informe uma atividade e uma região para encontrar estabelecimentos.</p>
      </div>}
      {data && <>
        <LeadStats payload={data} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-medium text-slate-200">{data.parametros_busca.regiao_alvo}</p><p className="mt-1 text-xs text-slate-500">Dados do Google Maps · Consultados em {new Date(data.consultado_em).toLocaleString('pt-BR')}</p></div>
          <div className="flex gap-2">
            <button aria-pressed={view === 'list'} onClick={() => setView('list')} className={'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs ' + (view === 'list' ? 'bg-emerald-700 text-white' : 'border border-slate-700 text-slate-300')}><List className="h-4 w-4" /> Estabelecimentos</button>
            <button aria-pressed={view === 'json'} onClick={() => setView('json')} className={'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs ' + (view === 'json' ? 'bg-emerald-700 text-white' : 'border border-slate-700 text-slate-300')}><Code2 className="h-4 w-4" /> JSON</button>
          </div>
        </div>
        {data.resultados_processados.length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center"><h2 className="font-semibold">Nenhum estabelecimento encontrado</h2><p className="mt-2 text-sm text-slate-400">Revise os termos ou amplie a região da busca.</p></div>}
        {view === 'json' ? <StrictJsonViewer data={data} /> : data.resultados_processados.length > 0 && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <LeadsList leads={data.resultados_processados} selectedLead={selected} onSelectLead={setSelected} />
          <LeadMap selectedLead={selected} />
        </div>}
        {Object.keys(data.proximas_paginas).length > 0 && <div className="text-center"><button disabled={loading} onClick={() => void search({ ...data.parametros_busca, proximas_paginas: data.proximas_paginas }, true)} className="rounded-lg border border-emerald-700 px-5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-950 disabled:opacity-50">Carregar mais resultados</button></div>}
        <p className="text-xs leading-relaxed text-slate-500">Os resultados seguem a relevância do Google para a região e podem incluir estabelecimentos próximos. Dados de contato podem mudar.</p>
      </>}
    </main>
    <footer className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-slate-600">Client Radar Pamda · Consulte a localização de cada empresa no Google Maps.</footer>
  </div>;
}
