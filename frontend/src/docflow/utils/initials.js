// DocuSign-style initials helper — derives initials from a full name.
//
// Rules (spec):
//   • Split full name by whitespace.
//   • Take the first letter of each word and uppercase them.
//     "Rohit Singh"        → "RS"
//     "Rohit Kumar Singh"  → "RKS"
//   • Single name → use first two letters.
//     "Rohit"              → "RO"
//   • Empty / nullish name → empty string (caller decides fallback UX).
export const computeInitials = (name) => {
  const raw = (name || '').toString().trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .map((p) => p[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 4);
  }
  return parts[0].slice(0, 2).toUpperCase();
};

// Treat legacy initials values (data:image base64 signature pads) as empty so
// the auto-fill logic kicks in. Text values (e.g. "RS") are kept as-is.
export const isLegacyInitialsImage = (value) =>
  typeof value === 'string' && value.startsWith('data:image');
