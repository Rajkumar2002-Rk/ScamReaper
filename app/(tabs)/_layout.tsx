import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

/*
  We removed the useColorScheme import and dynamic tint logic.
  ScamReaper is dark-only, so we hardcode the active tab color to red
  and the inactive color to a muted gray.
*/

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        /*
          tabBarActiveTintColor: color of the icon + label when that tab is selected.
          tabBarInactiveTintColor: color when tab is NOT selected.
          tabBarStyle: styles applied to the entire bottom bar container.
          headerShown: false means we draw our own header inside each screen.
          tabBarButton: HapticTab adds a subtle haptic vibration when you tap a tab.
        */
        tabBarActiveTintColor: '#ff3b30',
        tabBarInactiveTintColor: '#555',
        tabBarStyle: {
          backgroundColor: '#0f0f0f',  // slightly lighter than screen background
          borderTopColor: '#1f1f1f',   // subtle top border instead of default gray line
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >

      {/* ── Tab 1: Home ─────────────────────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="house.fill" color={color} />
          ),
        }}
      />

      {/* ── Tab 2: Call Log ─────────────────────────────────────── */}
      <Tabs.Screen
        name="call-log"
        options={{
          title: 'Call Log',
          /*
            "phone.fill" is an SF Symbol available on iOS.
            On Android, IconSymbol falls back to the .tsx version which maps
            to a compatible Material icon.
          */
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="phone.fill" color={color} />
          ),
        }}
      />

      {/* ── Tab 3: Settings ─────────────────────────────────────── */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="gearshape.fill" color={color} />
          ),
        }}
      />

    </Tabs>
  );
}
