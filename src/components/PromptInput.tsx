import { useState } from 'react';
import { Search, LoaderCircle } from 'lucide-react';
import type { SearchRequest } from '../types';
import cityData from '../data/cities.json';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const cityOptions = cityData.cities.map(label => ({ label, normalized: normalize(label) }));

interface Props { onProcess: (params: SearchRequest) => Promise<void>; isLoading: boolean; available: boolean }
export default function PromptInput({ onProcess, isLoading, available }: Props) {
  const [terms, setTerms] = useState(['', '', '']);
  const [cityInput, setCityInput] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const cityQuery = normalize(cityInput);
  const selectedCity = cityOptions.find(city => city.normalized === cityQuery)?.label ?? '';
  const suggestedCities = cityOptions.filter(city => city.normalized.includes(cityQuery)).slice(0, 40);
  const region = [neighborhood.trim(), selectedCity].filter(Boolean).join(', ');
  return <form onSubmit={event => {
    event.preventDefault();
    if (!isLoading && available && selectedCity) void onProcess({ termos: terms.map(term => term.trim()).filter(Boolean), regiao_alvo: region });
  }} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-white">Encontre seus próximos clientes</h2>
      <p className="mt-1 text-sm text-slate-400">Pesquise atividades, selecione a cidade e informe o bairro. Os estabelecimentos são consultados no Google Places.</p>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="search-city" className="mb-1.5 block text-xs font-medium text-slate-300">Cidade</label>
          <input id="search-city" list="search-city-options" required maxLength={100} value={cityInput} autoComplete="off" aria-describedby="search-city-help"
            onChange={event => {
              const value = event.target.value;
              setCityInput(value);
              setNeighborhood('');
              event.target.setCustomValidity(value && !cityOptions.some(city => city.normalized === normalize(value)) ? 'Selecione uma cidade da lista, incluindo a sigla do estado.' : '');
            }}
            onBlur={() => { if (selectedCity) setCityInput(selectedCity); }}
            placeholder="Digite e selecione a cidade"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm focus:border-emerald-500 focus:outline-none" />
          <datalist id="search-city-options">{suggestedCities.map(city => <option key={city.label} value={city.label} />)}</datalist>
          <p id="search-city-help" className="mt-1.5 text-xs text-slate-500">Selecione a cidade com o estado. Ex.: Curitiba - PR.</p>
        </div>
        <div className="min-w-0">
          <label htmlFor="search-neighborhood" className="mb-1.5 block text-xs font-medium text-slate-300">Bairro (opcional)</label>
          <input id="search-neighborhood" maxLength={90} value={neighborhood} onChange={event => setNeighborhood(event.target.value)} disabled={!selectedCity}
            aria-describedby="search-neighborhood-help" placeholder={selectedCity ? 'Ex.: Pinheirinho' : 'Selecione a cidade primeiro'}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" />
          <p id="search-neighborhood-help" className="mt-1.5 text-xs text-slate-500">Deixe vazio para buscar na cidade inteira.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400" aria-live="polite">{selectedCity ? `Região da busca: ${region}` : 'Selecione uma cidade para definir a região da busca.'}</p>
        <button type="submit" disabled={!selectedCity} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isLoading ? 'Consultando Google Places…' : 'Buscar estabelecimentos'}
        </button>
      </div>
    </fieldset>
    <p className="mt-4 text-xs leading-relaxed text-slate-500">Até três termos por busca. Cada termo consulta uma página de até 20 locais; use “Carregar mais” quando houver outras páginas.</p>
  </form>;
}
