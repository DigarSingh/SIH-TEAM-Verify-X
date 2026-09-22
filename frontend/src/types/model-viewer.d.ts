/**
 * JSX and runtime typings for Google's `<model-viewer>` web component.
 *
 * The package ships its own types for the element class, but not for using the
 * custom element in JSX, so the attributes the application actually sets are
 * declared here rather than reaching for `any`.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** The subset of the element's imperative API this application uses. */
export interface ModelViewerElement extends HTMLElement {
  /** True once the model has loaded and the device can start an AR session. */
  readonly canActivateAR: boolean;
  readonly loaded: boolean;
  /** Starts an AR session. Rejects when the device or the user declines. */
  activateAR: () => Promise<void>;
  /** The loaded scene graph; undefined until the `load` event. */
  readonly model?: {
    materials: {
      name: string;
      pbrMetallicRoughness: {
        baseColorFactor: [number, number, number, number];
        setBaseColorFactor: (colour: [number, number, number, number]) => void;
      };
      setAlphaMode?: (mode: 'OPAQUE' | 'MASK' | 'BLEND') => void;
    }[];
  };
  cameraOrbit: string;
  cameraTarget: string;
  fieldOfView: string;
  /** Returns the camera to the position the attributes describe. */
  resetTurntableRotation: (radians?: number) => void;
  jumpCameraToGoal: () => void;
}

type ModelViewerAttributes = {
  src?: string;
  alt?: string;
  poster?: string;
  ar?: boolean;
  'ar-modes'?: string;
  'ar-scale'?: 'auto' | 'fixed';
  'ar-placement'?: 'floor' | 'wall';
  'camera-controls'?: boolean;
  'touch-action'?: string;
  'auto-rotate'?: boolean;
  'auto-rotate-delay'?: number;
  'rotation-per-second'?: string;
  'shadow-intensity'?: string | number;
  'shadow-softness'?: string | number;
  'environment-image'?: string;
  'camera-orbit'?: string;
  'camera-target'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  'field-of-view'?: string;
  exposure?: string | number;
  'interaction-prompt'?: 'auto' | 'none';
  'disable-zoom'?: boolean;
  'disable-tap'?: boolean;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'manual';
  ref?: React.Ref<ModelViewerElement>;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<ModelViewerElement> & ModelViewerAttributes, ModelViewerElement>;
    }
  }
}
