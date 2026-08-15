import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';

// expo-blur is built against React 18 class-component types, incompatible with
// @types/react@19.2.x's stricter JSX constraint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SafeBlurView = BlurView as any;

// NativeTabsProps omits `children` from its public type even though children
// (Trigger elements) are the correct runtime API for iOS 26 liquid-glass tabs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SafeNativeTabs = NativeTabs as any;

// iOS 26 uses NativeTabs (liquid glass, system appearance — no custom tokens).
function NativeTabLayout() {
  return (
    <SafeNativeTabs>
      <SafeNativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </SafeNativeTabs.Trigger>
      <SafeNativeTabs.Trigger name="cards">
        <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
        <Label>Cards</Label>
      </SafeNativeTabs.Trigger>
      <SafeNativeTabs.Trigger name="remittance">
        <Icon sf={{ default: 'paperplane', selected: 'paperplane.fill' }} />
        <Label>Send</Label>
      </SafeNativeTabs.Trigger>
      <SafeNativeTabs.Trigger name="rewards">
        <Icon sf={{ default: 'star', selected: 'star.fill' }} />
        <Label>Rewards</Label>
      </SafeNativeTabs.Trigger>
    </SafeNativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <SafeBlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: 'Cards',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="creditcard" tintColor={color} size={24} />
            ) : (
              <Feather name="credit-card" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="remittance"
        options={{
          title: 'Send',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="paperplane" tintColor={color} size={24} />
            ) : (
              <Feather name="send" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="star" tintColor={color} size={24} />
            ) : (
              <Feather name="star" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
