import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, Bot, Sparkles, Shield } from 'lucide-react';
import { docflowService } from '../services/docflowService';

/**
 * ValidationPanel
 *
 * Single source of truth: the backend `/templates/validate-object` endpoint.
 * The backend returns a deterministic list of exactly 8 checks, each with
 * status ∈ {passed, warning, error}. The UI just renders that list.
 */
const ValidationPanel = ({ templateId, templateData, fieldPlacements, onValidationComplete, autoRunToken = 0 }) => {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [aiValidating, setAiValidating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [cluebotEnabled, setCluebotEnabled] = useState(null);

  useEffect(() => {
    let cancelled = false;
    docflowService.cluebotPolicyStatus()
      .then(data => { if (!cancelled) setCluebotEnabled(data?.enabled ?? false); })
      .catch(() => { if (!cancelled) setCluebotEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // Auto-run when parent bumps the token (i.e., user clicked top-right "Validate").
  // Manual tab open keeps token=0 → no auto-run.
  useEffect(() => {
    if (!autoRunToken) return;
    runValidation();
    // runValidation is intentionally omitted — including it causes an
    // exhaustive-deps warning but would re-create the closure and cause
    // double-firing; autoRunToken is the only driver we need.
    // eslint-disable-next-line
  }, [autoRunToken]);

  // ─── Normal Strict Validation (backend is source of truth) ─────
  const runValidation = async () => {
    setValidating(true);
    try {
      const payload = {
        ...(templateData || {}),
        field_placements: fieldPlacements || [],
      };

      const hasLiveData = Object.keys(templateData || {}).length > 0 || (fieldPlacements && fieldPlacements.length > 0);
      const backendResult = templateId && !hasLiveData
        ? await docflowService.validateTemplate(templateId)
        : await docflowService.validateTemplateObject(payload);

      // Normalize: backend returns { valid, score, total_checks, checks[], passed[], warnings[], errors[] }
      const checks = Array.isArray(backendResult?.checks) ? backendResult.checks : [];

      const result = {
        checks,
        score: typeof backendResult?.score === 'number' ? backendResult.score : 0,
        totalChecks: backendResult?.total_checks ?? checks.length,
        valid: !!backendResult?.valid,
        passed: checks.filter(c => c.status === 'passed'),
        warnings: checks.filter(c => c.status === 'warning'),
        errors: checks.filter(c => c.status === 'error'),
      };

      setValidationResult(result);
      if (onValidationComplete) onValidationComplete(result);
    } catch (err) {
      console.error('Validation error:', err);
      setValidationResult({
        checks: [],
        score: 0,
        totalChecks: 0,
        valid: false,
        passed: [],
        warnings: [],
        errors: [{ category: 'System', message: err?.response?.data?.detail || err?.message || 'Validation failed' }],
      });
    } finally {
      setValidating(false);
    }
  };

  // ─── ClueBot AI Validation ─────────────────────────
  const runAiValidation = async () => {
    setAiValidating(true);
    try {
      const data = { ...templateData, field_placements: fieldPlacements || [] };
      const result = await docflowService.cluebotValidate(data);
      if (result.success) {
        setAiResult(result);
      } else {
        setAiResult({ error: result.error || 'AI validation failed' });
      }
    } catch (err) {
      setAiResult({ error: err.message || 'AI validation failed' });
    } finally {
      setAiValidating(false);
    }
  };

  const getScoreColor = (score) => score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const getScoreBg = (score) => score >= 80 ? 'bg-green-50 border-green-200' : score >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

  return (
    <div className="space-y-6" data-testid="validation-panel">
      {/* Dual Validation Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Normal Validation */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <ShieldCheck className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900 mb-1">Normal Validation</h3>
          <p className="text-xs text-gray-500 mb-4">Strict checks — blocks save if errors found</p>
          <button
            onClick={runValidation}
            disabled={validating}
            data-testid="run-validation-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors text-sm"
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {validating ? 'Validating...' : 'Run Validation'}
          </button>
        </div>

        {/* ClueBot AI Validation */}
        <div className={`rounded-lg border p-6 text-center ${cluebotEnabled ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`} data-testid="cluebot-validation-card">
          {cluebotEnabled ? (
            <>
              <Bot className="h-10 w-10 text-purple-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-1">CluBot Validation</h3>
              <p className="text-xs text-gray-500 mb-4">AI suggestions — does NOT block save</p>
              <button
                onClick={runAiValidation}
                disabled={aiValidating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 font-medium transition-colors text-sm"
                data-testid="cluebot-validate-btn"
              >
                {aiValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiValidating ? 'Analyzing...' : 'Validate with CluBot'}
              </button>
            </>
          ) : (
            <>
              <Shield className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-400 mb-1">CluBot Validation</h3>
              <p className="text-xs text-gray-400 mb-2">AI validation is unavailable</p>
              <p className="text-[11px] text-gray-400">Enable CluBot in Setup &rarr; AI & Automation</p>
            </>
          )}
        </div>
      </div>

      {/* Normal Validation Results */}
      {validationResult && (
        <>
          <div className={`rounded-lg border p-6 ${getScoreBg(validationResult.score)}`} data-testid="validation-score-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Validation Score</h3>
                <p className="text-sm text-gray-600 mt-1">
                  <span data-testid="validation-passed-count">{validationResult.passed.length}</span>
                  {' of '}
                  <span data-testid="validation-total-count">{validationResult.totalChecks}</span>
                  {' checks passed'}
                  {validationResult.valid
                    ? <span className="ml-2 text-green-600 font-medium">✓ Ready to Save</span>
                    : <span className="ml-2 text-red-600 font-medium">✗ Fix errors before saving</span>}
                </p>
              </div>
              <div className={`text-4xl font-bold ${getScoreColor(validationResult.score)}`} data-testid="validation-score-value">
                {validationResult.score}%
              </div>
            </div>
          </div>

          {validationResult.errors.length > 0 && (
            <div className="bg-white rounded-lg border border-red-200 overflow-hidden" data-testid="validation-errors-section">
              <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-semibold text-red-800">Errors ({validationResult.errors.length}) — Must fix before save</h4>
              </div>
              <div className="divide-y divide-red-100">
                {validationResult.errors.map((check, idx) => (
                  <div key={check.id || idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded flex-shrink-0 mt-0.5">{check.category}</span>
                    <span className="text-sm text-red-700">{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="bg-white rounded-lg border border-yellow-200 overflow-hidden" data-testid="validation-warnings-section">
              <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <h4 className="font-semibold text-yellow-800">Warnings ({validationResult.warnings.length})</h4>
              </div>
              <div className="divide-y divide-yellow-100">
                {validationResult.warnings.map((check, idx) => (
                  <div key={check.id || idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded flex-shrink-0 mt-0.5">{check.category}</span>
                    <span className="text-sm text-yellow-700">{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.passed.length > 0 && (
            <div className="bg-white rounded-lg border border-green-200 overflow-hidden" data-testid="validation-passed-section">
              <div className="bg-green-50 px-4 py-3 border-b border-green-200 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h4 className="font-semibold text-green-800">Passed ({validationResult.passed.length})</h4>
              </div>
              <div className="divide-y divide-green-100">
                {validationResult.passed.map((check, idx) => (
                  <div key={check.id || idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded flex-shrink-0 mt-0.5">{check.category}</span>
                    <span className="text-sm text-green-700">{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Validation Results */}
      {aiResult && !aiResult.error && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              <h4 className="font-semibold text-purple-800">CluBot AI Analysis</h4>
            </div>
            <span className={`text-2xl font-bold ${getScoreColor(aiResult.score || 0)}`}>
              {aiResult.score || 0}/100
            </span>
          </div>
          {aiResult.summary && (
            <div className="px-4 py-3 text-sm text-purple-800 bg-purple-50/50 border-b border-purple-100">
              {aiResult.summary}
            </div>
          )}
          {(aiResult.suggestions || []).length > 0 && (
            <div className="divide-y divide-purple-100">
              {aiResult.suggestions.map((s, idx) => (
                <div key={idx} className="px-4 py-3 flex items-start gap-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded flex-shrink-0 mt-0.5 ${
                    s.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    s.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{s.category}</span>
                  <span className="text-sm text-gray-700">{s.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aiResult?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          CluBot Error: {aiResult.error}
        </div>
      )}
    </div>
  );
};

export default ValidationPanel;
