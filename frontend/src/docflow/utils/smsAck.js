/**
 * Phase 81.83 — SMS-disclaimer persistence helper.
 *
 * Once a recipient accepts the Security Check ("Continue to Document"), the
 * choice is persisted in localStorage so they aren't re-prompted on refresh,
 * a new tab, or browser restart on the same device. Decline is NOT persisted
 * — re-opening the link asks again.
 *
 * Key shape: `sms-ack::{scope}::{id}::{token}[::extra]`
 *   scope: 'pkg' | 'pkglink' | 'doc'
 *   id:    package run id / document id
 *   token: recipient public token (unique per recipient)
 *   extra: optional disambiguator (e.g. signer email for reusable links)
 */
const PREFIX = 'docflow.sms-ack.v1';

export const buildSmsAckKey = ({ scope, id, token, extra }) => {
  const parts = [PREFIX, scope || 'pkg', id || '', token || ''];
  if (extra) parts.push(extra);
  return parts.join('::');
};

export const hasAcceptedSms = (key) => {
  if (!key) return false;
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};

export const persistSmsAck = (key) => {
  if (!key) return;
  try { localStorage.setItem(key, '1'); } catch { /* ignore quota / private mode */ }
};

export const clearSmsAck = (key) => {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* noop */ }
};
