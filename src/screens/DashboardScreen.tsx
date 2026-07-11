import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { BookingLinks } from '../components/BookingLinks';
import { Card } from '../components/Card';
import { MapPreview } from '../components/MapPreview';
import { ModeIcon } from '../components/ModeIcon';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/States';
import { WarningList } from '../components/WarningList';
import { useTrip } from '../context/TripContext';
import {
  cancelTripReminders,
  notificationsSupported,
  requestNotificationPermission,
  scheduleTripReminders,
  type TripReminder,
} from '../services/notificationService';
import { DataFreshnessBadge } from '../components/DataFreshnessBadge';
import { LivingTimelineView } from '../components/LivingTimelineView';
import { getFlightStatus, notifyFlightUpdate, type FlightStatus } from '../services/flightStatusService';
import { getTsaWaitNow, type TsaWaitNow } from '../services/tsaService';
import { getChangeLog, recordSnapshot, type TripChange } from '../services/tripMonitorService';
import {
  applyCompleted,
  applyOverrides,
  assignStatuses,
  deriveLivingTimeline,
  getTimelineOverrides,
  headlineFor,
  saveTimelineOverrides,
  withChangeTracking,
  type LivingTimelineItem,
  type TimelineOverrides,
} from '../services/timelineService';
import { AdviceCard } from '../components/AdviceCard';
import { DepartureCard } from '../components/DepartureCard';
import { ManualFlightCard } from '../components/ManualFlightCard';
import { TransportCompareCard } from '../components/TransportCompareCard';
import { TripWeatherCard } from '../components/TripWeatherCard';
import type { RootTabParamList } from '../navigation/types';
import type { TripAdvice } from '../services/adviceService';
import { duplicateTrip, removeTripCompletely } from '../services/manualTripService';
import { DEFAULT_PROFILE, getProfile, type TravelerProfile } from '../services/preferencesService';
import { upsertTrip } from '../services/storageService';
import {
  conditionFromExpected,
  getStoredWeatherSnapshot,
} from '../services/weatherService';
import { parseTimeInput } from './CreateTripScreen';
import { confirmAction } from '../utils/confirm';
import type { ExpectedConditions, WeatherCondition } from '../types';
import {
  createApproval,
  decideApproval,
  listApprovals,
  type Approval,
} from '../services/approvalService';
import {
  listNotifications,
  markRead,
  pushNotification,
  unreadCount,
  type AppNotification,
} from '../services/notificationCenterService';
import { deleteDemoTrip, seedDemoTrip } from '../services/demoTripService';
import {
  generatePackingList,
  getStoredPackingList,
  mergeRegenerated,
  storePackingList,
  type PackingList,
} from '../services/packingService';
import { getWeather } from '../services/weatherService';
import { colors, radii, spacing, typography } from '../theme';
import type { SavedTrip, TimelineStep } from '../types';
import { formatCountdown, formatDate, formatDuration, formatMoney, formatTime } from '../utils/time';

/** Trip dashboard: the "during travel" home for the chosen route. */
export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { savedTrips, activeTrip, setActiveTrip, deleteTrip, refreshTrips } = useTrip();

  // Traveler profile drives the departure calculator + transport scoring.
  const [profile, setProfile] = useState<TravelerProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  const isManual = Boolean(activeTrip?.manual);

  const goCreateTrip = (editTripId?: string) =>
    navigation.navigate('PlanTab', { screen: 'CreateTrip', params: editTripId ? { editTripId } : undefined });

  /** After a card saved a new version of the trip: refresh + keep it active. */
  const onTripUpdated = async () => {
    await refreshTrips();
    setChanges(activeTrip ? await getChangeLog(activeTrip.id) : []);
  };

  // Re-render every 30s so the countdown stays fresh.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Trip reminders (walk now / call your Uber / boarding soon).
  const [remindersOn, setRemindersOn] = useState(false);
  const [reminders, setReminders] = useState<TripReminder[]>([]);
  const [reminderError, setReminderError] = useState<string>();

  useEffect(() => {
    // Re-arm when the active trip changes while reminders are on.
    if (remindersOn && activeTrip) {
      setReminders(scheduleTripReminders(activeTrip));
    }
  }, [remindersOn, activeTrip]);

  const toggleReminders = async () => {
    setReminderError(undefined);
    if (remindersOn) {
      if (activeTrip) cancelTripReminders(activeTrip.id);
      setRemindersOn(false);
      setReminders([]);
      return;
    }
    if (!notificationsSupported()) {
      setReminderError('Notifications are not supported in this browser.');
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      setReminderError('Notification permission was denied — enable it in your browser settings.');
      return;
    }
    setRemindersOn(true);
  };

  const nextStep: TimelineStep | undefined = useMemo(() => {
    if (!activeTrip) return undefined;
    return (
      activeTrip.route.timeline.find((s) => new Date(s.time) > now) ??
      activeTrip.route.timeline[activeTrip.route.timeline.length - 1]
    );
  }, [activeTrip, now]);

  // Real-time flight status + TSA line for the active trip's flight leg.
  // Polls every 5 min while the tab is open; notifies on important updates.
  const [flightStatus, setFlightStatus] = useState<FlightStatus>();
  const [tsaNow, setTsaNow] = useState<TsaWaitNow>();
  const flightSeg = activeTrip?.route.segments.find((s) => s.mode === 'flight');
  const flightNo = flightSeg?.vehicleId;
  const airportCode = flightSeg?.from.match(/\(([A-Z]{3})\)/)?.[1];
  useEffect(() => {
    if (!flightNo && !airportCode) return;
    let cancelled = false;
    let lastHeadline: string | undefined;
    const poll = async () => {
      const [status, tsa] = await Promise.all([
        flightNo ? getFlightStatus(flightNo) : undefined,
        airportCode ? getTsaWaitNow(airportCode) : undefined,
      ]);
      if (cancelled) return;
      if (status) {
        setFlightStatus(status);
        if (status.important && status.headline !== lastHeadline) {
          lastHeadline = status.headline;
          notifyFlightUpdate(status); // browser notification, once per change
        }
      }
      if (tsa) setTsaNow(tsa);
      // Meaningful-change detection: compare with the stored snapshot and
      // keep the "What changed" log (thresholds filter out tiny wobbles).
      if (activeTrip && (status || tsa)) {
        const log = await recordSnapshot(activeTrip.id, {
          flightStatus: status?.status,
          flightEstimatedIso: status?.estimatedIso ?? status?.scheduledIso,
          gate: status?.departureGate,
          tsaWaitMinutes: tsa?.waitMinutes,
        });
        if (!cancelled) setChanges(log);
        // In-app notifications, coalesced by topic (one row per subject).
        let latest: AppNotification[] | undefined;
        if (status?.important) {
          latest = await pushNotification({
            id: `flight:${activeTrip.id}`,
            tripId: activeTrip.id,
            title: 'Flight update',
            body: status.headline,
            severity: status.status === 'cancelled' ? 'critical' : 'warning',
            demo: activeTrip.demo,
          });
        }
        if (tsa && tsa.waitMinutes > 25) {
          latest = await pushNotification({
            id: `tsa:${activeTrip.id}`,
            tripId: activeTrip.id,
            title: 'Security line is long',
            body: `${tsa.label}. Leave ~${tsa.waitMinutes - 25} min earlier than planned.`,
            severity: 'warning',
            demo: activeTrip.demo,
          });
        }
        if (latest && !cancelled) setNotifications(latest);
      }
    };
    poll();
    const t = setInterval(poll, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNo, airportCode, activeTrip?.id]);

  // --- What changed (persisted per trip) ------------------------------------
  const [changes, setChanges] = useState<TripChange[]>([]);
  useEffect(() => {
    if (!activeTrip) {
      setChanges([]);
      return;
    }
    getChangeLog(activeTrip.id).then(setChanges);
  }, [activeTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Living timeline (Step 1) + user overrides -----------------------------
  const [living, setLiving] = useState<LivingTimelineItem[]>([]);
  const [overrides, setOverrides] = useState<TimelineOverrides>({ added: [], removed: [], completed: [] });
  const [newTimelineTitle, setNewTimelineTitle] = useState('');
  const [newTimelineTime, setNewTimelineTime] = useState('');
  const [timelineError, setTimelineError] = useState<string>();
  useEffect(() => {
    if (!activeTrip) return;
    getTimelineOverrides(activeTrip.id).then(setOverrides);
  }, [activeTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeTrip) {
      setLiving([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const base = deriveLivingTimeline(activeTrip, {
        flightEstimatedIso: flightStatus?.estimatedIso ?? activeTrip.manual?.flight?.estimatedDepartureAt,
      });
      const withUser = applyOverrides(base, overrides);
      const tracked = await withChangeTracking(activeTrip.id, withUser);
      if (!cancelled) setLiving(applyCompleted(assignStatuses(tracked, now), overrides));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip, flightStatus, now, overrides]);
  const headline = headlineFor(living);

  const updateOverrides = async (next: TimelineOverrides) => {
    if (!activeTrip) return;
    setOverrides(next);
    await saveTimelineOverrides(activeTrip.id, next);
  };
  const toggleItemComplete = (id: string, currentlyCompleted: boolean) =>
    updateOverrides({
      ...overrides,
      completed: currentlyCompleted
        ? overrides.completed.filter((c) => c !== id)
        : [...overrides.completed, id],
    });
  const removeTimelineItem = (id: string) =>
    updateOverrides(
      id.includes(':custom:')
        ? { ...overrides, added: overrides.added.filter((a) => a.id !== id) }
        : { ...overrides, removed: [...overrides.removed, id] },
    );
  const restoreRemovedItems = () => updateOverrides({ ...overrides, removed: [] });
  const addTimelineItem = () => {
    if (!activeTrip) return;
    const mins = parseTimeInput(newTimelineTime);
    if (!newTimelineTitle.trim() || mins === undefined) {
      setTimelineError('Give the item a name and a time like "3:30 PM".');
      return;
    }
    setTimelineError(undefined);
    const d = new Date(activeTrip.route.departureTime);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    updateOverrides({
      ...overrides,
      added: [
        ...overrides.added,
        {
          id: `${activeTrip.id}:custom:${Date.now()}`,
          time: d.toISOString(),
          title: newTimelineTitle.trim(),
        },
      ],
    });
    setNewTimelineTitle('');
    setNewTimelineTime('');
  };

  // --- Weather for advice + packing (stored snapshot or the user's pick) -----
  const [adviceWeather, setAdviceWeather] = useState<WeatherCondition>();
  useEffect(() => {
    if (!activeTrip) {
      setAdviceWeather(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const snap = await getStoredWeatherSnapshot(activeTrip.id);
      if (cancelled) return;
      if (snap) setAdviceWeather(snap.condition);
      else if (activeTrip.manual?.expectedConditions) {
        setAdviceWeather(
          conditionFromExpected(
            activeTrip.manual.expectedConditions,
            activeTrip.search.destination.label ?? activeTrip.search.destination.address,
          ),
        );
      } else setAdviceWeather(undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip]);

  const onPickExpected = async (kind: ExpectedConditions) => {
    if (!activeTrip?.manual) return;
    await upsertTrip({ ...activeTrip, manual: { ...activeTrip.manual, expectedConditions: kind } });
    await refreshTrips();
  };

  // --- Transportation comparison + advice acceptance -------------------------
  const [transportCount, setTransportCount] = useState(0);

  const onAcceptAdvice = async (a: TripAdvice) => {
    if (!activeTrip) return;
    if (a.effect.type === 'packing' && packing) {
      updatePacking({
        ...packing,
        items: [
          ...packing.items,
          {
            id: `user-${Date.now()}`,
            category: 'Recommended',
            name: a.effect.name,
            quantity: 1,
            reason: a.effect.reason,
            essential: false,
            packed: false,
            source: 'user',
          },
        ],
      });
    } else if (a.effect.type === 'timeline') {
      await updateOverrides({
        ...overrides,
        added: [
          ...overrides.added,
          {
            id: `${activeTrip.id}:custom:${Date.now()}`,
            time: a.effect.timeIso,
            title: a.effect.title,
            explanation: a.effect.explanation,
          },
        ],
      });
    }
  };

  // --- Trip management: edit / duplicate / delete ----------------------------
  const onDuplicateTrip = async () => {
    if (!activeTrip) return;
    const copy = await duplicateTrip(activeTrip);
    await refreshTrips();
    if (copy) setActiveTrip(copy);
  };
  const onDeleteActiveTrip = () => {
    if (!activeTrip) return;
    confirmAction(
      'Delete this trip?',
      `"${activeTrip.manual?.name ?? activeTrip.route.title}" and its timeline edits will be removed from this browser. This cannot be undone.`,
      async () => {
        await removeTripCompletely(activeTrip.id);
        await refreshTrips();
      },
    );
  };

  // --- Approvals (Step 3) ----------------------------------------------------
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const loadApprovals = () => listApprovals().then(setApprovals);
  useEffect(() => {
    loadApprovals();
  }, [activeTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, decision: 'approved_handoff' | 'rejected') => {
    const decided = await decideApproval(id, decision);
    if (decided && decision === 'approved_handoff') {
      Linking.openURL(decided.handoffUrl);
    }
    loadApprovals();
  };

  // --- Notification center (Step 4) ------------------------------------------
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  useEffect(() => {
    listNotifications().then(setNotifications);
  }, [activeTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Approval expiring within 24h → one coalesced notification per approval.
  useEffect(() => {
    const soon = approvals.filter(
      (a) =>
        a.status === 'pending' &&
        new Date(a.expiresAt).getTime() - Date.now() < 24 * 60 * 60_000 &&
        new Date(a.expiresAt).getTime() > Date.now(),
    );
    (async () => {
      let latest: AppNotification[] | undefined;
      for (const a of soon) {
        latest = await pushNotification({
          id: `approval-expiring:${a.id}`,
          tripId: a.tripId,
          title: 'Approval expiring soon',
          body: `${a.title} expires ${new Date(a.expiresAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Approve or reject it below.`,
          severity: 'warning',
          demo: a.demo,
        });
      }
      if (latest) setNotifications(latest);
    })();
  }, [approvals]);

  // --- Demo trip (Step 6) ------------------------------------------------------
  const [seedingDemo, setSeedingDemo] = useState(false);
  const onSeedDemo = async () => {
    setSeedingDemo(true);
    await seedDemoTrip();
    await refreshTrips();
    await loadApprovals();
    setNotifications(await listNotifications());
    setSeedingDemo(false);
  };
  const onDeleteDemo = async () => {
    await deleteDemoTrip();
    await refreshTrips();
    await loadApprovals();
    setNotifications(await listNotifications());
  };
  const isDemo = Boolean(activeTrip?.demo);

  // --- Packing list (AI-generated, validated; rules fallback; persisted) ----
  const [packing, setPacking] = useState<PackingList>();
  const [packingBusy, setPackingBusy] = useState(false);
  const [newItem, setNewItem] = useState('');
  useEffect(() => {
    if (!activeTrip) return;
    getStoredPackingList(activeTrip.id).then((l) => setPacking(l));
  }, [activeTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPacking = async (regenerate: boolean) => {
    if (!activeTrip || packingBusy) return;
    setPackingBusy(true);
    const wx = await getWeather(
      activeTrip.search.destination.label ?? activeTrip.search.destination.address,
      activeTrip.search.departureTime,
    );
    const m = activeTrip.manual;
    const nights = m?.endsAt
      ? Math.max(1, Math.round((new Date(m.endsAt).getTime() - new Date(m.startsAt).getTime()) / 86_400_000))
      : 2;
    const fresh = await generatePackingList({
      tripId: activeTrip.id,
      destination: activeTrip.search.destination.label ?? activeTrip.search.destination.address,
      nights,
      travelers: activeTrip.search.travelers,
      purpose: m?.purpose === 'business' ? 'work' : m?.purpose,
      checksBag: activeTrip.search.bags > 0,
      weather: wx.ok ? wx.data : (adviceWeather ?? undefined),
    });
    const next = regenerate && packing ? mergeRegenerated(packing, fresh) : fresh;
    setPacking(next);
    await storePackingList(next);
    setPackingBusy(false);
  };

  const updatePacking = (next: PackingList) => {
    setPacking(next);
    storePackingList(next);
  };

  if (!activeTrip) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <EmptyState
          icon="briefcase-outline"
          title="No trips yet"
          message="Create a trip by hand or plan one from the Plan tab — it will live here with a timeline, packing list, and leave-time advice. Trips are saved only in this browser."
        />
        <View style={styles.demoWrap}>
          <AppButton label="Create a trip" icon="add-circle" onPress={() => goCreateTrip()} />
          <AppButton
            label={seedingDemo ? 'Setting up the demo…' : 'Try a demo trip'}
            icon="flask"
            variant="secondary"
            disabled={seedingDemo}
            onPress={onSeedDemo}
          />
          <Text style={styles.demoHint}>
            The demo seeds a New York → Boston example — every card will be labeled "Demo data" and
            you can delete it any time.
          </Text>
        </View>
      </View>
    );
  }

  const route = activeTrip.route;
  const leaveCountdown = formatCountdown(route.recommendedLeaveTime, now);
  const highWarnings = route.warnings.filter((w) => w.level !== 'low');

  const onReroute = () => {
    Alert.alert(
      'Emergency reroute',
      route.backupPlans.length > 0
        ? `Fastest fallbacks:\n\n${route.backupPlans
            .map((b) => `• ${b.title} — ${b.description}`)
            .join('\n\n')}`
        : 'No backup plans stored for this route. Run a new search from the Plan tab.',
      [{ text: 'Got it' }],
    );
  };

  const onDelete = (trip: SavedTrip) => {
    confirmAction(
      'Remove trip?',
      `${trip.search.origin.label ?? 'Origin'} → ${trip.search.destination.label} will be removed from this browser.`,
      () => deleteTrip(trip.id),
    );
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>My Trip</Text>
        <Pressable
          onPress={() => setShowNotifications((v) => !v)}
          style={styles.bell}
          accessibilityLabel={`Notifications, ${unreadCount(notifications)} unread`}
          accessibilityRole="button"
        >
          <Ionicons name="notifications-outline" size={22} color={colors.ink} />
          {unreadCount(notifications) > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount(notifications)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Notification center (coalesced by topic) */}
      {showNotifications && (
        <Card>
          <SectionHeader
            title="Notifications"
            subtitle={notifications.length === 0 ? 'Nothing yet — updates land here' : 'One row per topic, newest first'}
          />
          {notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => markRead(n.id).then(setNotifications)}
              style={[styles.notifRow, !n.read && styles.notifUnread]}
            >
              <Ionicons
                name={n.severity === 'critical' ? 'alert-circle' : n.severity === 'warning' ? 'warning' : 'information-circle'}
                size={16}
                color={n.severity === 'critical' ? colors.danger : n.severity === 'warning' ? colors.warning : colors.primary}
              />
              <View style={styles.flex}>
                <Text style={styles.notifTitle}>
                  {n.title}
                  {n.updates > 1 ? ` (updated ×${n.updates})` : ''}
                </Text>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifTime}>{formatTime(n.updatedAt)}</Text>
              </View>
              {!n.read && <View style={styles.notifDot} />}
            </Pressable>
          ))}
        </Card>
      )}

      {/* Demo labeling + removal */}
      {isDemo && (
        <Card style={styles.demoCard}>
          <DataFreshnessBadge mode="demo" provider="Seeded example trip" />
          <Text style={styles.demoCardText}>
            This whole trip is demo data so you can explore. Nothing here is a real reservation.
          </Text>
          <View style={styles.demoActions}>
            <AppButton
              label="Copy this demo into my trips"
              icon="copy-outline"
              variant="secondary"
              small
              onPress={onDuplicateTrip}
            />
            <AppButton label="Delete demo trip" icon="trash" variant="ghost" small onPress={onDeleteDemo} />
          </View>
        </Card>
      )}

      {/* What you need to know now */}
      {(headline.current || headline.changed || changes[0]) && (
        <Card style={styles.knowNowCard}>
          <Text style={styles.knowNowLabel}>WHAT YOU NEED TO KNOW NOW</Text>
          {headline.current && (
            <Text style={styles.knowNowMain}>
              {headline.current.status === 'now' ? 'Happening now: ' : 'Up next: '}
              {headline.current.title} · {formatTime(headline.current.time)}
            </Text>
          )}
          {headline.current?.explanation ? (
            <Text style={styles.knowNowSub}>{headline.current.explanation}</Text>
          ) : null}
          {(headline.changed || changes[0]) && (
            <View style={styles.knowNowChange}>
              <Ionicons name="swap-horizontal" size={13} color={colors.warning} />
              <Text style={styles.knowNowChangeText}>
                {headline.changed
                  ? `${headline.changed.title} moved from ${formatTime(headline.changed.previousTime!)} to ${formatTime(headline.changed.time)}.`
                  : changes[0].message}
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* Countdown hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>LEAVE {leaveCountdown === 'now' ? 'NOW' : leaveCountdown.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>
          {activeTrip.search.origin.label ?? 'Home'} → {activeTrip.search.destination.label}
        </Text>
        <Text style={styles.heroMeta}>
          {formatDate(route.departureTime)} · {route.title} · {formatDuration(route.totalDurationMinutes)} ·{' '}
          {formatMoney(route.totalPriceUsd)}
        </Text>

        {nextStep && (
          <View style={styles.nextStep}>
            <ModeIcon mode={nextStep.mode} size={16} />
            <View style={styles.flex}>
              <Text style={styles.nextStepLabel}>NEXT STEP · {formatTime(nextStep.time)}</Text>
              <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
              {nextStep.subtitle ? (
                <Text style={styles.nextStepSubtitle}>{nextStep.subtitle}</Text>
              ) : null}
            </View>
          </View>
        )}
      </View>

      {/* Trip management */}
      <View style={styles.tripActions}>
        {isManual && (
          <AppButton label="Edit trip" icon="create-outline" variant="secondary" small onPress={() => goCreateTrip(activeTrip.id)} />
        )}
        <AppButton label="Duplicate" icon="copy-outline" variant="secondary" small onPress={onDuplicateTrip} />
        <AppButton label="Delete" icon="trash-outline" variant="ghost" small onPress={onDeleteActiveTrip} />
      </View>

      {/* Manual flight status — entered by the user, never claimed live */}
      {isManual && (
        <ManualFlightCard trip={activeTrip} profile={profile} onTripUpdated={onTripUpdated} />
      )}

      {/* Departure calculator with editable assumptions (manual trips) */}
      {isManual && (
        <DepartureCard trip={activeTrip} profile={profile} onTripUpdated={onTripUpdated} />
      )}

      {/* Destination weather: live when Open-Meteo answers, honest fallback otherwise */}
      <TripWeatherCard trip={activeTrip} onPickExpected={isManual ? onPickExpected : undefined} />

      {/* Rule-based recommendations */}
      <AdviceCard
        trip={activeTrip}
        weather={adviceWeather}
        transportOptionCount={transportCount}
        onAccept={onAcceptAdvice}
      />

      {/* Manual transportation comparison */}
      <TransportCompareCard
        tripId={activeTrip.id}
        priority={profile.transportationPriority}
        onCountChange={setTransportCount}
      />

      {/* Real-time flight status — delays, cancellations, gate changes */}
      {flightStatus && (
        <Card
          style={[
            styles.statusCard,
            flightStatus.important ? styles.statusCardAlert : styles.statusCardOk,
          ]}
        >
          <Ionicons
            name={flightStatus.important ? 'warning' : 'checkmark-circle'}
            size={20}
            color={flightStatus.important ? colors.danger : colors.success}
          />
          <View style={styles.flex}>
            <Text style={styles.statusHeadline}>{flightStatus.headline}</Text>
            <Text style={styles.statusMeta}>
              {flightStatus.departureTerminal ? `Terminal ${flightStatus.departureTerminal} · ` : ''}
              {flightStatus.departureGate ? `Gate ${flightStatus.departureGate} · ` : ''}
              re-checked every 5 min
            </Text>
            <DataFreshnessBadge mode="live" provider="aviationstack" lastVerifiedAt={flightStatus.verifiedAt} />
          </View>
        </Card>
      )}

      {/* Real-time TSA line → adjusted leave-by advice */}
      {tsaNow && (
        <Card style={styles.statusCard}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.statusHeadline}>{tsaNow.label}</Text>
            {tsaNow.waitMinutes > 25 && (
              <Text style={styles.statusMeta}>
                Line is longer than the plan budgeted — leave ~{tsaNow.waitMinutes - 25} min earlier.
              </Text>
            )}
            <DataFreshnessBadge mode="live" provider="TSA Wait Times" lastVerifiedAt={new Date().toISOString()} />
          </View>
        </Card>
      )}

      {/* What changed — meaningful comparisons only, persisted per trip */}
      {changes.length > 0 && (
        <Card>
          <SectionHeader title="What changed" subtitle="Only moves big enough to matter" />
          <View style={styles.changeList}>
            {changes.map((c, i) => (
              <View key={`${c.at}-${i}`} style={styles.changeRow}>
                <Ionicons name="swap-horizontal" size={14} color={colors.warning} />
                <View style={styles.flex}>
                  <Text style={styles.changeText}>{c.message}</Text>
                  <Text style={styles.changeTime}>{formatTime(c.at)}</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Packing list — AI-generated (validated) or rules-based, editable */}
      <Card>
        <SectionHeader
          title="Packing list"
          subtitle={
            packing
              ? packing.generatedBy === 'ai'
                ? 'Generated by Claude from your trip + forecast'
                : 'Rules-based suggestions (no AI key configured)'
              : 'Built from your destination, dates, and the forecast'
          }
        />
        {!packing ? (
          <AppButton
            label={packingBusy ? 'Building your list…' : 'Generate packing list'}
            icon="briefcase"
            small
            disabled={packingBusy}
            onPress={() => buildPacking(false)}
          />
        ) : (
          <View style={styles.packingWrap}>
            <Text style={styles.packingSummary}>{packing.summary}</Text>
            {[...packing.weatherWarnings, ...packing.baggageWarnings].map((w) => (
              <Text key={w} style={styles.packingWarning}>
                ⚠ {w}
              </Text>
            ))}
            {packing.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  updatePacking({
                    ...packing,
                    items: packing.items.map((i) =>
                      i.id === item.id ? { ...i, packed: !i.packed } : i,
                    ),
                  })
                }
                style={styles.packingRow}
              >
                <Ionicons
                  name={item.packed ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={item.packed ? colors.success : colors.textMuted}
                />
                <View style={styles.flex}>
                  <Text style={[styles.packingName, item.packed && styles.packingDone]}>
                    {item.quantity > 1 ? `${item.quantity}× ` : ''}
                    {item.name}
                    {item.essential ? ' *' : ''}
                  </Text>
                  <Text style={styles.packingReason}>{item.reason}</Text>
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    updatePacking({
                      ...packing,
                      items: packing.items.filter((i) => i.id !== item.id),
                    });
                  }}
                  accessibilityLabel={`Remove ${item.name}`}
                  style={styles.packingDelete}
                >
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ))}
            <View style={styles.packingAddRow}>
              <TextInput
                style={styles.packingInput}
                placeholder="Add your own item…"
                placeholderTextColor={colors.textMuted}
                value={newItem}
                onChangeText={setNewItem}
                onSubmitEditing={() => {
                  if (!newItem.trim()) return;
                  updatePacking({
                    ...packing,
                    items: [
                      ...packing.items,
                      {
                        id: `user-${Date.now()}`,
                        category: 'Your items',
                        name: newItem.trim(),
                        quantity: 1,
                        reason: 'Added by you',
                        essential: false,
                        packed: false,
                        source: 'user',
                      },
                    ],
                  });
                  setNewItem('');
                }}
              />
              <AppButton
                label={packingBusy ? '…' : 'Regenerate'}
                variant="ghost"
                small
                disabled={packingBusy}
                onPress={() => buildPacking(true)}
              />
            </View>
          </View>
        )}
      </Card>

      {highWarnings.length > 0 && <WarningList warnings={highWarnings} />}

      {!isManual && <MapPreview route={route} />}

      <Card>
        <SectionHeader
          title="Living timeline"
          subtitle={`Everything from packing to ${activeTrip.hotel ? 'hotel check-in' : 'arrival'} — updates as things change`}
        />
        {isDemo && <DataFreshnessBadge mode="demo" provider="Seeded example trip" />}
        <LivingTimelineView
          items={living}
          onToggleComplete={toggleItemComplete}
          onRemove={removeTimelineItem}
        />
        {overrides.removed.length > 0 && (
          <Pressable onPress={restoreRemovedItems} style={styles.restoreRow} accessibilityRole="button">
            <Ionicons name="refresh" size={13} color={colors.primary} />
            <Text style={styles.restoreText}>
              Restore {overrides.removed.length} hidden item{overrides.removed.length === 1 ? '' : 's'}
            </Text>
          </Pressable>
        )}
        <View style={styles.timelineAddRow}>
          <TextInput
            style={[styles.packingInput, styles.flex]}
            placeholder="Add your own item…"
            placeholderTextColor={colors.textMuted}
            value={newTimelineTitle}
            onChangeText={setNewTimelineTitle}
            accessibilityLabel="New timeline item name"
          />
          <TextInput
            style={[styles.packingInput, styles.timelineTimeInput]}
            placeholder="3:30 PM"
            placeholderTextColor={colors.textMuted}
            value={newTimelineTime}
            onChangeText={setNewTimelineTime}
            accessibilityLabel="New timeline item time"
          />
          <AppButton label="Add" small variant="secondary" onPress={addTimelineItem} />
        </View>
        {timelineError ? <Text style={styles.timelineErrorText}>{timelineError}</Text> : null}
      </Card>

      {/* Approvals: money actions wait for you — approving opens the provider */}
      {approvals.length > 0 && (
        <Card>
          <SectionHeader
            title="Approvals"
            subtitle="A2Z never buys anything — approving opens the provider to finish there"
          />
          {approvals.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.approvalRow}>
              <View style={styles.flex}>
                <Text style={styles.approvalTitle}>
                  {a.title}
                  {a.demo ? '  ·  Demo data' : ''}
                </Text>
                <Text style={styles.approvalMeta}>
                  {a.provider} · {a.amountLabel}
                  {a.status === 'pending'
                    ? ` · expires ${new Date(a.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                    : ''}
                </Text>
                {a.status === 'pending' ? (
                  <View style={styles.approvalActions}>
                    <AppButton
                      label={`Approve — finish on ${a.provider}`}
                      icon="open-outline"
                      small
                      onPress={() => decide(a.id, 'approved_handoff')}
                    />
                    <AppButton
                      label="Reject"
                      variant="ghost"
                      small
                      onPress={() => decide(a.id, 'rejected')}
                    />
                  </View>
                ) : (
                  <Text style={styles.approvalStatus}>
                    {a.status === 'approved_handoff'
                      ? `Handed off to ${a.provider} — complete the purchase there. Not a confirmed booking.`
                      : a.status === 'rejected'
                        ? 'Rejected'
                        : 'Expired'}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Chosen stay */}
      {activeTrip.hotel && (
        <Card>
          <SectionHeader title="Your stay" subtitle={activeTrip.hotel.distanceLabel} />
          <View style={styles.hotelRow}>
            <View style={styles.flex}>
              <Text style={styles.hotelName}>{activeTrip.hotel.name}</Text>
              <Text style={styles.hotelMeta}>
                {activeTrip.hotel.area} · ★ {activeTrip.hotel.rating.toFixed(1)} · $
                {activeTrip.hotel.pricePerNightUsd}/night
              </Text>
            </View>
            <AppButton
              label="Continue on Booking.com"
              icon="bed"
              variant="secondary"
              small
              onPress={() => {
                const h = activeTrip.hotel!;
                createApproval({
                  tripId: activeTrip.id,
                  provider: 'Booking.com',
                  title: `${h.name} · $${h.pricePerNightUsd}/night`,
                  description: 'Handed off to Booking.com — finish the reservation there.',
                  amountLabel: `$${h.pricePerNightUsd} per night (estimate)`,
                  amountIsEstimate: true,
                  handoffUrl: h.bookingUrl,
                  expiresAt: activeTrip.route.departureTime,
                  status: 'approved_handoff',
                  demo: activeTrip.demo,
                }).then(loadApprovals);
                Linking.openURL(h.bookingUrl);
              }}
            />
          </View>
        </Card>
      )}

      {/* Manual lodging details */}
      {activeTrip.manual?.lodging && (
        <Card>
          <SectionHeader title="Your stay" subtitle="Entered by you" />
          <Text style={styles.hotelName}>{activeTrip.manual.lodging.propertyName}</Text>
          {activeTrip.manual.lodging.address ? (
            <Text style={styles.hotelMeta}>{activeTrip.manual.lodging.address}</Text>
          ) : null}
          <Text style={styles.hotelMeta}>
            {activeTrip.manual.lodging.checkInAt
              ? `Check-in ${formatDate(activeTrip.manual.lodging.checkInAt)} ${formatTime(activeTrip.manual.lodging.checkInAt)}`
              : ''}
            {activeTrip.manual.lodging.checkOutAt
              ? ` · Check-out ${formatDate(activeTrip.manual.lodging.checkOutAt)}`
              : ''}
          </Text>
          {activeTrip.manual.lodging.bookingUrl && (
            <AppButton
              label="Open booking page"
              icon="open-outline"
              variant="secondary"
              small
              onPress={() => Linking.openURL(activeTrip.manual!.lodging!.bookingUrl!)}
            />
          )}
        </Card>
      )}

      {/* Manual notes */}
      {activeTrip.manual?.notes && (
        <Card>
          <SectionHeader title="Your notes" subtitle="Saved as-is — nothing is extracted or verified" />
          <Text style={styles.notesText}>{activeTrip.manual.notes}</Text>
        </Card>
      )}

      {/* Trip reminders */}
      <Card>
        <View style={styles.reminderHeader}>
          <View style={styles.flex}>
            <Text style={styles.reminderTitle}>Trip reminders</Text>
            <Text style={styles.reminderSubtitle}>
              Alerts for when to start walking, call your ride, and board — each with a stated
              grace period.
            </Text>
          </View>
          <AppButton
            label={remindersOn ? 'On' : 'Turn on'}
            icon={remindersOn ? 'notifications' : 'notifications-outline'}
            variant={remindersOn ? 'primary' : 'secondary'}
            small
            onPress={toggleReminders}
          />
        </View>
        {reminderError ? <Text style={styles.reminderError}>{reminderError}</Text> : null}
        {remindersOn && reminders.length === 0 && (
          <Text style={styles.reminderEmpty}>
            All of this trip's steps are in the past — reminders will arm for your next trip.
          </Text>
        )}
        {remindersOn &&
          reminders.slice(0, 4).map((r) => (
            <View key={r.id} style={styles.reminderRow}>
              <ModeIcon mode={r.mode} size={13} />
              <View style={styles.flex}>
                <Text style={styles.reminderRowTitle}>
                  {formatTime(r.fireAt)} — {r.title}
                </Text>
                <Text style={styles.reminderRowMeta}>
                  step due {formatTime(r.stepTime)} · {r.graceMinutes} min grace period
                </Text>
              </View>
            </View>
          ))}
      </Card>

      {route.bookingLinks.length > 0 && (
        <Card>
          <SectionHeader title="Tickets & apps" />
          <BookingLinks links={route.bookingLinks} />
        </Card>
      )}

      {route.backupPlans.length > 0 && (
        <Card>
          <SectionHeader title="Backup options" subtitle="Ready if something slips" />
          <View style={styles.backupStack}>
            {route.backupPlans.map((b) => (
              <View key={b.id} style={styles.backupRow}>
                <ModeIcon mode={b.mode} size={14} />
                <View style={styles.flex}>
                  <Text style={styles.backupTitle}>{b.title}</Text>
                  <Text style={styles.backupDesc}>{b.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}

      {!isManual && (
        <AppButton label="Emergency reroute" icon="alert-circle" variant="danger" onPress={onReroute} />
      )}

      <Text style={styles.storageNotice}>
        Trips are saved only in this browser on this device. Back them up any time with Settings →
        Export data.
      </Text>

      <AppButton
        label="Create another trip"
        icon="add-circle-outline"
        variant="secondary"
        onPress={() => goCreateTrip()}
      />

      {/* Other saved trips */}
      {savedTrips.length > 1 && (
        <View style={styles.savedSection}>
          <SectionHeader title="Saved trips" subtitle="Tap to make active · long-press to remove" />
          {savedTrips.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setActiveTrip(t)}
              onLongPress={() => onDelete(t)}
              style={({ pressed }) => [
                styles.savedRow,
                t.id === activeTrip.id && styles.savedRowActive,
                pressed && styles.pressed,
              ]}
            >
              <ModeIcon mode={t.route.primaryMode} size={15} />
              <View style={styles.flex}>
                <Text style={styles.savedTitle}>
                  {t.search.origin.label ?? 'Origin'} → {t.search.destination.label}
                </Text>
                <Text style={styles.savedMeta}>
                  {formatDate(t.route.departureTime)} · {t.route.title} ·{' '}
                  {formatMoney(t.route.totalPriceUsd)}
                </Text>
              </View>
              {t.id === activeTrip.id && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  screenTitle: { ...typography.hero, color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  notifRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-start',
  },
  notifUnread: { backgroundColor: colors.primarySoft, borderRadius: radii.md, paddingHorizontal: 6 },
  notifTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  notifBody: { fontSize: 12, color: colors.textSecondary, lineHeight: 16, marginTop: 1 },
  notifTime: { fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  demoWrap: { padding: spacing.xl, gap: spacing.sm },
  demoActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tripActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  restoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm, minHeight: 32 },
  restoreText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  timelineAddRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  timelineTimeInput: { width: 86 },
  timelineErrorText: { fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 4 },
  notesText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  storageNotice: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  demoHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17 },
  demoCard: { gap: spacing.sm, borderColor: colors.warning, borderWidth: 1 },
  demoCardText: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  knowNowCard: { gap: 6, borderColor: colors.primary, borderWidth: 1.5 },
  knowNowLabel: { fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8, color: colors.primary },
  knowNowMain: { fontSize: 15, fontWeight: '800', color: colors.ink, lineHeight: 21 },
  knowNowSub: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  knowNowChange: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  knowNowChangeText: { flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 17, fontWeight: '600' },
  approvalRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
  },
  approvalTitle: { fontSize: 13.5, fontWeight: '700', color: colors.ink, lineHeight: 18 },
  approvalMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  approvalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  approvalStatus: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusCardAlert: { borderColor: colors.danger, borderWidth: 1.5 },
  statusCardOk: { borderColor: colors.success, borderWidth: 1 },
  statusHeadline: { fontSize: 14, fontWeight: '800', color: colors.ink },
  statusMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 4 },
  changeList: { gap: spacing.md },
  changeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  changeText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  changeTime: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  packingWrap: { gap: spacing.sm },
  packingSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  packingWarning: { fontSize: 12, color: colors.warning, fontWeight: '600', lineHeight: 16 },
  packingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  packingName: { fontSize: 14, fontWeight: '600', color: colors.text },
  packingDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  packingReason: { fontSize: 11.5, color: colors.textMuted },
  packingDelete: { padding: 6 },
  packingAddRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  packingInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  heroCard: {
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroLabel: {
    color: '#8FA4FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroTitle: { ...typography.title, color: colors.textOnDark },
  heroMeta: { fontSize: 13, color: colors.textOnDarkMuted, lineHeight: 18 },
  nextStep: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  nextStepLabel: { fontSize: 10, fontWeight: '800', color: '#8FA4FF', letterSpacing: 0.8 },
  nextStepTitle: { fontSize: 15, fontWeight: '700', color: colors.textOnDark, marginTop: 2 },
  nextStepSubtitle: { fontSize: 12, color: colors.textOnDarkMuted, marginTop: 2 },
  backupStack: { gap: spacing.md },
  backupRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  backupTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  backupDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  hotelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hotelName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hotelMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reminderTitle: { ...typography.heading, color: colors.ink },
  reminderSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  reminderError: { fontSize: 12, fontWeight: '600', color: colors.danger, marginTop: spacing.sm },
  reminderEmpty: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reminderRowTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  reminderRowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  savedSection: { gap: spacing.sm },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  savedRowActive: { borderColor: colors.primary, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  savedTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  savedMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
