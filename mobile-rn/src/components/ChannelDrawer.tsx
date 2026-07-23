import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { colors, radius } from '../theme';

export function ChannelDrawer(props: DrawerContentComponentProps) {
  const channels = useStore(s => s.channels);
  const filter = useStore(s => s.filter);
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const setFilter = useStore(s => s.setFilter);
  const removeChannel = useStore(s => s.removeChannel);

  const pick = (id: string) => { setFilter(id); props.navigation.closeDrawer(); };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 8 }}>
      <Text style={styles.title}>My Tube</Text>

      <Pressable onPress={() => pick('all')} style={[styles.item, filter === 'all' && styles.active]}>
        <View style={styles.allIc}><Ionicons name="reorder-three" size={16} color={filter === 'all' ? colors.onAccent : colors.inkSoft} /></View>
        <Text style={[styles.name, filter === 'all' && styles.activeText]}>All channels</Text>
      </Pressable>

      {channels.map(c => {
        const on = filter === c.id;
        return (
          <Pressable key={c.id} onPress={() => pick(c.id)} style={[styles.item, on && styles.active]}>
            {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: colors.bg3 }]} />}
            <Text style={[styles.name, on && styles.activeText]} numberOfLines={1}>{c.title}</Text>
            {isAdmin && (
              <Pressable hitSlop={8} onPress={() => removeChannel(c.id)} style={styles.rm}>
                <Ionicons name="close" size={15} color={on ? colors.onAccent : colors.inkFaint} />
              </Pressable>
            )}
          </Pressable>
        );
      })}

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
  title: { fontSize: 18, fontWeight: '600', color: colors.ink, paddingHorizontal: 16, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 8, borderRadius: radius.sm },
  active: { backgroundColor: colors.accent },
  activeText: { color: colors.onAccent, fontWeight: '600' },
  allIc: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  av: { width: 30, height: 30, borderRadius: 15 },
  name: { flex: 1, color: colors.inkSoft, fontSize: 14.5 },
  rm: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 14, marginTop: 14,
    borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 11 },
  addText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
});
