import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Place } from '../types';

export type PlanStackParamList = {
  Home: undefined;
  Planner: { origin?: Place; destination?: Place; importedDate?: string } | undefined;
  ImportTrip: undefined;
  CreateTrip: { editTripId?: string } | undefined;
};

export type RootTabParamList = {
  PlanTab: NavigatorScreenParams<PlanStackParamList> | undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type PlannerScreenProps = NativeStackScreenProps<PlanStackParamList, 'Planner'>;
export type ImportTripScreenProps = NativeStackScreenProps<PlanStackParamList, 'ImportTrip'>;
export type CreateTripScreenProps = NativeStackScreenProps<PlanStackParamList, 'CreateTrip'>;
