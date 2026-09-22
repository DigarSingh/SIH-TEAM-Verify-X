export function LogoMark({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sky text-white shadow-lg shadow-sky/20" aria-hidden>
        <span className="absolute -right-2 -top-2 h-7 w-7 rounded-full border-[5px] border-white/40" />
        <span className="absolute -bottom-3 -left-1 h-7 w-7 rounded-full border-[5px] border-white/30" />
        <span className="relative h-3 w-3 rounded-full bg-white" />
      </div>
      {!compact && (
        <div>
          <p className={`font-display text-lg font-bold leading-none ${dark ? 'text-navy' : 'text-white'}`}>
            Capacity<span className="text-sky-light">Connect</span>
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">IMD • MoES</p>
        </div>
      )}
    </div>
  );
}
