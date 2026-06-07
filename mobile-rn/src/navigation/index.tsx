import React from 'react';
import { Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { FeedScreen } from '../screens/FeedScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { PlaylistDetailScreen } from '../screens/PlaylistDetailScreen';
import { ChannelDrawer } from '../components/ChannelDrawer';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

function MenuButton() {
  const navigation = useNavigation<any>();
  return (
    <Pressable hitSlop={10} onPress={() => navigation.getParent('LeftDrawer')?.dispatch(DrawerActions.openDrawer())} style={{ paddingHorizontal: 14 }}>
      <Ionicons name="menu" size={24} color={colors.ink} />
    </Pressable>
  );
}
function SettingsButton() {
  const navigation = useNavigation<any>();
  return (
    <Pressable hitSlop={10} onPress={() => navigation.navigate('Settings')} style={{ paddingHorizontal: 14 }}>
      <Ionicons name="settings-outline" size={21} color={colors.ink} />
    </Pressable>
  );
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { Videos: 'play', Playlists: 'list', Progress: 'stats-chart' };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg2 },
        headerTitleStyle: { color: colors.ink, fontWeight: '600' },
        headerTintColor: colors.ink,
        headerLeft: () => <MenuButton />,
        headerRight: () => <SettingsButton />,
        tabBarStyle: { backgroundColor: colors.bg2, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name] || 'ellipse'} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Videos" component={FeedScreen} />
      <Tab.Screen name="Playlists" component={PlaylistsScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
    </Tab.Navigator>
  );
}

function MainDrawer() {
  return (
    <Drawer.Navigator
      id="LeftDrawer"
      drawerContent={(props) => <ChannelDrawer {...props} />}
      screenOptions={{ headerShown: false, drawerStyle: { backgroundColor: colors.bg2, width: 290 } }}
    >
      <Drawer.Screen name="Tabs" component={Tabs} />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerStyle: { backgroundColor: colors.bg2 }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="Main" component={MainDrawer} options={{ headerShown: false }} />
      <Stack.Screen name="Player" component={PlayerScreen} options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} options={{ title: 'Playlist' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Account & settings' }} />
    </Stack.Navigator>
  );
}
