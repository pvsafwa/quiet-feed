import React, { useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore, userActiveChannels } from '../store';
import { colors, radius } from '../theme';
import type { Channel } from '../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ORDERED_LANGUAGES = ['Arabic', 'English', 'Malayalam', 'Urdu'];

export function ChannelDrawer(props: DrawerContentComponentProps) {
  const activeChannels = useStore(useShallow(userActiveChannels));
  const filter = useStore(s => s.filter);
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const setFilter = useStore(s => s.setFilter);

  // Group active channels by language
  const channelsByLang: Record<string, Channel[]> = {};
  activeChannels.forEach(c => {
    const lang = (c.language && c.language.trim()) || 'English';
    if (!channelsByLang[lang]) channelsByLang[lang] = [];
    channelsByLang[lang].push(c);
  });

  const availableLangs = Object.keys(channelsByLang).sort((a, b) => {
    const ia = ORDERED_LANGUAGES.indexOf(a);
    const ib = ORDERED_LANGUAGES.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const hasMultipleLanguages = availableLangs.length > 1;

  // Track collapsed language sections
  const [collapsedLangs, setCollapsedLangs] = useState<Record<string, boolean>>({});

  const toggleLang = (lang: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedLangs(prev => ({ ...prev, [lang]: !prev[lang] }));
  };

  const pick = (id: string) => {
    setFilter(id);
    props.navigation.closeDrawer();
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}>
      <Text style={styles.title}>Channels</Text>

      {/* All Channels option */}
      <Pressable onPress={() => pick('all')} style={[styles.item, filter === 'all' && styles.active]}>
        <View style={styles.allIc}>
          <Ionicons name="reorder-three" size={16} color={filter === 'all' ? colors.onAccent : colors.inkSoft} />
        </View>
        <Text style={[styles.name, filter === 'all' && styles.activeText]}>All channels</Text>
      </Pressable>

      {/* Accordion / Language Grouped Channels */}
      {availableLangs.map(lang => {
        const langChannels = channelsByLang[lang] || [];
        const isCollapsed = !!collapsedLangs[lang];

        return (
          <View key={lang} style={styles.langGroup}>
            {hasMultipleLanguages && (
              <Pressable onPress={() => toggleLang(lang)} style={styles.langHeader}>
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={16}
                  color={colors.inkSoft}
                />
                <Text style={styles.langTitle}>{lang}</Text>
                <View style={styles.langBadge}>
                  <Text style={styles.langBadgeText}>{langChannels.length}</Text>
                </View>
              </Pressable>
            )}

            {!isCollapsed && (
              <View style={hasMultipleLanguages ? styles.langBody : undefined}>
                {langChannels.map(c => {
                  const on = filter === c.id;
                  return (
                    <Pressable key={c.id} onPress={() => pick(c.id)} style={[styles.item, on && styles.active]}>
                      {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: colors.bg3 }]} />}
                      <Text style={[styles.name, on && styles.activeText]} numberOfLines={1}>{c.title}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {activeChannels.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No channels selected.</Text>
          <Pressable onPress={() => props.navigation.navigate('Settings' as never)} style={styles.pickLink}>
            <Text style={styles.pickLinkText}>Choose Channels in Settings</Text>
          </Pressable>
        </View>
      )}

      {isAdmin && (
        <Pressable onPress={() => props.navigation.navigate('Settings' as never)} style={styles.add}>
          <Ionicons name="add" size={18} color={colors.ink} />
          <Text style={styles.addText}>Add channel</Text>
        </Pressable>
      )}
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, paddingHorizontal: 16, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 8, marginVertical: 2, borderRadius: radius.sm },
  active: { backgroundColor: colors.accent },
  activeText: { color: colors.onAccent, fontWeight: '600' },
  allIc: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  av: { width: 30, height: 30, borderRadius: 15 },
  name: { flex: 1, color: colors.inkSoft, fontSize: 14 },
  
  langGroup: { marginTop: 8 },
  langHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    gap: 8,
  },
  langTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  langBadge: { backgroundColor: colors.bg3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  langBadgeText: { color: colors.inkSoft, fontSize: 11, fontWeight: '700' },
  langBody: { paddingLeft: 4, marginTop: 2 },

  emptyWrap: { padding: 18, alignItems: 'center' },
  emptyText: { color: colors.inkFaint, fontSize: 13.5, marginBottom: 8 },
  pickLink: { paddingVertical: 6, paddingHorizontal: 10 },
  pickLinkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },

  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    paddingVertical: 11,
  },
  addText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
});
