/**
 * Approvals with honest handoff (Step 3) + on-device audit log.
 *
 * Every money action goes through an approval record. Approving opens the
 * provider and marks the record `approved_handoff` — NEVER "completed":
 * a static client can hand you to the provider's checkout, not confirm a
 * purchase. Rejections and expirations are kept as history. Everything
 * lives in AsyncStorage; every transition is written to the audit log.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type ApprovalStatus = 'pending' | 'approved_handoff' | 'rejected' | 'expired';

export interface Approval {
  id: string;
  tripId?: string;
  provider: string; // "Expedia", "Amtrak", "Booking.com", "Uber"
  title: string; // "Flight DL 1232 · JFK → MIA"
  description: string; // what approving does
  /** "$148 per person" for known figures, "$120–$160 (estimate)" otherwise. */
  amountLabel: string;
  amountIsEstimate: boolean;
  handoffUrl: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  expiresAt: string;
  demo?: boolean;
}

export interface AuditEntry {
  at: string;
  actor: 'user' | 'system';
  action: string; // "approval.approved", "handoff.opened", "change.detected"
  summary: string;
}

const APPROVALS_KEY = '@a2z/approvals';
const AUDIT_KEY = '@a2z/audit-log';
const MAX_AUDIT = 60;

async function readAll(): Promise<Approval[]> {
  try {
    const raw = await AsyncStorage.getItem(APPROVALS_KEY);
    return raw ? (JSON.parse(raw) as Approval[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: Approval[]): Promise<void> {
  try {
    await AsyncStorage.setItem(APPROVALS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // storage unavailable — in-memory state still renders
  }
}

/** Pure transition rules — the only legal moves. */
export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  if (from === 'pending') return to === 'approved_handoff' || to === 'rejected' || to === 'expired';
  return false; // decided/expired records are immutable history
}

/** Expire overdue pending approvals (pure). */
export function applyExpiry(list: Approval[], now: Date = new Date()): Approval[] {
  return list.map((a) =>
    a.status === 'pending' && new Date(a.expiresAt).getTime() < now.getTime()
      ? { ...a, status: 'expired' as const, decidedAt: now.toISOString() }
      : a,
  );
}

export async function listApprovals(tripId?: string): Promise<Approval[]> {
  const expired = applyExpiry(await readAll());
  await writeAll(expired);
  return tripId ? expired.filter((a) => a.tripId === tripId) : expired;
}

export async function createApproval(
  input: Omit<Approval, 'id' | 'status' | 'createdAt'> & { status?: ApprovalStatus },
): Promise<Approval> {
  const approval: Approval = {
    ...input,
    id: `apv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: input.status ?? 'pending',
    createdAt: new Date().toISOString(),
  };
  const all = await readAll();
  // De-dup: one pending approval per provider+title.
  const filtered = all.filter(
    (a) => !(a.status === 'pending' && a.provider === approval.provider && a.title === approval.title),
  );
  await writeAll([approval, ...filtered]);
  await audit(
    approval.status === 'pending' ? 'system' : 'user',
    `approval.${approval.status === 'pending' ? 'created' : 'auto_approved'}`,
    `${approval.title} via ${approval.provider} (${approval.amountLabel})`,
  );
  return approval;
}

export async function decideApproval(
  id: string,
  decision: 'approved_handoff' | 'rejected',
): Promise<Approval | undefined> {
  const all = applyExpiry(await readAll());
  const target = all.find((a) => a.id === id);
  if (!target || !canTransition(target.status, decision)) return undefined;
  const decided: Approval = { ...target, status: decision, decidedAt: new Date().toISOString() };
  await writeAll(all.map((a) => (a.id === id ? decided : a)));
  await audit(
    'user',
    `approval.${decision === 'rejected' ? 'rejected' : 'approved'}`,
    decision === 'rejected'
      ? `Rejected: ${target.title}`
      : `Approved: ${target.title} — handed off to ${target.provider} (not a completed booking)`,
  );
  return decided;
}

export async function clearDemoApprovals(): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((a) => !a.demo));
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function audit(actor: AuditEntry['actor'], action: string, summary: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    const list = raw ? (JSON.parse(raw) as AuditEntry[]) : [];
    list.unshift({ at: new Date().toISOString(), actor, action, summary });
    await AsyncStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, MAX_AUDIT)));
  } catch {
    // best effort
  }
}

export async function getAuditLog(): Promise<AuditEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch {
    return [];
  }
}
