import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { colors, radius } from '../theme';
import ExpoPip from '../../modules/expo-pip';

type DownloadState = 'idle' | 'downloading' | 'ready' | 'error';

export function UpdateModal() {
  const open = useStore(s => s.updateModalOpen);
  const release = useStore(s => s.updateRelease);
  const dismiss = useStore(s => s.dismissUpdateModal);
  const snooze = useStore(s => s.snoozeAppUpdate);

  const [state, setState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset state when modal closes
      setState('idle');
      setProgress(0);
      setDownloadedBytes(0);
      setTotalBytes(0);
      setErrorMsg(null);
    }
  }, [open]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onDownloadProgress', (data: any) => {
      if (typeof data?.progress === 'number') {
        setProgress(data.progress);
      }
      if (typeof data?.bytesDownloaded === 'number') {
        setDownloadedBytes(data.bytesDownloaded);
      }
      if (typeof data?.totalBytes === 'number') {
        setTotalBytes(data.totalBytes);
      }
    });

    return () => sub.remove();
  }, []);

  if (!open || !release) return null;

  const startDownload = async () => {
    setState('downloading');
    setProgress(0);
    setErrorMsg(null);

    try {
      const localPath = await ExpoPip.downloadApk(release.apkUrl, release.fileName);
      setDownloadedPath(localPath);
      setState('ready');
      // Automatically prompt the system package installer once download is complete
      ExpoPip.installApk(localPath);
    } catch (e: any) {
      console.error('[UpdateModal] Download failed:', e);
      setErrorMsg(e?.message || 'Download failed. Please check your connection and try again.');
      setState('error');
    }
  };

  const handleInstall = () => {
    if (downloadedPath) {
      ExpoPip.installApk(downloadedPath);
    } else {
      startDownload();
    }
  };

  const mbText = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={state === 'ready' ? 'checkmark-circle' : state === 'error' ? 'alert-circle' : 'cloud-download-outline'}
                size={28}
                color={state === 'error' ? colors.danger : colors.accent}
              />
            </View>
            <View style={styles.headerTextCont}>
              <Text style={styles.title}>
                {state === 'ready' ? 'Ready to Install' : state === 'downloading' ? 'Downloading Update' : 'Update Available'}
              </Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>v{release.version}</Text>
                <Text style={styles.subText}>Quiet Feed</Text>
              </View>
            </View>
          </View>

          {/* Body Content by State */}
          {state === 'idle' && (
            <>
              <Text style={styles.sectionTitle}>What's New:</Text>
              <ScrollView style={styles.notesScroll} contentContainerStyle={{ paddingVertical: 4 }}>
                <Text style={styles.notesText}>{release.releaseNotes || 'Bug fixes and performance improvements.'}</Text>
              </ScrollView>

              <View style={styles.actions}>
                <Pressable style={styles.btnSecondary} onPress={() => snooze()}>
                  <Text style={styles.btnSecondaryText}>Later (24h)</Text>
                </Pressable>
                <Pressable style={styles.btnPrimary} onPress={startDownload}>
                  <Text style={styles.btnPrimaryText}>Update Now</Text>
                </Pressable>
              </View>
            </>
          )}

          {state === 'downloading' && (
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressPercent}>{progress}%</Text>
                {totalBytes > 0 && (
                  <Text style={styles.progressBytes}>
                    {mbText(downloadedBytes)} MB / {mbText(totalBytes)} MB
                  </Text>
                )}
              </View>
              <Text style={styles.downloadHint}>Please wait while the update is downloading…</Text>
            </View>
          )}

          {state === 'ready' && (
            <View style={styles.readySection}>
              <Text style={styles.readyText}>
                The update has been downloaded. If the installer didn’t open automatically, tap Install below.
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.btnSecondary} onPress={dismiss}>
                  <Text style={styles.btnSecondaryText}>Close</Text>
                </Pressable>
                <Pressable style={styles.btnPrimary} onPress={handleInstall}>
                  <Text style={styles.btnPrimaryText}>Install Update</Text>
                </Pressable>
              </View>
            </View>
          )}

          {state === 'error' && (
            <View style={styles.errorSection}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.btnSecondary} onPress={dismiss}>
                  <Text style={styles.btnSecondaryText}>Dismiss</Text>
                </Pressable>
                <Pressable style={styles.btnPrimary} onPress={startDownload}>
                  <Text style={styles.btnPrimaryText}>Retry</Text>
                </Pressable>
              </View>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bg2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line2,
    padding: 22,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerTextCont: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  badge: {
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  subText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  notesScroll: {
    maxHeight: 140,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 20,
  },
  notesText: {
    color: colors.ink,
    fontSize: 13.5,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnSecondary: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  progressSection: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.bg3,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressPercent: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  progressBytes: {
    color: colors.inkSoft,
    fontSize: 12.5,
  },
  downloadHint: {
    color: colors.inkFaint,
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  readySection: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  readyText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  errorSection: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 16,
  },
});
