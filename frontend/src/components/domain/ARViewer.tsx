import { Box, Camera, Expand, Eye, EyeOff, RotateCcw, Smartphone, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ARComponent } from '../../types';
import type { ModelViewerElement } from '../../types/model-viewer';
import { cn } from '../../utils/cn';
import { Button, InlineAlert, Spinner } from '../ui';

/**
 * The 3D and AR view of an instrument.
 *
 * Built on Google's `<model-viewer>`, which is the part of this that is hard:
 * it handles WebXR on Android, Scene Viewer, Quick Look on iOS, camera
 * permission and surface detection. The component below is responsible for the
 * things model-viewer does not know about - which parts are selectable, which
 * one is selected, and saying plainly what is going on when AR is unavailable.
 *
 * The library is imported dynamically so that its several hundred kilobytes are
 * only fetched when somebody actually opens a lab, never on the dashboard.
 */

/** Every state the viewer can be in. The interface always says which one it is. */
export type ViewerState = 'LOADING_LIBRARY' | 'LOADING_MODEL' | 'READY' | 'MODEL_FAILED' | 'LIBRARY_FAILED';
export type ARState = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE' | 'SESSION_STARTING' | 'DETECTING_SURFACE' | 'PLACED' | 'DENIED';

/** Selected components are tinted this colour so the choice is unmistakable on a phone. */
const HIGHLIGHT: [number, number, number, number] = [0.18, 0.55, 1, 1];

export interface ARViewerProps {
  modelUrl: string;
  /** Height of the real instrument, for the scale note. */
  modelHeightM?: number;
  components: ARComponent[];
  /** `key` of the selected component, or null. */
  selectedKey: string | null;
  onSelect: (component: ARComponent) => void;
  /** Hides the markers' text, so an assessment does not label its own answers. */
  hideLabels?: boolean;
  /** Parts that may be hidden to see inside, by component key. */
  cutawayKeys?: string[];
  className?: string;
}

export function ARViewer({ modelUrl, modelHeightM = 1.2, components, selectedKey, onSelect, hideLabels = false, cutawayKeys = [], className }: ARViewerProps) {
  const viewerRef = useRef<ModelViewerElement | null>(null);
  const [state, setState] = useState<ViewerState>('LOADING_LIBRARY');
  const [arState, setArState] = useState<ARState>('UNKNOWN');
  const [cutaway, setCutaway] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  /** The materials' original colours, so a highlight can be undone. */
  const originalColours = useRef(new Map<string, [number, number, number, number]>());

  // ---- load the library on demand --------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (customElements.get('model-viewer')) {
      setState('LOADING_MODEL');
      return () => {
        cancelled = true;
      };
    }
    void import('@google/model-viewer')
      .then(() => {
        if (!cancelled) setState('LOADING_MODEL');
      })
      .catch(() => {
        if (!cancelled) setState('LIBRARY_FAILED');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- follow the element's own lifecycle ------------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || state === 'LOADING_LIBRARY' || state === 'LIBRARY_FAILED') return undefined;

    const onLoad = () => {
      setState('READY');
      // Remember every material's colour before anything is tinted.
      for (const material of viewer.model?.materials ?? []) {
        originalColours.current.set(material.name, [...material.pbrMetallicRoughness.baseColorFactor] as [number, number, number, number]);
      }
      setArState(viewer.canActivateAR ? 'AVAILABLE' : 'UNAVAILABLE');
    };
    const onError = () => setState('MODEL_FAILED');
    const onArStatus = (event: Event) => {
      const status = (event as CustomEvent<{ status: string }>).detail?.status;
      if (status === 'session-started') setArState('DETECTING_SURFACE');
      else if (status === 'object-placed') {
        setArState('PLACED');
        setShowOnboarding(false);
      } else if (status === 'failed') setArState('DENIED');
      else if (status === 'not-presenting') setArState(viewer.canActivateAR ? 'AVAILABLE' : 'UNAVAILABLE');
    };

    viewer.addEventListener('load', onLoad);
    viewer.addEventListener('error', onError);
    viewer.addEventListener('ar-status', onArStatus);
    if (viewer.loaded) onLoad();
    return () => {
      viewer.removeEventListener('load', onLoad);
      viewer.removeEventListener('error', onError);
      viewer.removeEventListener('ar-status', onArStatus);
    };
  }, [state]);

  // ---- tint the selected component -------------------------------------------------------------
  useEffect(() => {
    const materials = viewerRef.current?.model?.materials;
    if (!materials || state !== 'READY') return;
    for (const material of materials) {
      const original = originalColours.current.get(material.name);
      if (!original) continue;
      const hidden = cutaway && cutawayKeys.includes(material.name);
      if (hidden) material.pbrMetallicRoughness.setBaseColorFactor([original[0], original[1], original[2], 0]);
      else if (material.name === selectedKey) material.pbrMetallicRoughness.setBaseColorFactor(HIGHLIGHT);
      else material.pbrMetallicRoughness.setBaseColorFactor(original);
    }
  }, [selectedKey, state, cutaway, cutawayKeys]);

  const resetCamera = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = '35deg 72deg 100%';
    viewer.fieldOfView = 'auto';
    viewer.jumpCameraToGoal();
  }, []);

  const enterAr = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setShowOnboarding(true);
    setArState('SESSION_STARTING');
    try {
      await viewer.activateAR();
    } catch {
      setArState('DENIED');
      setShowOnboarding(false);
    }
  }, []);

  const fullscreen = useCallback(() => {
    const element = viewerRef.current?.parentElement;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.().catch(() => undefined);
  }, []);

  const interactive = components.filter((component) => component.isInteractive);
  const canCutaway = cutawayKeys.length > 0;

  if (state === 'LIBRARY_FAILED') {
    return (
      <div className={cn('rounded-2xl border border-slate-200 bg-white p-6', className)}>
        <InlineAlert tone="danger">
          <span className="flex items-start gap-2">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              The 3D viewer could not be downloaded. Check your connection and reload the page. Your progress in this lab has not been lost.
            </span>
          </span>
        </InlineAlert>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100', className)}>
      {/* The viewer fills a portrait-friendly box: AR is a phone experience first. */}
      <div className="relative aspect-[4/5] w-full sm:aspect-[16/10]">
        {state !== 'LOADING_LIBRARY' && (
          <model-viewer
            ref={viewerRef}
            src={modelUrl}
            alt="Interactive three-dimensional model of a Doppler weather radar"
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            camera-controls
            touch-action="pan-y"
            auto-rotate
            auto-rotate-delay={4000}
            rotation-per-second="12deg"
            shadow-intensity="1"
            shadow-softness="0.8"
            camera-orbit="35deg 72deg 100%"
            min-camera-orbit="auto auto 40%"
            max-camera-orbit="auto 100deg 300%"
            exposure="1.05"
            interaction-prompt="auto"
            style={{ width: '100%', height: '100%', backgroundColor: 'transparent', '--poster-color': 'transparent' } as React.CSSProperties}
          >
            {/*
              Markers are real buttons anchored in 3D. Using buttons rather than
              raycasting into the mesh means they are keyboard reachable and
              announced by a screen reader, which a tap target on a canvas is not.
            */}
            {state === 'READY' &&
              interactive.map((component, index) => (
                <button
                  key={component.id}
                  slot={`hotspot-${component.key}`}
                  data-position={`${component.hotspotPosition.x} ${component.hotspotPosition.y} ${component.hotspotPosition.z}`}
                  {...(component.hotspotNormal ? { 'data-normal': `${component.hotspotNormal.x} ${component.hotspotNormal.y} ${component.hotspotNormal.z}` } : {})}
                  type="button"
                  onClick={() => onSelect(component)}
                  aria-label={hideLabels ? `Component ${index + 1}` : component.name}
                  aria-pressed={selectedKey === component.key}
                  className={cn(
                    'flex min-h-[32px] items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold shadow-lg transition',
                    selectedKey === component.key ? 'border-white bg-sky-deep text-white' : 'border-white/90 bg-white/95 text-navy hover:bg-white',
                  )}
                >
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]', selectedKey === component.key ? 'bg-white text-sky-deep' : 'bg-sky-deep text-white')}>
                    {index + 1}
                  </span>
                  {!hideLabels && <span className="whitespace-nowrap">{component.name}</span>}
                </button>
              ))}

            {/* model-viewer's own progress bar is replaced by the app's loading state. */}
            <div slot="progress-bar" />
          </model-viewer>
        )}

        {(state === 'LOADING_LIBRARY' || state === 'LOADING_MODEL') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50/80">
            <Spinner label="" className="[&>span:last-child]:sr-only" />
            <p className="text-sm font-semibold text-slate-600">{state === 'LOADING_LIBRARY' ? 'Preparing the 3D viewer…' : 'Loading the model…'}</p>
            <p className="max-w-xs px-6 text-center text-xs text-slate-500">This downloads once and is then kept on your device.</p>
          </div>
        )}

        {state === 'MODEL_FAILED' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center">
            <TriangleAlert size={28} className="text-amber-600" aria-hidden />
            <p className="font-display text-base font-bold text-navy">The model could not be loaded</p>
            <p className="max-w-sm text-sm text-slate-600">This is usually a connection problem. You can reload the page to try again; nothing you have done in this lab has been lost.</p>
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        )}

        {showOnboarding && arState !== 'PLACED' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/85 to-transparent p-5 pt-12 text-center">
            <p className="text-sm font-bold text-white">Point your camera at a flat surface, then tap to place the radar.</p>
            <p className="mt-1 text-xs text-white/80">Move your phone slowly so it can find the floor or a table.</p>
          </div>
        )}
      </div>

      {/* ---- controls ------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/80 p-3">
        {arState === 'AVAILABLE' || arState === 'PLACED' || arState === 'DETECTING_SURFACE' ? (
          <Button size="sm" onClick={() => void enterAr()} leftIcon={<Camera size={15} />} disabled={state !== 'READY'}>
            View in AR
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
            <Box size={13} aria-hidden /> Interactive 3D
          </span>
        )}

        <Button size="sm" variant="secondary" onClick={resetCamera} leftIcon={<RotateCcw size={14} />} disabled={state !== 'READY'}>
          Reset view
        </Button>

        {canCutaway && (
          <Button size="sm" variant="secondary" onClick={() => setCutaway((value) => !value)} leftIcon={cutaway ? <EyeOff size={14} /> : <Eye size={14} />} disabled={state !== 'READY'}>
            {cutaway ? 'Show radome' : 'See inside'}
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={fullscreen} leftIcon={<Expand size={14} />} disabled={state !== 'READY'}>
          Fullscreen
        </Button>

        <span className="ml-auto text-[11px] text-slate-500">Scale model, about {modelHeightM} m tall</span>
      </div>

      <ARAvailabilityNote state={arState} viewerState={state} />
    </div>
  );
}

/**
 * Says plainly what the device can and cannot do.
 *
 * The rule from the brief: AR being unavailable must never block the
 * assessment, and the interface must never leave the trainee guessing.
 */
function ARAvailabilityNote({ state, viewerState }: { state: ARState; viewerState: ViewerState }) {
  if (viewerState !== 'READY') return null;

  if (state === 'UNAVAILABLE') {
    return (
      <div className="border-t border-slate-200 bg-sky/5 px-4 py-3">
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-600">
          <Smartphone size={14} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden />
          <span>
            <strong className="text-navy">AR is unavailable on this device.</strong> You can complete the whole lab in Interactive 3D Mode - drag to rotate, pinch or scroll to zoom, and tap a marker
            to select a component. For the AR experience, open this page on an Android phone in Chrome.
          </span>
        </p>
      </div>
    );
  }

  if (state === 'DENIED') {
    return (
      <div className="border-t border-slate-200 bg-amber-50 px-4 py-3">
        <p className="flex items-start gap-2 text-xs leading-5 text-amber-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>The camera could not be started.</strong> Allow camera access for this site in your browser settings and tap "View in AR" again. You can carry on in Interactive 3D Mode in the
            meantime - it is marked the same way.
          </span>
        </p>
      </div>
    );
  }

  if (state === 'DETECTING_SURFACE') {
    return (
      <div className="border-t border-slate-200 bg-sky/5 px-4 py-3">
        <p className="text-xs font-semibold text-sky-deep">Looking for a surface… move your phone slowly across the floor or a table.</p>
      </div>
    );
  }

  return null;
}
