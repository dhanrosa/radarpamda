import type { LeadExtractionPayload } from '../types';
export default function LeadStats({ payload }: { payload: LeadExtractionPayload | null }) {
  if (!payload) return null;
  const leads = payload.resultados_processados;
  const stats = [
    ['Estabelecimentos', leads.length],
    ['Com telefone', leads.filter(lead => lead.telefone).length],
    ['Celulares com link', leads.filter(lead => lead.link_whatsapp).length],
    ['Com coordenadas', leads.filter(lead => lead.coordenadas).length],
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {stats.map(([label, count]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold text-white">{count}</div>
    </div>)}
  </div>;
}
