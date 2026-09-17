import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type Props = {
  progress: number;
  playing: boolean;
  color: string;
  style?: StyleProp<ViewStyle>;
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * Keeps the visual progress moving on the native compositor between the
 * deliberately low-frequency audio status updates. This follows the screen's
 * own vsync (60/90/120 Hz) and never asks JavaScript to render every frame.
 */
export function PlaybackProgressFill({ progress, playing, color, style }: Props) {
  const value = useRef(new Animated.Value(clampProgress(progress))).current;
  const previousTarget = useRef(clampProgress(progress));
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const target = clampProgress(progress);
    const jumped = Math.abs(target - previousTarget.current) > 0.03;
    previousTarget.current = target;

    animation.current?.stop();
    animation.current = Animated.timing(value, {
      toValue: target,
      // A seek, track change, or pause must be reflected immediately. During
      // normal playback the native driver fills the gap to the next 500 ms
      // status update without a JS-frame loop.
      duration: playing && !jumped ? 560 : 0,
      useNativeDriver: true,
    });
    animation.current.start();

    return () => animation.current?.stop();
  }, [playing, progress, value]);

  return (
    <View pointerEvents="none" style={[styles.track, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            transformOrigin: 'left center',
            transform: [{ scaleX: value }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
