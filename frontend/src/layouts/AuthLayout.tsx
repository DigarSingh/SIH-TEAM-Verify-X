import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { LogoMark } from '../components/domain/LogoMark';

/** Split-screen layout for sign-in and registration. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-navy">
      <div aria-hidden className="absolute -right-48 -top-48 h-[540px] w-[540px] rounded-full border-[80px] border-sky/10" />
      <div aria-hidden className="absolute -bottom-64 -left-32 h-[520px] w-[520px] rounded-full border-[70px] border-teal/10" />
      <div className="relative mx-auto grid grid-cols-1 min-h-screen max-w-7xl lg:grid-cols-[1.05fr_.95fr]">
        <aside aria-label="About Capacity Connect" className="hidden flex-col justify-between px-10 py-10 lg:flex xl:px-20">
          <LogoMark />
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/90">
              <Sparkles size={14} className="text-sky-light" aria-hidden /> The IMD learning intelligence layer
            </div>
            <p className="font-display text-5xl font-bold leading-[1.08] tracking-tight text-white xl:text-6xl">
              From course completion to <span className="text-sky-light">competency development.</span>
            </p>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/60">A centralized platform for employee capacity building, competency management, assessment and certification across the India Meteorological Department.</p>
            <ul className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                ['01', 'Competency-led'],
                ['02', 'Evidence-based'],
                ['03', 'Organization-ready'],
              ].map(([number, label]) => (
                <li key={number} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-display text-xl font-bold text-sky-light">{number}</p>
                  <p className="mt-2 text-xs font-semibold text-white/60">{label}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/60">Ministry of Earth Sciences • India Meteorological Department</p>
        </aside>
        <main className="flex items-center justify-center bg-white/5 px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <LogoMark />
            </div>
            {children}
            <p className="mt-5 text-center text-xs text-white/60">Authorized IMD employees only • Activity on this platform is logged</p>
          </div>
        </main>
      </div>
    </div>
  );
}
