import { useEffect } from 'react';
import * as Updates from 'expo-updates';

const UPDATE_CHECK_DELAY_MS = 1500;

/**
 * Checks for a compatible EAS Update shortly after app startup.
 *
 * Development builds and binaries that have not been configured with an
 * updates URL safely no-op because Updates.isEnabled is false.
 */
export function useOtaUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    let cancelled = false;

    const checkAndApplyUpdate = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();

        if (cancelled || !result.isAvailable) {
          return;
        }

        await Updates.fetchUpdateAsync();

        if (!cancelled) {
          await Updates.reloadAsync();
        }
      } catch (error) {
        // OTA availability must never block Harmonia from opening or playing music.
        if (!cancelled) {
          console.warn('[OTA] Update check failed', error);
        }
      }
    };

    const timer = setTimeout(() => {
      void checkAndApplyUpdate();
    }, UPDATE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
}
