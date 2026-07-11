import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Place } from '../types';

export type PlanStackParamList = {
  Home: undefined;
  Planner: { origin?: Place; destination?: Place; importedDate?: string } | undefined;
  ImportTrip: undefined;
};

export type RootTabParamList = {
  PlanTab: undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type PlannerScreenProps = NativeStackScreenProps<PlanStackParamList, 'Planner'>;
export type ImportTripScreenProps = NativeStackScreenProps<PlanStackParamList, 'ImportTrip'>;
