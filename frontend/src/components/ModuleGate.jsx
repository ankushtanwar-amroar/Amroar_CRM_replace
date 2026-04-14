import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useModuleEntitlementsContext } from '../context/ModuleContext';

/**
 * ModuleGate — route-level enforcement for module access.
 * 
 * Resolution strategy:
 * 1. Fast path: use in-memory module context (instant if already loaded or cached)
 * 2. API fallback: direct fetch from /api/runtime/modules/states
 * 3. Safety timeout: fail-open after 3s to prevent infinite loading
 */
const ModuleGate = ({ moduleCode, children }) => {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');
  const [reason, setReason] = useState('');
  const moduleCtx = useModuleEntitlementsContext();
  const stateRef = useRef('loading');

  // Keep ref in sync so timeouts don't use stale values
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    // Fast path: if module context has data (loaded or from cache), use immediately
    if (moduleCtx && !moduleCtx.loading && moduleCtx.getModuleState) {
      const { state: mState, reason: mReason } = moduleCtx.getModuleState(moduleCode);
      if (mState && mState !== 'LOADING') {
        setState(mState);
        setReason(mReason || '');
        return;
      }
    }

    // If context has states but is still "loading", check if states are populated (from cache)
    if (moduleCtx && moduleCtx.moduleStates && Object.keys(moduleCtx.moduleStates).length > 0) {
      const modData = moduleCtx.moduleStates[moduleCode];
      if (modData && modData.state) {
        setState(modData.state);
        setReason(modData.reason || '');
        return;
      }
    }

    // Safety timeout: never stay in loading state longer than 3s
    timeoutId = setTimeout(() => {
      if (!cancelled && stateRef.current === 'loading') {
        setState('ACTIVE'); // Fail open after timeout
      }
    }, 3000);

    const check = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) { if (!cancelled) setState('ACTIVE'); return; }

        const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
        const res = await fetch(`${baseUrl}/api/runtime/modules/states`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (cancelled) return;
        if (!res.ok) { setState('ACTIVE'); return; }

        const data = await res.json();
        const moduleData = data?.module_states?.[moduleCode];
        if (moduleData) {
          setState(moduleData.state || 'ACTIVE');
          setReason(moduleData.reason || '');
        } else {
          setState('ACTIVE');
        }
      } catch {
        if (!cancelled) setState('ACTIVE');
      }
    };
    check();
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  }, [moduleCode, moduleCtx?.loading]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="module-gate-loading">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (state === 'ACTIVE') return children;

  if (state === 'ADMIN_DISABLED') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="module-disabled-gate">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Module Disabled</h2>
          <p className="text-sm text-slate-500">
            {reason || 'This module has been disabled by your administrator.'}
          </p>
          <Button variant="outline" onClick={() => navigate('/setup')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Setup
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'LICENSE_REQUIRED') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="module-license-gate">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">License Required</h2>
          <p className="text-sm text-slate-500">
            {reason || "You don't have a seat assigned for this module. Contact your administrator to request access."}
          </p>
          <Button variant="outline" onClick={() => navigate('/setup')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Setup
          </Button>
        </div>
      </div>
    );
  }

  // PLAN_LOCKED (default)
  return (
    <div className="flex items-center justify-center min-h-[60vh]" data-testid="module-upgrade-gate">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center">
          <Lock className="w-8 h-8 text-violet-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Upgrade Required</h2>
        <p className="text-sm text-slate-500">
          {reason || 'This module is not included in your current plan. Upgrade to access this feature.'}
        </p>
        <div className="flex gap-3 justify-center mt-4">
          <Button variant="outline" onClick={() => navigate('/setup')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Setup
          </Button>
          <Button onClick={() => navigate('/setup/license-plans')} className="bg-violet-600 hover:bg-violet-700 text-white">
            View Plans
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ModuleGate;
