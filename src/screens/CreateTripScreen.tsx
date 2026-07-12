import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { CalendarPicker } from '../components/CalendarPicker';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import type { CreateTripScreenProps } from '../navigation/types';
import { createManualTrip, updateManualTrip, validateManualTrip } from '../services/manualTripService';
import { getProfile, type TravelerProfile, DEFAULT_PROFILE } from '../services/preferencesService';
import { colors, radii, spacing, typography } from '../theme';
import {
  MANUAL_PURPOSE_LABELS,
  type ManualTripDetails,
  type ManualTripPurpose,
} from '../types';

/** Parse "6:05 PM" or "18:05" → minutes since midnight; undefined if invalid. */
export function parseTimeInput(s: string): number | undefined {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm|AM|PM|Am|Pm)?$/);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59) return undefined;
  const suffix = m[3]?.toLowerCase();
  if (suffix) {
    if (h < 1 || h > 12) return undefined;
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return undefined;
  }
  return h * 60 + min;
}

function atTime(date: Date, minutes: number): string {
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.toISOString();
}

const fmtDay = (d?: Date) =>
  d ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a date';

/**
 * Create / edit a trip by hand. Every field here is user-provided — the
 * app never pretends to have pulled a reservation from anywhere.
 */
export function CreateTripScreen({ navigation, route }: CreateTripScreenProps) {
  const insets = useSafeAreaInsets();
  const { savedTrips, refreshTrips, setActiveTrip } = useTrip();
  const editing = route.params?.editTripId
    ? savedTrips.find((t) => t.id === route.params?.editTripId)
    : undefined;
  const m = editing?.manual;

  const [profile, setProfile] = useState<TravelerProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (!m) {
        // New trips start from the welcome-questions profile.
        setPrecheck(p.hasTsaPrecheck);
        setClear(p.hasClear);
        setBag(p.usuallyChecksBag);
        if (p.homeCity) setOriginCity((v) => (v === '' ? p.homeCity! : v));
        if (p.homeAirportCode) setOriginCode((v) => (v === '' ? p.homeAirportCode! : v));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Form state (prefilled when editing) ---------------------------------
  const [name, setName] = useState(m?.name ?? '');
  const [purpose, setPurpose] = useState<ManualTripPurpose>(m?.purpose ?? 'vacation');
  const [originCity, setOriginCity] = useState(m?.originCity ?? '');
  const [originCode, setOriginCode] = useState(m?.originAirportCode ?? '');
  const [destCity, setDestCity] = useState(m?.destinationCity ?? '');
  const [destCode, setDestCode] = useState(m?.destinationAirportCode ?? '');
  const [depDate, setDepDate] = useState<Date | undefined>(
    m ? new Date(m.startsAt) : undefined,
  );
  const [depTime, setDepTime] = useState(
    m
      ? new Date(m.flight?.scheduledDepartureAt ?? m.startsAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '9:00 AM',
  );
  const [endDate, setEndDate] = useState<Date | undefined>(m?.endsAt ? new Date(m.endsAt) : undefined);
  const [showDepCal, setShowDepCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);
  const [international, setInternational] = useState(m?.isInternational ?? false);
  const [bag, setBag] = useState(m?.checkedBag ?? false);
  const [precheck, setPrecheck] = useState(m?.hasTsaPrecheck ?? false);
  const [clear, setClear] = useState(m?.hasClear ?? false);
  const [startLoc, setStartLoc] = useState(m?.departure.startingLocation ?? '');
  const [travelMin, setTravelMin] = useState(
    m ? String(m.departure.estimatedTravelMinutes) : '',
  );
  const [bufferMin, setBufferMin] = useState(
    m?.departure.airportBufferMinutes !== undefined ? String(m.departure.airportBufferMinutes) : '',
  );
  // Optional details
  const [airline, setAirline] = useState(m?.flight?.airlineName ?? '');
  const [flightNo, setFlightNo] = useState(m?.flight?.flightNumber ?? '');
  const [returnTime, setReturnTime] = useState(
    m?.returnFlight ? new Date(m.returnFlight.scheduledDepartureAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
  );
  const [returnAirline, setReturnAirline] = useState(m?.returnFlight?.airlineName ?? '');
  const [returnFlightNo, setReturnFlightNo] = useState(m?.returnFlight?.flightNumber ?? '');
  const [hotelName, setHotelName] = useState(m?.lodging?.propertyName ?? '');
  const [hotelAddress, setHotelAddress] = useState(m?.lodging?.address ?? '');
  const [hotelUrl, setHotelUrl] = useState(m?.lodging?.bookingUrl ?? '');
  const [notes, setNotes] = useState(m?.notes ?? '');

  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const details = useMemo((): ManualTripDetails | undefined => {
    if (!depDate) return undefined;
    const t = parseTimeInput(depTime);
    if (t === undefined) return undefined;
    const startsAt = atTime(depDate, t);
    const travel = parseInt(travelMin, 10);
    const buffer = bufferMin.trim() === '' ? undefined : parseInt(bufferMin, 10);
    const hasFlight = airline.trim() !== '' || flightNo.trim() !== '' || originCode.trim() !== '';
    return {
      name: name.trim(),
      purpose,
      originCity: originCity.trim(),
      originAirportCode: originCode.trim() === '' ? undefined : originCode.trim().toUpperCase(),
      destinationCity: destCity.trim(),
      destinationAirportCode: destCode.trim() === '' ? undefined : destCode.trim().toUpperCase(),
      isInternational: international,
      checkedBag: bag,
      hasTsaPrecheck: precheck,
      hasClear: clear,
      startsAt,
      endsAt: endDate ? atTime(endDate, 17 * 60) : undefined,
      flight: hasFlight
        ? {
            airlineName: airline.trim() === '' ? undefined : airline.trim(),
            flightNumber: flightNo.trim() === '' ? undefined : flightNo.trim().toUpperCase(),
            scheduledDepartureAt: startsAt,
            status: m?.flight?.status ?? 'scheduled',
            estimatedDepartureAt: m?.flight?.estimatedDepartureAt,
            gate: m?.flight?.gate,
            terminal: m?.flight?.terminal,
          }
        : undefined,
      returnFlight: (() => {
        if (!endDate || returnTime.trim() === '') return undefined;
        const rt = parseTimeInput(returnTime);
        if (rt === undefined) return undefined;
        return {
          airlineName: returnAirline.trim() === '' ? (airline.trim() === '' ? undefined : airline.trim()) : returnAirline.trim(),
          flightNumber: returnFlightNo.trim() === '' ? undefined : returnFlightNo.trim().toUpperCase(),
          scheduledDepartureAt: atTime(endDate, rt),
          status: m?.returnFlight?.status ?? ('scheduled' as const),
          estimatedDepartureAt: m?.returnFlight?.estimatedDepartureAt,
        };
      })(),
      lodging:
        hotelName.trim() !== ''
          ? {
              propertyName: hotelName.trim(),
              address: hotelAddress.trim() === '' ? undefined : hotelAddress.trim(),
              bookingUrl: hotelUrl.trim() === '' ? undefined : hotelUrl.trim(),
              // Hotels typically open check-in at 3 PM; editable later.
              checkInAt: m?.lodging?.checkInAt ?? atTime(depDate, Math.max(15 * 60, Math.min(t + 60, 23 * 60))),
              checkOutAt: m?.lodging?.checkOutAt ?? (endDate ? atTime(endDate, 11 * 60) : undefined),
            }
          : undefined,
      departure: {
        startingLocation: startLoc.trim(),
        estimatedTravelMinutes: Number.isFinite(travel) ? travel : 0,
        currentTrafficMinutes: m?.departure.currentTrafficMinutes,
        airportBufferMinutes: buffer !== undefined && Number.isFinite(buffer) ? buffer : undefined,
      },
      expectedConditions: m?.expectedConditions,
      notes: notes.trim() === '' ? undefined : notes.trim(),
    };
  }, [
    name, purpose, originCity, originCode, destCity, destCode, depDate, depTime, endDate,
    international, bag, precheck, clear, startLoc, travelMin, bufferMin, airline, flightNo,
    returnTime, returnAirline, returnFlightNo, hotelName, hotelAddress, hotelUrl, notes, m,
  ]);

  const submit = async () => {
    if (busy) return; // no accidental double-submit
    const nextErrors: string[] = [];
    if (!depDate) nextErrors.push('Pick a departure date.');
    if (parseTimeInput(depTime) === undefined)
      nextErrors.push('Enter the departure time like "6:05 PM" or "18:05".');
    if (returnTime.trim() !== '' && !endDate)
      nextErrors.push('A return flight needs a return/end date — pick one under "When."');
    if (returnTime.trim() !== '' && parseTimeInput(returnTime) === undefined)
      nextErrors.push('Enter the return flight time like "5:30 PM" (or clear it).');
    if (details) nextErrors.push(...validateManualTrip(details));
    if (nextErrors.length > 0 || !details) {
      setErrors(nextErrors.length > 0 ? nextErrors : ['Check the highlighted fields.']);
      return;
    }
    setErrors([]);
    setBusy(true);
    const trip = editing
      ? await updateManualTrip(editing, details, profile)
      : await createManualTrip(details, profile);
    if (!trip) {
      setErrors(['Could not save to browser storage. Free some space and try again.']);
      setBusy(false);
      return;
    }
    await refreshTrips();
    setActiveTrip(trip);
    setBusy(false);
    navigation.popToTop();
    navigation.getParent()?.navigate('TripTab');
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { placeholder?: string; keyboard?: 'numeric'; autoCap?: 'characters' | 'words'; multiline?: boolean } = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, opts.multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={opts.placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={opts.keyboard}
        autoCapitalize={opts.autoCap ?? 'sentences'}
        multiline={opts.multiline}
        accessibilityLabel={label}
      />
    </View>
  );

  const toggleRow = (label: string, value: boolean, onToggle: (v: boolean) => void, hint?: string) => (
    <Pressable
      onPress={() => onToggle(!value)}
      style={styles.toggleRow}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Ionicons
        name={value ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={value ? colors.success : colors.textMuted}
      />
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.screenTitle}>{editing ? 'Edit trip' : 'Create a trip'}</Text>
      </View>
      <Text style={styles.subtitle}>
        Everything you enter is saved on this device only and labeled "entered by you."
      </Text>

      <Card>
        <SectionHeader title="The basics" />
        {field('Trip name *', name, setName, { placeholder: 'Boston work trip' })}
        <Text style={styles.fieldLabel}>Purpose</Text>
        <View style={styles.chipRow}>
          {(Object.keys(MANUAL_PURPOSE_LABELS) as ManualTripPurpose[]).map((p) => (
            <Chip key={p} label={MANUAL_PURPOSE_LABELS[p]} selected={purpose === p} onPress={() => setPurpose(p)} />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Where" />
        {field('From city *', originCity, setOriginCity, { placeholder: 'New York' })}
        {field('From airport code', originCode, setOriginCode, { placeholder: 'JFK', autoCap: 'characters' })}
        {field('To city *', destCity, setDestCity, { placeholder: 'Boston' })}
        {field('To airport code', destCode, setDestCode, { placeholder: 'BOS', autoCap: 'characters' })}
        {toggleRow('International trip', international, setInternational, 'Adds document time to the airport buffer')}
      </Card>

      <Card>
        <SectionHeader title="When" />
        <Pressable onPress={() => setShowDepCal((v) => !v)} style={styles.dateRow} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateText}>Departure: {fmtDay(depDate)}</Text>
          <Ionicons name={showDepCal ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>
        {showDepCal && (
          <CalendarPicker
            selected={depDate}
            onSelect={(d) => {
              setDepDate(d);
              setShowDepCal(false);
            }}
          />
        )}
        {field('Departure time *', depTime, setDepTime, { placeholder: '6:05 PM' })}
        <Pressable onPress={() => setShowEndCal((v) => !v)} style={styles.dateRow} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateText}>Return / end: {endDate ? fmtDay(endDate) : 'Optional'}</Text>
          <Ionicons name={showEndCal ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>
        {showEndCal && (
          <CalendarPicker
            selected={endDate}
            onSelect={(d) => {
              setEndDate(d);
              setShowEndCal(false);
            }}
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Getting to the airport"
          subtitle="Feeds the leave-time estimate — all numbers are yours to adjust"
        />
        {field('Starting from *', startLoc, setStartLoc, { placeholder: 'Home — 123 Main St' })}
        {field('Travel time to airport (minutes) *', travelMin, setTravelMin, { placeholder: '45', keyboard: 'numeric' })}
        {field(
          `Airport buffer (minutes, default ${international ? profile.internationalBufferMinutes : profile.domesticBufferMinutes})`,
          bufferMin,
          setBufferMin,
          { placeholder: 'Leave empty for the default', keyboard: 'numeric' },
        )}
        {toggleRow('Checked bag', bag, setBag, 'Adds bag-drop time and a cutoff reminder')}
        {toggleRow('TSA PreCheck', precheck, setPrecheck)}
        {toggleRow('CLEAR', clear, setClear)}
      </Card>

      <Card>
        <SectionHeader title="Flight & hotel (optional)" subtitle="Add what you know — you can edit later" />
        {field('Airline', airline, setAirline, { placeholder: 'Delta' })}
        {field('Flight number', flightNo, setFlightNo, { placeholder: 'DL 1232', autoCap: 'characters' })}
        <Text style={styles.subsection}>
          Return flight — uses your return/end date{endDate ? ` (${fmtDay(endDate)})` : ' (pick one under "When")'}
        </Text>
        {field('Return flight time', returnTime, setReturnTime, { placeholder: '5:30 PM' })}
        {field('Return airline (if different)', returnAirline, setReturnAirline, { placeholder: airline || 'Delta' })}
        {field('Return flight number', returnFlightNo, setReturnFlightNo, { placeholder: 'DL 1233', autoCap: 'characters' })}
        <Text style={styles.subsection}>Hotel</Text>
        {field('Hotel name', hotelName, setHotelName, { placeholder: 'Grand Hyatt Boston' })}
        {field('Hotel address', hotelAddress, setHotelAddress)}
        {field('Hotel booking link', hotelUrl, setHotelUrl, { placeholder: 'https://…' })}
      </Card>

      <Card>
        <SectionHeader
          title="Notes"
          subtitle="Paste reservation details for your own reference — saved as notes only, nothing is extracted or verified"
        />
        {field('Notes', notes, setNotes, { multiline: true, placeholder: 'Confirmation numbers, addresses, anything you want handy…' })}
      </Card>

      {errors.length > 0 && (
        <Card style={styles.errorCard}>
          {errors.map((e) => (
            <View key={e} style={styles.errorRow}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={styles.errorText}>{e}</Text>
            </View>
          ))}
        </Card>
      )}

      <AppButton
        label={busy ? 'Saving…' : editing ? 'Save changes' : 'Create trip'}
        icon={editing ? 'save' : 'add-circle'}
        disabled={busy}
        onPress={submit}
      />
      <Text style={styles.footNote}>
        Saved only in this browser on this device — use Settings → Export data to back it up.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...typography.hero, color: colors.ink },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: -spacing.sm },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  subsection: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  toggleHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  dateText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  errorCard: { borderColor: colors.danger, borderWidth: 1, gap: spacing.sm },
  errorRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  errorText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 18 },
  footNote: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
});
