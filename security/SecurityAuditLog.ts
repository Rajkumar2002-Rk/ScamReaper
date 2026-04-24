import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SecurityAuditLog
 *
 * Local-only audit trail for every security-relevant event in ScamReaper:
 * classifications, bypass attempts, integrity checks, etc.
 *
 * Everything stays inside AsyncStorage on the user's device. Logs are never
 * transmitted anywhere — this module has no network surface by design.
 *
 * We cap the store at MAX_EVENTS (default 100) so it never grows unbounded.
 */

const STORAGE_KEY = 'scamreaper_security_log';
const MAX_EVENTS = 100;

export type SecuritySeverity = 'info' | 'warn' | 'critical';

export type SecurityEventType =
  | 'model_integrity_ok'
  | 'model_integrity_failed'
  | 'model_load_failed'
  | 'classification'
  | 'bypass_attempt'
  | 'language_detected'
  | 'fallback_used'
  | 'rage_mode_triggered'
  | 'manual_action';

export type SecurityEvent = {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  timestamp: number;
  meta?: Record<string, unknown>;
};

type Listener = (events: SecurityEvent[]) => void;

class SecurityAuditLogImpl {
  private listeners = new Set<Listener>();
  private cache: SecurityEvent[] | null = null;

  async record(
    type: SecurityEventType,
    message: string,
    severity: SecuritySeverity = 'info',
    meta?: Record<string, unknown>,
  ): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      meta,
    };
    const existing = await this.load();
    const next = [event, ...existing].slice(0, MAX_EVENTS);
    this.cache = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Disk full or AsyncStorage unavailable — keep in memory only.
    }
    this.notify();
    return event;
  }

  async list(): Promise<SecurityEvent[]> {
    return this.load();
  }

  async clear() {
    this.cache = [];
    await AsyncStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    if (this.cache) l(this.cache);
    return () => this.listeners.delete(l);
  }

  private async load(): Promise<SecurityEvent[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: SecurityEvent[] = raw ? JSON.parse(raw) : [];
      this.cache = parsed;
      return parsed;
    } catch {
      this.cache = [];
      return [];
    }
  }

  private notify() {
    if (!this.cache) return;
    for (const l of this.listeners) l(this.cache);
  }
}

export const SecurityAuditLog = new SecurityAuditLogImpl();
