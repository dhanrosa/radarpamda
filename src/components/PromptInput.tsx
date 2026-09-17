import { useState } from 'react';
import { Search, LoaderCircle } from 'lucide-react';
import type { SearchRequest } from '../types';

interface Props { onProcess: (params: SearchRequest) => Promise<void>; isLoading: boolean; available: boolean }
export default function PromptInput({ onProcess, isLoading, available }: Props) {
  const [terms, setTerms] = useState(['', '', '']);
  const [region, setRegion] = useState('');
  return <form onSubmit={event => {
    event.preventDefault();
    if (!isLoading && available) void onProcess({ termos: terms.map(term => term.trim()).filter(Boolean), regiao_alvo: region.trim() });
  }} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-white">Encontre seus próximos clientes</h2>
      <p className="mt-1 text-sm text-slate-400">Pesquise atividades e uma região. Os estabelecimentos são consultados no Google Places.</p>
    </div>
    <fieldset disabled={isLoading || !available} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-3">
        {terms.map((term, index) => <div key={index}>
          <label htmlFor={'search-term-' + index} className="mb-1.5 block text-xs font-medium text-slate-300">Termo {index + 1}{index > 0 ? ' (opcional)' : ''}</label>
          <input id={'search-term-' + index} required={index === 0} maxLength={100} value={term}
            onChange={event => setTerms(current => current.map((value, i) => i === index ? event.target.value : value))}
            placeholder="Atividade ou tipo de estabelecimento"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm focus:border-emerald-500 focus:outline-none" />
        </div>)}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="search-region" className="mb-1.5 block text-xs font-medium text-slate-300">Região da busca</label>
          <input id="search-region" required maxLength={200} value={region} onChange={event => setRegion(event.target.value)}
            placeholder="Bairro, cidade e estado"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm focus:border-emerald-500 focus:outline-none" />
        </div>
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed">
          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isLoading ? 'Consultando Google Places…' : 'Buscar estabelecimentos'}
        </button>
      </div>
    </fieldset>
    <p className="mt-4 text-xs leading-relaxed text-slate-500">Até três termos por busca. Cada termo consulta uma página de até 20 locais; use “Carregar mais” quando houver outras páginas.</p>
  </form>;
}
