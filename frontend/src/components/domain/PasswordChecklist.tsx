import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '../../utils/forms';
import { cn } from '../../utils/cn';

/** Live checklist of the password policy so people know what is still missing. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={cn('flex items-center gap-2 text-xs', ok ? 'font-semibold text-emerald-700' : 'text-slate-500')}>
            {ok ? <Check size={13} aria-hidden /> : <Circle size={11} aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{ok ? '(met)' : '(not met yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
