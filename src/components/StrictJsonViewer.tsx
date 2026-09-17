import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import type { LeadExtractionPayload } from '../types';
import { exportarParaJSON, strictPayload } from '../lib/geoUtils';

export default function StrictJsonViewer({ data }: { data: LeadExtractionPayload | null }) {
  const [status, setStatus] = useState('');
  if (!data) return null;
  const payload = strictPayload(data);
  const text = JSON.stringify(payload, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('JSON copiado.'); }
    catch { setStatus('Não foi possível copiar. Use o download.'); }
  };
  return <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
      <h2 className="mr-auto text-sm font-semibold text-white">Resultados em JSON</h2>
      <button onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"><Copy className="h-4 w-4" /> Copiar JSON</button>
      <button onClick={() => exportarParaJSON(payload)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Download className="h-4 w-4" /> Baixar JSON</button>
    </div>
    <p className="px-4 pt-4 text-xs text-slate-400">Dados não informados permanecem vazios; coordenadas ausentes são representadas por null.</p>
    <p className="px-4 text-xs text-emerald-300" role="status">{status}</p>
    <pre className="max-h-[600px] overflow-auto p-4 text-xs leading-relaxed text-slate-300"><code>{text}</code></pre>
  </div>;
}
