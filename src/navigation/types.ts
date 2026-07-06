import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type PlanStackParamList = {
  Home: undefined;
  Planner: undefined;
};

export type RootTabParamList = {
  PlanTab: undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type PlannerScreenProps = NativeStackScreenProps<PlanStackParamList, 'Planner'>;
