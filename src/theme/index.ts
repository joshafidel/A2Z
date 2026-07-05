/**
 * A2Z design tokens.
 * Premium, minimal, mobile-first: deep navy base, electric indigo accent,
 * soft neutral surfaces, generous radii and large touch targets.
 */

export const colors = {
  // Brand
  primary: '#3D5AFE',
  primaryDark: '#2A3EB1',
  primarySoft: '#E8EDFF',
  ink: '#0E1330', // near-black navy for headings
  navy: '#101A3D', // hero backgrounds

  // Surfaces
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2F8',
  border: '#E4E7F0',

  // Text
  text: '#1B2140',
  textSecondary: '#5B6285',
  textMuted: '#9AA0BC',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255,255,255,0.72)',

  // Semantic
  success: '#0BA360',
  successSoft: '#E3F7EE',
  warning: '#E8930C',
  warningSoft: '#FDF3E1',
  danger: '#E5484D',
  dangerSoft: '#FDEBEC',
  info: '#0E7DD1',
  infoSoft: '#E5F2FC',

  // Badges
  badgeBest: '#3D5AFE',
  badgeCheap: '#0BA360',
  badgeFast: '#E8930C',
  badgeCalm: '#8E5AF7',

  // Mode accents (used on icons / timeline dots)
  modeFlight: '#0E7DD1',
  modeTrain: '#8E5AF7',
  modeBus: '#0BA360',
  modeDrive: '#5B6285',
  modeWalk: '#E8930C',
  modeTransit: '#E5484D',
  modeRideshare: '#0E1330',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export const shadows = {
  card: {
    shadowColor: '#101A3D',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#101A3D',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;
