import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { colors, radius } from '../theme';

// Global toast + error banner, mirroring the web app's transient messages.
export function Toast() {
  const toast = useStore(s => s.toastMsg);
  const banner = useStore(s => s.banner);
  const hideError = useStore(s => s.hideError);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(), toast.err ? 4200 : 2400);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  return (
    <>
      {banner && (
        <Text onPress={hideError} style={[styles.banner, { top: insets.top + 8 }]}>{banner}  (tap to dismiss)</Text>
      )}
      {toast && (
        <Animated.View style={[styles.toast, { opacity, bottom: insets.bottom + 70 }, toast.err && styles.toastErr]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', left: 12, right: 12, zIndex: 100, color: colors.ink, fontSize: 13, lineHeight: 19,
    backgroundColor: 'rgba(217,122,90,0.16)', borderColor: 'rgba(217,122,90,0.45)', borderWidth: 1,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14,
  },
  toast: {
    position: 'absolute', alignSelf: 'center', zIndex: 100, maxWidth: '90%',
    backgroundColor: colors.bg3, borderColor: colors.line2, borderWidth: 1, borderRadius: radius.md,
    paddingVertical: 11, paddingHorizontal: 18,
  },
  toastErr: { borderColor: 'rgba(217,122,90,0.5)' },
  toastText: { color: colors.ink, fontSize: 13.5, fontWeight: '500' },
});
