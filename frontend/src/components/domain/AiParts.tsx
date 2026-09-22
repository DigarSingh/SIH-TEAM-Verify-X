import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAiProvider } from '../../hooks/misc';
import { Badge } from '../ui';

/** Marks text that an AI model wrote, so nobody mistakes it for a calculated result or a trainer's own words. */
export function AiBadge({ label = 'AI-generated' }: { label?: string }) {
  return (
    <Badge tone="purple" title="Written by an AI model. Check anything important against the course materials.">
      <Sparkles size={11} aria-hidden /> {label}
    </Badge>
  );
}

/** Says what leaves the platform when an AI feature is used; shown next to every AI feature. */
export function AiDisclosure({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-slate-500">{children}</p>;
}

/** The name of the service that receives that text, for use inside a disclosure sentence (plain text, no wrapper element). */
export function AiProvider() {
  return <>{useAiProvider()}</>;
}
