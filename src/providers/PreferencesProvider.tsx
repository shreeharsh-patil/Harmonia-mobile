import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { StreamQuality } from '@/src/lib/api';

const PREFS_KEY = 'harmonia.mobile.preferences.v1';

type PreferencesContextValue = {
  networkAwareQuality: boolean;
  wifiQuality: StreamQuality;
  cellularQuality: StreamQuality;
  batterySaver: boolean;
  networkType: Network.NetworkStateType | undefined;
  networkConnected: boolean;
  setNetworkAwareQuality: (enabled: boolean) => void;
  setWifiQuality: (quality: StreamQuality) => void;
  setCellularQuality: (quality: StreamQuality) => void;
  setBatterySaver: (enabled: boolean) => void;
  qualityFor: (fallback: StreamQuality) => StreamQuality;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

type StoredPreferences = {
  networkAwareQuality: boolean;
  wifiQuality: StreamQuality;
  cellularQuality: StreamQuality;
  batterySaver: boolean;
};

const DEFAULTS: StoredPreferences = {
  networkAwareQuality: true,
  wifiQuality: 'maximum',
  cellularQuality: 'normal',
  batterySaver: false,
};

export function PreferencesProvider({ children }: PropsWithChildren) {
  const network = Network.useNetworkState();
  const [networkAwareQuality, setNetworkAwareQualityState] = useState(DEFAULTS.networkAwareQuality);
  const [wifiQuality, setWifiQualityState] = useState<StreamQuality>(DEFAULTS.wifiQuality);
  const [cellularQuality, setCellularQualityState] = useState<StreamQuality>(DEFAULTS.cellularQuality);
  const [batterySaver, setBatterySaverState] = useState(DEFAULTS.batterySaver);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const qualities: StreamQuality[] = ['automatic', 'data-saver', 'normal', 'high', 'maximum'];
        setNetworkAwareQualityState(parsed?.networkAwareQuality !== false);
        setWifiQualityState(qualities.includes(parsed?.wifiQuality) ? parsed.wifiQuality : DEFAULTS.wifiQuality);
        setCellularQualityState(qualities.includes(parsed?.cellularQuality) ? parsed.cellularQuality : DEFAULTS.cellularQuality);
        setBatterySaverState(Boolean(parsed?.batterySaver));
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Partial<StoredPreferences>) => {
    const snapshot = {
      networkAwareQuality,
      wifiQuality,
      cellularQuality,
      batterySaver,
      ...next,
    };
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, [batterySaver, cellularQuality, networkAwareQuality, wifiQuality]);

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
    networkType: network.type,
    networkConnected: network.isConnected !== false && network.type !== Network.NetworkStateType.NONE,
    setNetworkAwareQuality,
    setWifiQuality,
    setCellularQuality,
    setBatterySaver,
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
    setNetworkAwareQuality,
    setWifiQuality,
    wifiQuality,
  ]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
