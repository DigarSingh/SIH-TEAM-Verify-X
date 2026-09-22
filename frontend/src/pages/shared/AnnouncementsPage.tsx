import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchAnnouncements } from '../../services/notifications';
import { formatDate } from '../../utils/format';

const AUDIENCE_LABEL = { ALL: 'Everyone', TRAINEES: 'Trainees', TRAINERS: 'Trainers', ADMINS: 'Administrators' } as const;

export default function AnnouncementsPage() {
  usePageTitle('Announcements');
  const query = useQuery({ queryKey: keys.announcements, queryFn: fetchAnnouncements });
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Account" title="Announcements" description="Official messages from the capacity-building team." />
      <QueryBoundary query={query}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="No announcements" description="There is nothing to read right now." icon={<Megaphone size={18} />} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {items.map((announcement) => (
                <Card key={announcement.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="orange">
                      <Megaphone size={11} aria-hidden /> Announcement
                    </Badge>
                    <Badge tone="neutral">{AUDIENCE_LABEL[announcement.audience]}</Badge>
                    <span className="text-xs text-slate-500">
                      {formatDate(announcement.publishedAt)} · {announcement.author}
                    </span>
                  </div>
                  <h2 className="mt-3 font-display text-lg font-bold text-navy">{announcement.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{announcement.body}</p>
                  {announcement.expiresAt && <p className="mt-3 text-xs text-slate-500">Valid until {formatDate(announcement.expiresAt)}</p>}
                </Card>
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
