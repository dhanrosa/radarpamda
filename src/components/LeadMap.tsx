import { ExternalLink, MapPin, Phone } from 'lucide-react';
import type { ResultadoProcessado } from '../types';
import { mapsLink } from '../lib/leadData';

export default function LeadMap({ selectedLead }: { selectedLead: ResultadoProcessado | null }) {
  if (!selectedLead) return null;
  return <aside className="rounded-xl border border-slate-800 bg-slate-900 p-5" aria-label="Localização selecionada">
    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-400"><MapPin className="h-4 w-4" /> Localização selecionada</div>
    <h3 className="font-semibold text-white break-words">{selectedLead.nome_loja}</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-400">{selectedLead.endereco || 'Endereço não informado pelo Google.'}</p>
    <p className="mt-4 flex items-center gap-2 text-sm text-slate-300"><Phone className="h-4 w-4 shrink-0" /> {selectedLead.telefone || 'Telefone não informado'}</p>
    <p className="mt-3 text-xs text-slate-500">
      {selectedLead.coordenadas ? 'Latitude ' + selectedLead.coordenadas.lat.toFixed(6) + ' · Longitude ' + selectedLead.coordenadas.lng.toFixed(6) : 'Coordenadas não informadas pelo Google.'}
    </p>
    <a href={mapsLink(selectedLead)} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
      <ExternalLink className="h-4 w-4" /> Abrir localização no Google Maps
    </a>
    <p className="mt-3 text-xs leading-relaxed text-slate-500">Veja o mapa, as rotas e os detalhes do estabelecimento no Google Maps.</p>
  </aside>;
}
