/**
 * DocFlow Content Variables — Phase 81.80
 *
 * Replaces {{variable}} placeholders inside title/body/footer strings with
 * actual values from the runtime context (recipient, document, tenant, date).
 *
 * Variables supported:
 *   {{user_name}}      — recipient full name
 *   {{email}}          — recipient email
 *   {{phone}}          — full phone (if available)
 *   {{phone_last4}}    — last 4 digits of phone, e.g. 3210 (rendered as ●●●3210)
 *   {{company_name}}   — tenant / company display name
 *   {{document_name}}  — current document or package name
 *   {{date}}           — today's date (locale-formatted)
 *
 * Missing values are replaced with empty strings (with a tiny "—" fallback
 * for clearly user-visible placeholders like phone) so the UI never shows
 * the raw `{{variable}}` text.
 */

const phoneLast4 = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return digits || '';
  return digits.slice(-4);
};

const fmtDate = () => {
  try {
    return new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return new Date().getFullYear().toString();
  }
};

export const buildVariableMap = (ctx = {}) => {
  const phone = ctx.phone || '';
  const last4 = phoneLast4(phone);
  return {
    user_name: ctx.user_name || ctx.recipient_name || ctx.name || '',
    email: ctx.email || ctx.recipient_email || '',
    phone: ctx.phone_masked || (last4 ? `●●●${last4}` : (phone || '')),
    phone_last4: last4,
    company_name: ctx.company_name || ctx.tenant_name || 'our team',
    document_name: ctx.document_name || ctx.package_name || '',
    date: ctx.date || fmtDate(),
  };
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replace {{var}} placeholders in a string with values from `vars`.
 * If a variable has no value, the placeholder becomes empty.
 */
export const renderVariables = (str, vars) => {
  if (!str || typeof str !== 'string') return str || '';
  return str.replace(PLACEHOLDER_RE, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return String(v);
  });
};

/**
 * Deep-render an entire content section: walks every string field (and array
 * of strings, and nested object) and substitutes placeholders.
 */
export const renderContent = (content, ctx = {}) => {
  const vars = buildVariableMap(ctx);
  const walk = (val) => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') return renderVariables(val, vars);
    if (Array.isArray(val)) return val.map(walk);
    if (typeof val === 'object') {
      const out = {};
      Object.keys(val).forEach((k) => { out[k] = walk(val[k]); });
      return out;
    }
    return val;
  };
  return walk(content);
};
