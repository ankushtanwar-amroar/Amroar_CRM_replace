import { useState, useCallback, useEffect } from 'react';

/**
 * useSessionSignature
 *
 * Session-scoped signature cache for the signing flow.
 *
 * - Scoped per signer (sessionKey) so multiple signers on the same device
 *   do not cross-share signatures.
 * - Persists via sessionStorage so refresh within the same browser tab
 *   keeps the cached signature (but closing the tab clears it).
 * - Separate slots for 'signature' and 'initials'.
 *
 * Returns:
 *   getSignature(type) -> dataUrl | null
 *   setSignature(type, dataUrl) -> void
 *   clearAll() -> void
 */
const STORAGE_PREFIX = 'docflow.sessionSig.v1';

const readStored = (sessionKey) => {
  if (!sessionKey) return { signature: null, initials: null };
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}.${sessionKey}`);
    if (!raw) return { signature: null, initials: null };
    const parsed = JSON.parse(raw);
    return {
      signature: parsed.signature || null,
      initials: parsed.initials || null,
    };
  } catch {
    return { signature: null, initials: null };
  }
};

const writeStored = (sessionKey, value) => {
  if (!sessionKey) return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}.${sessionKey}`, JSON.stringify(value));
  } catch {
    /* quota or unavailable — silent */
  }
};

export default function useSessionSignature(sessionKey) {
  const [state, setState] = useState(() => readStored(sessionKey));

  // Re-hydrate whenever sessionKey changes (e.g., when signer email loads)
  useEffect(() => {
    setState(readStored(sessionKey));
  }, [sessionKey]);

  const setSignature = useCallback((type, dataUrl) => {
    setState(prev => {
      const next = { ...prev, [type === 'initials' ? 'initials' : 'signature']: dataUrl };
      writeStored(sessionKey, next);
      return next;
    });
  }, [sessionKey]);

  const getSignature = useCallback((type) => {
    return state[type === 'initials' ? 'initials' : 'signature'] || null;
  }, [state]);

  const clearAll = useCallback(() => {
    if (sessionKey) {
      try { sessionStorage.removeItem(`${STORAGE_PREFIX}.${sessionKey}`); } catch { /* noop */ }
    }
    setState({ signature: null, initials: null });
  }, [sessionKey]);

  return { getSignature, setSignature, clearAll };
}
