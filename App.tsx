import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TripProvider } from './src/context/TripContext';
import type { PlanStackParamList, RootTabParamList } from './src/navigation/types';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlannerScreen } from './src/screens/PlannerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<PlanStackParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();

function PlanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '700', color: colors.ink },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Planner" component={PlannerScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Phone-width column on large screens — the app never spans a
          full desktop window. */}
      <View style={styles.desktopBackdrop}>
        <View style={styles.appColumn}>
          <TripProvider>
            <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <Tabs.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                height: 84,
                paddingTop: 8,
              },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
              tabBarIcon: ({ color, size }) => {
                const icons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
                  PlanTab: 'search',
                  TripTab: 'briefcase',
                  SettingsTab: 'settings-outline',
                };
                return <Ionicons name={icons[route.name]} size={size} color={color} />;
              },
            })}
          >
            <Tabs.Screen name="PlanTab" component={PlanStack} options={{ title: 'Plan' }} />
            <Tabs.Screen name="TripTab" component={DashboardScreen} options={{ title: 'My Trip' }} />
            <Tabs.Screen name="SettingsTab" component={SettingsScreen} options={{ title: 'Settings' }} />
              </Tabs.Navigator>
            </NavigationContainer>
          </TripProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  desktopBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#D9DDEA',
  },
  appColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.background,
    // Soft edges where the column meets the backdrop on wide screens.
    shadowColor: '#101A3D',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
});
