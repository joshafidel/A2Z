import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TripSearch } from '../types';

export type PlanStackParamList = {
  Home: undefined;
  Results: { search: TripSearch };
  RouteDetail: { routeId: string; fromSaved?: boolean };
};

export type RootTabParamList = {
  PlanTab: undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type ResultsScreenProps = NativeStackScreenProps<PlanStackParamList, 'Results'>;
export type RouteDetailScreenProps = NativeStackScreenProps<PlanStackParamList, 'RouteDetail'>;
