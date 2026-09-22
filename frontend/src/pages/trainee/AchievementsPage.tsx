import { useQuery } from '@tanstack/react-query';
import { Award, CircleCheck, Footprints, Goal, Layers, MessageSquareHeart, ShieldCheck, Star, Target, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { PageHeader, ProgressBar, SectionLabel } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchAchievements } from '../../services/learner';
import type { Achievement } from '../../types';
import { cn } from '../../utils/cn';
import { formatDate } from '../../utils/format';

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  'circle-check': CircleCheck,
  award: Award,
  target: Target,
  star: Star,
  trophy: Trophy,
  goal: Goal,
  'trending-up': TrendingUp,
  layers: Layers,
  'message-square-heart': MessageSquareHeart,
  'shield-check': ShieldCheck,
};

const TIER_STYLE: Record<Achievement['tier'], { badge: string; ring: string; label: string }> = {
  bronze: { badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-200', label: 'Bronze' },
  silver: { badge: 'bg-slate-200 text-slate-700', ring: 'ring-slate-300', label: 'Silver' },
  gold: { badge: 'bg-amber-100 text-amber-700', ring: 'ring-amber-300', label: 'Gold' },
};

function BadgeCard({ achievement }: { achievement: Achievement }) {
  const Icon = ICONS[achievement.icon] ?? Award;
  const tier = TIER_STYLE[achievement.tier];
  return (
    <li className={cn('flex gap-4 rounded-2xl border bg-white p-5 shadow-card', achievement.earned ? 'border-slate-100' : 'border-dashed border-slate-200 bg-slate-50/60')}>
      <span
        className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', achievement.earned ? cn('bg-gradient-to-br from-sky to-navy text-white ring-4', tier.ring) : 'bg-slate-100 text-slate-300')}
        aria-hidden
      >
        <Icon size={26} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('font-display text-base font-bold', achievement.earned ? 'text-navy' : 'text-slate-500')}>{achievement.title}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tier.badge)}>{tier.label}</span>
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-500">{achievement.description}</p>
        <p className={cn('mt-2 text-xs font-semibold', achievement.earned ? 'text-emerald-700' : 'text-slate-500')}>{achievement.earned ? `Earned ${formatDate(achievement.awardedAt)}` : 'Not earned yet'}</p>
      </div>
    </li>
  );
}

export default function AchievementsPage() {
  usePageTitle('Achievements');
  const query = useQuery({ queryKey: keys.achievements, queryFn: fetchAchievements });
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainee workspace" title="Achievements" description="Recognition for real progress. Every badge is awarded automatically from your recorded learning, never handed out manually." />
      <QueryBoundary query={query}>
        {({ items, earnedCount, totalCount }) => (
          <>
            <div className="mb-8 max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
              <p className="text-sm font-semibold text-slate-500">
                <span className="font-display text-3xl font-bold text-navy">{earnedCount}</span> of {totalCount} earned
              </p>
              <div className="mt-3">
                <ProgressBar value={totalCount ? (earnedCount / totalCount) * 100 : 0} color="violet" label="Achievements earned" />
              </div>
            </div>
            <SectionLabel>Earned</SectionLabel>
            {earnedCount === 0 ? (
              <p className="mb-8 text-sm text-slate-500">Nothing yet. Enroll in a course to earn your first badge.</p>
            ) : (
              <ul className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.filter((item) => item.earned).map((item) => (
                  <BadgeCard key={item.code} achievement={item} />
                ))}
              </ul>
            )}
            {earnedCount < totalCount && (
              <>
                <SectionLabel>Still to earn</SectionLabel>
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.filter((item) => !item.earned).map((item) => (
                    <BadgeCard key={item.code} achievement={item} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
