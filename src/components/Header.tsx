export default function Header() {
  return <header className="border-b border-slate-800 bg-slate-950">
    <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5 sm:px-6">
      <img src="/favicon.svg" alt="" width="40" height="40" className="h-10 w-10 shrink-0" />
      <div><h1 className="font-bold text-white">Client Radar Pamda</h1><p className="text-xs text-slate-400">Empresas, contatos e localização</p></div>
      <span className="ml-auto rounded-full border border-emerald-900 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">Google Places</span>
    </div>
  </header>;
}
