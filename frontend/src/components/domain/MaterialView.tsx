import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, FileText, HardDriveDownload, Link2, PlayCircle, TextQuote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assetUrl, errorMessage } from '../../api/client';
import { openMaterial, savedMediaUrl } from '../../offline/content';
import type { LearningMaterial, MaterialType } from '../../types';
import { formatFileSize } from '../../utils/format';
import { Button, useToast } from '../ui';

const ICON: Record<MaterialType, typeof FileText> = { VIDEO: PlayCircle, DOCUMENT: FileText, LINK: Link2, TEXT: TextQuote };
const LABEL: Record<MaterialType, string> = { VIDEO: 'Video', DOCUMENT: 'Document', LINK: 'External link', TEXT: 'Reading' };

/** Only http(s) links are ever opened (the server enforces the same rule when a link is saved). */
export function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-sky hover:text-sky-deep">
      <ExternalLink size={15} aria-hidden /> {label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** One learning material inside the course player. */
export function MaterialView({ material }: { material: LearningMaterial }) {
  const toast = useToast();
  const Icon = ICON[material.type];
  const external = safeHref(material.url);
  const file = useMutation({ mutationFn: (mode: 'download' | 'open') => openMaterial(material, mode), onError: (error) => toast.error(errorMessage(error)) });
  const isPdf = material.mimeType === 'application/pdf';

  // A video saved on this device plays from disk: instantly, and with no network at all.
  const [savedVideo, setSavedVideo] = useState<string | null>(null);
  useEffect(() => {
    if (material.type !== 'VIDEO' || !material.downloadUrl) return undefined;
    let objectUrl: string | null = null;
    void savedMediaUrl(material.id).then((url) => {
      objectUrl = url;
      setSavedVideo(url);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material.id, material.type, material.downloadUrl]);

  const videoSource = savedVideo ?? (material.type === 'VIDEO' ? assetUrl(material.downloadUrl) : null);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card" aria-label={material.title}>
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist text-sky-deep" aria-hidden>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-navy">{material.title}</h3>
          <p className="text-xs text-slate-500">
            {LABEL[material.type]}
            {material.fileName ? ` · ${material.fileName}` : ''}
            {material.sizeBytes ? ` · ${formatFileSize(material.sizeBytes)}` : ''}
          </p>
          {savedVideo && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <HardDriveDownload size={11} aria-hidden /> Playing from this device
            </p>
          )}
        </div>
      </header>

      {material.type === 'TEXT' && (
        <div className="space-y-3 text-sm leading-7 text-slate-700">
          {(material.content ?? '')
            .split(/\n{2,}/)
            .filter((paragraph) => paragraph.trim())
            .map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
        </div>
      )}

      {material.type === 'VIDEO' && videoSource && (
        <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" src={videoSource}>
          Your browser cannot play this video. Use the download button instead.
        </video>
      )}
      {material.type === 'VIDEO' && !videoSource && external && <ExternalLinkButton href={external} label="Watch the video" />}

      {(material.type === 'DOCUMENT' || (material.type === 'VIDEO' && videoSource)) && material.downloadUrl && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={file.isPending && file.variables === 'download'} onClick={() => file.mutate('download')} leftIcon={<Download size={14} />}>
            Download
          </Button>
          {isPdf && (
            <Button size="sm" variant="secondary" loading={file.isPending && file.variables === 'open'} onClick={() => file.mutate('open')} leftIcon={<ExternalLink size={14} />}>
              Open in a new tab
            </Button>
          )}
        </div>
      )}
      {material.type === 'DOCUMENT' && !material.downloadUrl && external && <ExternalLinkButton href={external} label="Open the document" />}

      {material.type === 'LINK' &&
        (external ? (
          <div className="space-y-2">
            <p className="break-all text-xs text-slate-500">{new URL(external).hostname}</p>
            <ExternalLinkButton href={external} label="Open the resource" />
          </div>
        ) : (
          <p className="text-sm text-slate-500">This link is not available.</p>
        ))}
    </article>
  );
}
