import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TripSearch } from '../types';

export type PlanStackParamList = {
  Home: undefined;
  Results: { search: TripSearch };
  TripBuilder: { routeId: string };
  RouteDetail: { routeId: string; fromSaved?: boolean };
  Hotels: undefined;
};

export type RootTabParamList = {
  PlanTab: undefined;
  TripTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<PlanStackParamList, 'Home'>;
export type ResultsScreenProps = NativeStackScreenProps<PlanStackParamList, 'Results'>;
export type TripBuilderScreenProps = NativeStackScreenProps<PlanStackParamList, 'TripBuilder'>;
export type RouteDetailScreenProps = NativeStackScreenProps<PlanStackParamList, 'RouteDetail'>;
export type HotelsScreenProps = NativeStackScreenProps<PlanStackParamList, 'Hotels'>;
