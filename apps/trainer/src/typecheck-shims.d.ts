interface Window {
  webkitAudioContext?: typeof AudioContext;
  app?: unknown;
}

interface Document {
  webkitFullscreenElement?: Element | null;
}

interface HTMLElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
}

interface ScreenOrientation {
  lock?: (orientation: OrientationLockType) => Promise<void>;
}
