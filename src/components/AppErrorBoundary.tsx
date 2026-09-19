import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * A last-resort UI guard. A render error should never look like a completely
 * blank app, especially after Android restores an activity from background.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[harmonia:render-recovery]', error.message, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Harmonia needs a quick refresh</Text>
        <Text style={styles.body}>
          Your music and downloads are safe. Tap below to restore this screen.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading Harmonia" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.background },
  title: { color: colors.textStrong, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 300 },
  button: { marginTop: 22, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, backgroundColor: colors.accent },
  buttonText: { color: '#061108', fontSize: 14, fontWeight: '800' },
});
