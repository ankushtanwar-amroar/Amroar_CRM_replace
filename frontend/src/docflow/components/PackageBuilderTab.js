import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Loader2, AlertCircle, Save, CheckCircle2, RefreshCw,
  ChevronLeft, ChevronRight, Wrench,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import MultiPageVisualBuilder from './MultiPageVisualBuilder';

/**
 * PackageBuilderTab — Virtual Builder for Package-level field editing.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [≡] Doc name                          [status]  [Save]      │ ← compact toolbar
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Doc list  │  MultiPageVisualBuilder (maximized canvas)      │
 *   │ (collapse) │                                                 │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Template is NEVER modified — all changes write to the package only.
 */
const PackageBuilderTab = ({ packageId, documents = [], isVoided = false }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [builderData, setBuilderData] = useState(null);
  const [loadingBuilder, setLoadingBuilder] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const autoSaveTimer = useRef(null);

  const loadDocumentFields = useCallback(async (templateId) => {
    setLoadingBuilder(true);
    setLoadError(null);
    setBuilderData(null);
    setFields([]);
    setHasUnsaved(false);
    setSavedAt(null);
    try {
      const res = await docflowService.getPackageBuilderFields(packageId, templateId);
      const data = res.data || res;
      setBuilderData(data);
      setFields(data.field_placements || []);
    } catch (e) {
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to load builder');
    } finally {
      setLoadingBuilder(false);
    }
  }, [packageId]);

  const handleSelectDocument = (templateId) => {
    if (selectedTemplateId === templateId) return;
    if (hasUnsaved) {
      if (!window.confirm('You have unsaved changes. Switch documents without saving?')) return;
    }
    setSelectedTemplateId(templateId);
    loadDocumentFields(templateId);
  };

  const saveFields = useCallback(async (fp) => {
    if (!selectedTemplateId || isVoided) return;
    try {
      setSaving(true);
      await docflowService.savePackageBuilderFields(packageId, selectedTemplateId, fp);
      setSavedAt(new Date());
      setHasUnsaved(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save builder changes');
    } finally {
      setSaving(false);
    }
  }, [packageId, selectedTemplateId, isVoided]);

  const handleFieldsChange = useCallback((updatedFields) => {
    setFields(updatedFields);
    setHasUnsaved(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveFields(updatedFields), 1500);
  }, [saveFields]);

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveFields(fields);
  };

  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  const selectedDoc = documents.find(d => d.template_id === selectedTemplateId);

  return (
    <div className="flex flex-col h-full bg-[#f3f4f6] overflow-hidden">

      {/* ── Compact sticky toolbar ── */}
      <div className="h-11 bg-white border-b border-gray-200 flex items-center gap-2 px-3 shrink-0 shadow-sm">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          title={sidebarCollapsed ? 'Show documents' : 'Hide documents'}
          data-testid="sidebar-toggle-btn"
        >
          {sidebarCollapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
        </button>

        <div className="w-px h-5 bg-gray-200 shrink-0" />

        {/* Document breadcrumb */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Wrench className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs text-gray-400 shrink-0">Virtual Builder</span>
          {selectedDoc && (
            <>
              <span className="text-gray-300 shrink-0">/</span>
              <span className="text-xs font-semibold text-gray-700 truncate">
                {selectedDoc.document_name || 'Untitled'}
              </span>
              {builderData?.has_package_overrides && (
                <span className="ml-1 text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full shrink-0">
                  Package fields
                </span>
              )}
            </>
          )}
          {!selectedDoc && (
            <span className="text-xs text-gray-400">— select a document from the sidebar</span>
          )}
        </div>

        {/* Save state */}
        <div className="flex items-center gap-2 shrink-0">
          {isVoided && (
            <span className="text-xs text-red-500 font-medium">Read-only (voided)</span>
          )}
          {!isVoided && saving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          {!isVoided && !saving && savedAt && !hasUnsaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {!isVoided && hasUnsaved && !saving && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          {!isVoided && selectedTemplateId && (
            <button
              onClick={handleManualSave}
              disabled={saving || !hasUnsaved}
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="save-package-builder-btn"
            >
              <Save className="h-3 w-3" /> Save
            </button>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + canvas ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Document list sidebar */}
        {!sidebarCollapsed && (
          <div className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Documents</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {documents.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">No documents</p>
              ) : (
                documents.map((doc, idx) => {
                  const isActive = selectedTemplateId === doc.template_id;
                  return (
                    <button
                      key={doc.template_id}
                      onClick={() => handleSelectDocument(doc.template_id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-indigo-50 border-r-2 border-r-indigo-500'
                          : 'hover:bg-gray-50 border-r-2 border-r-transparent'
                      }`}
                      data-testid={`builder-doc-${idx}`}
                    >
                      <div className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold shrink-0 ${
                        isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {doc.document_name || 'Untitled'}
                        </p>
                        {isActive && builderData?.has_package_overrides && (
                          <p className="text-[10px] text-indigo-400 mt-0.5">Package overrides</p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Builder canvas ── */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {!selectedTemplateId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gray-50 p-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                <FileText className="h-8 w-8 text-gray-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">No document selected</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                  Choose a document from the sidebar to open the editor.
                  Edits are package-only and never touch the original template.
                </p>
              </div>
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                >
                  <ChevronRight className="h-3.5 w-3.5" /> Show documents
                </button>
              )}
            </div>
          ) : loadingBuilder ? (
            <div className="flex-1 flex items-center justify-center gap-3 bg-gray-50">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="text-sm text-gray-500">Loading builder…</span>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50 p-6">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-600 text-center">{loadError}</p>
              <button
                onClick={() => loadDocumentFields(selectedTemplateId)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : builderData ? (
            <div className="flex-1 overflow-hidden">
              <MultiPageVisualBuilder
                pdfFile={builderData.pdf_url}
                fields={fields}
                onFieldsChange={!isVoided ? handleFieldsChange : undefined}
                crmObjects={builderData.crm_objects || []}
                crmConnection={builderData.crm_connection || null}
                templateRecipients={builderData.template_recipients || []}
                currentTemplateId={selectedTemplateId}
                serverFieldsVersion={0}
                packageDocuments={documents}
                packageId={packageId}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PackageBuilderTab;
