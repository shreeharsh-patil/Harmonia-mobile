import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StreamQuality } from '@/src/lib/api';

const PREFS_KEY = 'harmonia.mobile.preferences.v1';

type PreferencesContextValue = {
  networkAwareQuality: boolean;
  wifiQuality: StreamQuality;
  cellularQuality: StreamQuality;
  batterySaver: boolean;
  wifiOnlyDownloads: boolean;
  networkType: Network.NetworkStateType | undefined;
  networkConnected: boolean;
  setNetworkAwareQuality: (enabled: boolean) => void;
  setWifiQuality: (quality: StreamQuality) => void;
  setCellularQuality: (quality: StreamQuality) => void;
  setBatterySaver: (enabled: boolean) => void;
  setWifiOnlyDownloads: (enabled: boolean) => void;
  qualityFor: (fallback: StreamQuality) => StreamQuality;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

type StoredPreferences = {
  networkAwareQuality: boolean;
  wifiQuality: StreamQuality;
  cellularQuality: StreamQuality;
  batterySaver: boolean;
  wifiOnlyDownloads: boolean;
};

const DEFAULTS: StoredPreferences = {
  networkAwareQuality: true,
  wifiQuality: 'maximum',
  cellularQuality: 'normal',
  batterySaver: false,
  wifiOnlyDownloads: false,
};

export function PreferencesProvider({ children }: PropsWithChildren) {
  const network = Network.useNetworkState();
  const [networkAwareQuality, setNetworkAwareQualityState] = useState(DEFAULTS.networkAwareQuality);
  const [wifiQuality, setWifiQualityState] = useState<StreamQuality>(DEFAULTS.wifiQuality);
  const [cellularQuality, setCellularQualityState] = useState<StreamQuality>(DEFAULTS.cellularQuality);
  const [batterySaver, setBatterySaverState] = useState(DEFAULTS.batterySaver);
  const [wifiOnlyDownloads, setWifiOnlyDownloadsState] = useState(DEFAULTS.wifiOnlyDownloads);
  const prefsRef = useRef<StoredPreferences>({ ...DEFAULTS });

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const qualities: StreamQuality[] = ['automatic', 'data-saver', 'normal', 'high', 'maximum'];
        const restored: StoredPreferences = {
          networkAwareQuality: parsed?.networkAwareQuality !== false,
          wifiQuality: qualities.includes(parsed?.wifiQuality) ? parsed.wifiQuality : DEFAULTS.wifiQuality,
          cellularQuality: qualities.includes(parsed?.cellularQuality) ? parsed.cellularQuality : DEFAULTS.cellularQuality,
          batterySaver: Boolean(parsed?.batterySaver),
          wifiOnlyDownloads: Boolean(parsed?.wifiOnlyDownloads),
        };
        prefsRef.current = restored;
        setNetworkAwareQualityState(restored.networkAwareQuality);
        setWifiQualityState(restored.wifiQuality);
        setCellularQualityState(restored.cellularQuality);
        setBatterySaverState(restored.batterySaver);
        setWifiOnlyDownloadsState(restored.wifiOnlyDownloads);
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Partial<StoredPreferences>) => {
    // Update a synchronous snapshot first so rapid back-to-back setting
    // changes cannot overwrite each other with stale render-time values.
    const snapshot: StoredPreferences = {
      ...prefsRef.current,
      ...next,
    };
    prefsRef.current = snapshot;
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, []);

  const setNetworkAwareQuality = useCallback((enabled: boolean) => {
    setNetworkAwareQualityState(enabled);
    persist({ networkAwareQuality: enabled });
  }, [persist]);

  const setWifiQuality = useCallback((quality: StreamQuality) => {
    setWifiQualityState(quality);
    persist({ wifiQuality: quality });
  }, [persist]);

  const setCellularQuality = useCallback((quality: StreamQuality) => {
    setCellularQualityState(quality);
    persist({ cellularQuality: quality });
  }, [persist]);

  const setBatterySaver = useCallback((enabled: boolean) => {
    setBatterySaverState(enabled);
    persist({ batterySaver: enabled });
  }, [persist]);

  const setWifiOnlyDownloads = useCallback((enabled: boolean) => {
    setWifiOnlyDownloadsState(enabled);
    persist({ wifiOnlyDownloads: enabled });
  }, [persist]);

  const qualityFor = useCallback((fallback: StreamQuality): StreamQuality => {
    if (batterySaver) return 'data-saver';
    if (!networkAwareQuality) return fallback;

    if (network.type === Network.NetworkStateType.CELLULAR) return cellularQuality;
    if (
      network.type === Network.NetworkStateType.WIFI ||
      network.type === Network.NetworkStateType.ETHERNET
    ) {
      return wifiQuality;
    }

    return fallback;
  }, [batterySaver, cellularQuality, network.type, networkAwareQuality, wifiQuality]);

  const value = useMemo<PreferencesContextValue>(() => ({
    networkAwareQuality,
    wifiQuality,
    cellularQuality,
    batterySaver,
    wifiOnlyDownloads,
    networkType: network.type,
    networkConnected: network.isConnected !== false && network.type !== Network.NetworkStateType.NONE,
    setNetworkAwareQuality,
    setWifiQuality,
    setCellularQuality,
    setBatterySaver,
    setWifiOnlyDownloads,
    qualityFor,
  }), [
    batterySaver,
    cellularQuality,
    network.isConnected,
    network.type,
    networkAwareQuality,
    qualityFor,
    setBatterySaver,
    setCellularQuality,
    setWifiOnlyDownloads,
    setNetworkAwareQuality,
    setWifiQuality,
    wifiOnlyDownloads,
    wifiQuality,
  ]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
