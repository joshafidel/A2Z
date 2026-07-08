import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Place } from '../types';

export type PlanStackParamList = {
  Home: undefined;
  Planner: { origin?: Place; destination?: Place } | undefined;
};

export type RootTabParamList = {
  PlanTab: undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type PlannerScreenProps = NativeStackScreenProps<PlanStackParamList, 'Planner'>;
