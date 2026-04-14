import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, FileText, Send,
  Package, CheckCircle, Loader2, GripVertical,
  Search, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STEPS = [
  { id: 'documents', label: 'Select Documents', icon: FileText },
  { id: 'review', label: 'Review & Save', icon: Package },
];

const SortableDocItem = ({ doc, idx }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.template_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 ${isDragging ? 'shadow-lg ring-2 ring-indigo-300' : ''}`}
      data-testid={`doc-order-item-${idx}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
        data-testid={`doc-drag-handle-${idx}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
        {idx + 1}
      </span>
      <span className="text-sm text-gray-800 flex-1 truncate">{doc.document_name}</span>
    </div>
  );
};

const CreatePackagePage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 12;

  const [packageName, setPackageName] = useState('');
  const [selectedDocs, setSelectedDocs] = useState([]);

  const searchTimerRef = useRef(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  useEffect(() => {
    loadTemplates(debouncedSearch, currentPage);
  }, [debouncedSearch, currentPage]);

  const loadTemplates = async (search, page) => {
    try {
      setLoading(true);
      const data = await docflowService.getLatestActiveTemplates(search, page, PAGE_SIZE);
      const list = Array.isArray(data) ? data : data?.templates || [];
      setTemplates(list);
      setTotalPages(data?.pages || 0);
      setTotalCount(data?.total || 0);
    } catch (e) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const toggleTemplate = (tmpl) => {
    setSelectedDocs(prev => {
      const exists = prev.find(d => d.template_id === tmpl.id);
      if (exists) return prev.filter(d => d.template_id !== tmpl.id);
      return [...prev, {
        template_id: tmpl.id,
        document_name: tmpl.name || 'Untitled',
        order: prev.length + 1,
        _tmpl: tmpl,
      }];
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelectedDocs(prev => {
      const oldIndex = prev.findIndex(d => d.template_id === active.id);
      const newIndex = prev.findIndex(d => d.template_id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      reordered.forEach((d, i) => { d.order = i + 1; });
      return reordered;
    });
  };

  const canProceed = () => {
    if (step === 0) return selectedDocs.length >= 1 && packageName.trim();
    return true;
  };

  const goToStep = (nextStep) => {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        name: packageName,
        documents: selectedDocs.map(d => ({
          template_id: d.template_id,
          document_name: d.document_name,
          order: d.order,
        })),
      };
      const res = await docflowService.createPackage(payload);
      const data = res.data || res;
      if (data.success) {
        toast.success('Package created!');
        navigate(`/setup/docflow/packages/${data.package.id}`);
      } else {
        toast.error(data.message || 'Failed to create package');
      }
    } catch (e) {
      toast.error(e?.message || 'Failed to create package');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50" data-testid="create-package-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/setup/docflow?tab=packages')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3" data-testid="back-btn">
            <ArrowLeft className="h-4 w-4" /> Back to Packages
          </button>
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Create Package</h1>
          </div>
        </div>
      </div>

      {/* Step Indicators */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                i === step ? 'bg-indigo-50 text-indigo-700' : i < step ? 'text-emerald-600' : 'text-gray-400'
              }`}>
                {i < step ? <CheckCircle className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Step 1: Select Documents */}
        {step === 0 && (
          <div className="space-y-6" data-testid="step-documents">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Package Name *</label>
              <input
                type="text"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="e.g. Client Onboarding Bundle"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                data-testid="package-name-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Select Templates ({selectedDocs.length} selected)</h3>
                {totalCount > 0 && <span className="text-xs text-gray-400">{totalCount} active template{totalCount !== 1 ? 's' : ''}</span>}
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  data-testid="template-search-input"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  <span className="ml-2 text-sm text-gray-500">Loading templates...</span>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500" data-testid="no-templates-msg">
                  {debouncedSearch ? `No active templates matching "${debouncedSearch}".` : 'No active templates found.'}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {templates.map(tmpl => {
                    const isSelected = selectedDocs.some(d => d.template_id === tmpl.id);
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => toggleTemplate(tmpl)}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        data-testid={`template-option-${tmpl.id}`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isSelected ? <CheckCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{tmpl.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">v{tmpl.version || 1}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100" data-testid="template-pagination">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-30" data-testid="pagination-prev">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-30" data-testid="pagination-next">
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {selectedDocs.length > 1 && (
              <div data-testid="document-order-section">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Document Order</h3>
                <p className="text-xs text-gray-500 mb-2">Drag to reorder documents in the package.</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={selectedDocs.map(d => d.template_id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {selectedDocs.map((doc, idx) => (
                        <SortableDocItem key={doc.template_id} doc={doc} idx={idx} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review & Save */}
        {step === 1 && (
          <div className="space-y-6" data-testid="step-review">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Package Summary</h3>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-gray-500">Name</dt><dd className="font-medium">{packageName}</dd></div>
                <div><dt className="text-gray-500">Documents</dt><dd className="font-medium">{selectedDocs.length}</dd></div>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Documents</h3>
              {selectedDocs.map((d) => (
                <div key={d.template_id} className="flex items-center gap-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">{d.order}</span>
                  <span className="text-sm text-gray-700">{d.document_name}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700" data-testid="reusable-info">
              This package is a reusable blueprint. After saving, you can send it multiple times with different recipients and delivery modes.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => step > 0 ? goToStep(step - 1) : navigate('/setup/docflow?tab=packages')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            data-testid="prev-step-btn"
          >
            <ArrowLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 1 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="next-step-btn"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
              data-testid="save-package-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Package'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreatePackagePage;
