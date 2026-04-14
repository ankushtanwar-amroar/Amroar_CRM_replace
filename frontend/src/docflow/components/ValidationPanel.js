import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, Bot, Sparkles, Shield } from 'lucide-react';
import { docflowService } from '../services/docflowService';

const ValidationPanel = ({ templateId, templateData, fieldPlacements, onValidationComplete }) => {
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

  // ─── Normal Strict Validation ──────────────────────
  const runValidation = async () => {
    setValidating(true);
    try {
      const results = { errors: [], warnings: [], passed: [], score: 0, totalChecks: 0 };

      // 1. Template Name
      results.totalChecks++;
      if (!templateData?.name?.trim()) {
        results.errors.push({ category: 'Template', message: 'Template name is required', field: 'name' });
      } else {
        results.passed.push({ category: 'Template', message: 'Template name is set' });
      }

      // 2. Document check
      results.totalChecks++;
      if (!templateData?.file_url && !templateData?.s3_key && !templateData?.html_content) {
        results.errors.push({ category: 'Template', message: 'No document uploaded. Upload a PDF or DOCX file.', field: 'file' });
      } else {
        results.passed.push({ category: 'Template', message: 'Document file is attached' });
      }

      // 3. CRM Connection
      results.totalChecks++;
      const crmConnection = templateData?.crm_connection;
      if (crmConnection?.provider === 'salesforce') {
        // Salesforce-specific: verify API responds via selected connection
        const sfConnectionId = crmConnection?.connection_id;
        if (!sfConnectionId) {
          results.errors.push({ category: 'CRM', message: 'No Salesforce connection selected. Go to Connection tab and select a provider.', field: 'crm_connection' });
        } else {
          try {
            const sfTest = await docflowService.testProviderConnection(sfConnectionId);
            if (sfTest.status === 'connected') {
              results.passed.push({ category: 'CRM', message: 'Salesforce API is reachable' });
            } else {
              results.errors.push({ category: 'CRM', message: `Salesforce API connection failed: ${sfTest.message || 'Check Salesforce configuration'}`, field: 'crm_connection' });
            }
          } catch (sfErr) {
            const detail = sfErr?.response?.data?.detail || sfErr?.message || 'Salesforce API is not responding';
            results.errors.push({ category: 'CRM', message: `Salesforce connection error: ${detail}`, field: 'crm_connection' });
          }
        }

        // Validate object is selected
        results.totalChecks++;
        if (!crmConnection?.object_name) {
          results.errors.push({ category: 'CRM', message: 'No Salesforce object selected', field: 'crm_object' });
        } else {
          results.passed.push({ category: 'CRM', message: `Salesforce object '${crmConnection.object_name}' is valid` });
        }
      } else if (!crmConnection?.object_name) {
        results.warnings.push({ category: 'CRM', message: 'No CRM object connected. Go to Connection tab.', field: 'crm_connection' });
      } else {
        results.passed.push({ category: 'CRM', message: `Connected to ${crmConnection.object_name} object` });
      }

      // 4. CRM Connection status
      results.totalChecks++;
      if (crmConnection?.status === 'disconnected') {
        results.errors.push({ category: 'CRM', message: 'CRM connection is disconnected. Please reconnect.', field: 'crm_status' });
      } else if (crmConnection?.provider) {
        results.passed.push({ category: 'CRM', message: `CRM provider (${crmConnection.provider}) is active` });
      }

      // 5. Recipients check
      // results.totalChecks++;
      // const recipients = templateData?.recipients || [];
      // const signerRecipients = recipients.filter(r => r.role === 'signer');
      // if (recipients.length === 0) {
      //   results.errors.push({ category: 'Recipients', message: 'At least one recipient is required', field: 'recipients' });
      // } else if (signerRecipients.length === 0) {
      //   results.errors.push({ category: 'Recipients', message: 'At least one signer recipient is required', field: 'recipients' });
      // } else {
      //   results.passed.push({ category: 'Recipients', message: `${recipients.length} recipient(s) configured (${signerRecipients.length} signer)` });
      // }

      // 6. Field placements
      results.totalChecks++;
      if (!fieldPlacements || fieldPlacements.length === 0) {
        results.warnings.push({ category: 'Fields', message: 'No fields placed on document.', field: 'fields' });
      } else {
        results.passed.push({ category: 'Fields', message: `${fieldPlacements.length} field(s) placed on document` });

        // Signature fields check
        results.totalChecks++;
        const signatureFields = fieldPlacements.filter(f => f.type === 'signature');
        if (signatureFields.length === 0) {
          results.warnings.push({ category: 'Fields', message: 'No signature field added.', field: 'signature' });
        } else {
          // Check signature assigned to recipients
          const unassigned = signatureFields.filter(f => !f.recipient_id && !f.recipientId);
          // if (unassigned.length > 0) {
          //   results.errors.push({ category: 'Fields', message: `${unassigned.length} signature field(s) not assigned to any recipient`, field: 'signature_assignment' });
          // } else {
            // results.passed.push({ category: 'Fields', message: `${signatureFields.length} signature field(s) correctly assigned` });
          // }
        }
      }

      // 7. Merge field validation
      results.totalChecks++;
      const mergeFields = (fieldPlacements || []).filter(f => f.type === 'merge');
      if (mergeFields.length > 0) {
        const invalidMerge = mergeFields.filter(f => !f.mergeObject || !f.mergeField);
        console.log(invalidMerge, mergeFields,"jhdghasjhd");
        if (invalidMerge.length > 0) {
          results.errors.push({ category: 'Merge Fields', message: `${invalidMerge.length} merge field(s) not fully configured`, field: 'merge_fields' });
        } else {
          // Verify fields exist via API
          if (crmConnection?.provider === 'salesforce' && crmConnection?.object_name) {
            try {
              const sfFields = await docflowService.getSalesforceFields(crmConnection.object_name);
              const fieldNames = (sfFields.fields || []).map(f => (typeof f === 'string' ? f : f.api_name).toLowerCase());
              for (const mf of mergeFields) {
                if (!fieldNames.includes((mf.mergeField || '').toLowerCase())) {
                  results.errors.push({ category: 'Merge Fields', message: `Field '${mf.mergeField}' not found in Salesforce ${crmConnection.object_name}`, field: 'merge_invalid' });
                }
              }
            } catch {
              results.warnings.push({ category: 'Merge Fields', message: 'Could not verify merge fields against Salesforce API', field: 'merge_api' });
            }
          }
          results.passed.push({ category: 'Merge Fields', message: `${mergeFields.length} merge field(s) configured` });
        }
      }

      // 8. Backend validation
      if (templateId) {
        try {
          const backendResult = await docflowService.validateTemplate(templateId);
          if (backendResult.errors) {
            results.errors.push(...backendResult.errors.map(e => ({ category: 'Server', message: typeof e === 'string' ? e : e.message })));
          }
          if (backendResult.warnings) {
            results.warnings.push(...backendResult.warnings.map(w => ({ category: 'Server', message: typeof w === 'string' ? w : w.message })));
          }
        } catch {
          // Backend validation optional
        }
      }

      // Calculate score
      results.score = results.totalChecks > 0
        ? Math.round((results.passed.length / results.totalChecks) * 100) : 0;

      results.valid = results.errors.length === 0;
      setValidationResult(results);
      if (onValidationComplete) onValidationComplete(results);
    } catch (err) {
      console.error('Validation error:', err);
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
    <div className="space-y-6">
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
          <div className={`rounded-lg border p-6 ${getScoreBg(validationResult.score)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Validation Score</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {validationResult.passed.length} of {validationResult.totalChecks} checks passed
                  {validationResult.valid
                    ? <span className="ml-2 text-green-600 font-medium">✓ Ready to Save</span>
                    : <span className="ml-2 text-red-600 font-medium">✗ Fix errors before saving</span>}
                </p>
              </div>
              <div className={`text-4xl font-bold ${getScoreColor(validationResult.score)}`}>
                {validationResult.score}%
              </div>
            </div>
          </div>

          {validationResult.errors.length > 0 && (
            <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
              <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-semibold text-red-800">Errors ({validationResult.errors.length}) — Must fix before save</h4>
              </div>
              <div className="divide-y divide-red-100">
                {validationResult.errors.map((error, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded flex-shrink-0 mt-0.5">{error.category}</span>
                    <span className="text-sm text-red-700">{error.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="bg-white rounded-lg border border-yellow-200 overflow-hidden">
              <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <h4 className="font-semibold text-yellow-800">Warnings ({validationResult.warnings.length})</h4>
              </div>
              <div className="divide-y divide-yellow-100">
                {validationResult.warnings.map((warning, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded flex-shrink-0 mt-0.5">{warning.category}</span>
                    <span className="text-sm text-yellow-700">{warning.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.passed.length > 0 && (
            <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
              <div className="bg-green-50 px-4 py-3 border-b border-green-200 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h4 className="font-semibold text-green-800">Passed ({validationResult.passed.length})</h4>
              </div>
              <div className="divide-y divide-green-100">
                {validationResult.passed.map((check, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-start gap-3">
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
