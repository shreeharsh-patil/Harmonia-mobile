import { EventEmitter, requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { useEffect, useState } from 'react';

export type AudioOutputKind = 'bluetooth' | 'wired' | 'speaker' | 'phone' | 'external';

export type AudioOutputRoute = {
  kind: AudioOutputKind;
  name: string;
};

type AudioRouteNativeModule = {
  getCurrentRoute(): Promise<AudioOutputRoute>;
};

type AudioRouteEvents = {
  onAudioRouteChanged: (route: AudioOutputRoute) => void;
};

const FALLBACK_ROUTE: AudioOutputRoute = {
  kind: Platform.OS === 'ios' ? 'phone' : 'speaker',
  name: Platform.OS === 'ios' ? 'This phone' : 'Phone speaker',
};

// The optional lookup keeps OTA updates safe for an already-installed APK.
// The live native module becomes available only after the accompanying native
// build has been installed; until then the player clearly reports its phone
// speaker fallback rather than crashing or inventing a device name.
const nativeModule = requireOptionalNativeModule<AudioRouteNativeModule>('AudioRouteModule');
const nativeEmitter = nativeModule
  ? new EventEmitter<AudioRouteEvents>(nativeModule as any)
  : null;

async function readAudioRoute() {
  if (!nativeModule) return FALLBACK_ROUTE;
  try {
    const route = await nativeModule.getCurrentRoute();
    if (!route?.kind || !route?.name) return FALLBACK_ROUTE;
    return route;
  } catch {
    return FALLBACK_ROUTE;
  }
}

export function useAudioOutputRoute() {
  const [route, setRoute] = useState<AudioOutputRoute>(FALLBACK_ROUTE);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readAudioRoute().then((nextRoute) => {
        if (active) setRoute(nextRoute);
      });
    };

    refresh();
    const routeSubscription = nativeEmitter?.addListener('onAudioRouteChanged', refresh);
    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      active = false;
      routeSubscription?.remove();
      appSubscription.remove();
    };
  }, []);

  return route;
}
