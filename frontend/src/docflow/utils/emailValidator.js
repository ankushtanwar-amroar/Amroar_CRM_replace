/**
 * Email validator — Phase 81.28
 *
 * Frontend-only RFC-style check for recipient email inputs in public link
 * flows (Template + Package). Backend validation is unchanged.
 *
 * Rules:
 *   - Trimmed + lowercased before validation
 *   - Local part: 1+ chars allowing letters, digits, dots, plus, underscore, hyphen
 *   - Single @
 *   - Domain: at least one dot, TLD must be 2+ alpha chars (rejects `user@.`,
 *     `user@x`, `user@x.1`, `dsf@fs.ghjgf` is technically valid by RFC so we
 *     do NOT reject unknown TLDs — the regex only enforces 2+ alpha chars,
 *     which `ghjgf` passes. Ghjgf is a valid-shape email per RFC even though
 *     no such domain exists; that check belongs server-side via DNS).
 */

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export const normalizeEmail = (raw) => (raw || '').trim().toLowerCase();

export const isValidEmail = (raw) => {
  const v = normalizeEmail(raw);
  if (!v) return false;
  if (v.length > 254) return false;
  // Reject `..` runs and a leading/trailing dot in the local part.
  const [local, domain, ...rest] = v.split('@');
  if (rest.length > 0) return false;
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return EMAIL_RE.test(v);
};

/**
 * Returns the validation error message for a recipient email input, or `''`
 * when the value is acceptable. Use directly in JSX:
 *   const err = emailError(email, { required: true });
 */
export const emailError = (raw, { required = true } = {}) => {
  const v = (raw || '').trim();
  if (!v) return required ? 'Email is required' : '';
  return isValidEmail(v) ? '' : 'Please enter a valid email address';
};
