import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, Type, Edit3, Calendar, CheckSquare, FileText, BracesIcon, AlignLeft, Trash2, Copy, X, Grid, Maximize2, Sparkles, Send, Loader2, CircleDot, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import DocumentContentEditor from './DocumentContentEditor';
import SearchableSelect from './SearchableSelect';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const FIELD_TYPES = [
  { id: 'signature', label: 'Signature', icon: Edit3, color: '#3B82F6', bgColor: '#DBEAFE', borderColor: '#3B82F6', width: 200, height: 80 },
  { id: 'initials', label: 'Initials', icon: FileText, color: '#6366F1', bgColor: '#E0E7FF', borderColor: '#6366F1', width: 80, height: 40 },
  { id: 'text', label: 'Text Input', icon: Type, color: '#10B981', bgColor: '#D1FAE5', borderColor: '#10B981', width: 150, height: 40 },
  { id: 'date', label: 'Date', icon: Calendar, color: '#8B5CF6', bgColor: '#EDE9FE', borderColor: '#8B5CF6', width: 120, height: 40 },
  { id: 'checkbox', label: 'Checkbox + Label', icon: CheckSquare, color: '#F59E0B', bgColor: '#FEF3C7', borderColor: '#F59E0B', width: 160, height: 30, hasLabel: true },
  { id: 'radio', label: 'Radio Group', icon: CircleDot, color: '#EC4899', bgColor: '#FCE7F3', borderColor: '#EC4899', width: 160, height: 80, hasOptions: true },
  { id: 'merge', label: 'Merge Field', icon: BracesIcon, color: '#F97316', bgColor: '#FFEDD5', borderColor: '#F97316', width: 150, height: 40 },
  { id: 'label', label: 'Label (Static)', icon: AlignLeft, color: '#6B7280', bgColor: '#F3F4F6', borderColor: '#6B7280', width: 200, height: 30 }
];

const GRID_SIZE = 10;

const snapToGrid = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;

const MultiPageVisualBuilder = ({ pdfFile, fields, onFieldsChange, crmObjects, crmConnection, templateRecipients = [], contentBlocks = [], onContentBlocksChange, onTextSelect, highlightBlockId = null, onConvertToEditable }) => {
  // Color palette for recipient assignment badges
  const RECIPIENT_COLORS = useMemo(() => [
    { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', dot: 'bg-blue-500' },
    { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', dot: 'bg-amber-500' },
    { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700', dot: 'bg-purple-500' },
    { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700', dot: 'bg-rose-500' },
    { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  ], []);
  const getRecipientColor = useCallback((recipientId) => {
    const idx = templateRecipients.findIndex(r => r.id === recipientId);
    return idx >= 0 ? RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length] : null;
  }, [templateRecipients, RECIPIENT_COLORS]);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [draggingFromPalette, setDraggingFromPalette] = useState(null);
  const [droppedFields, setDroppedFields] = useState(fields || []);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [aiCommand, setAiCommand] = useState('');
  const [convertingToEditable, setConvertingToEditable] = useState(false);

  // For PDF templates: default to PDF view even if content blocks exist.
  // User must explicitly toggle into editable mode.
  const [editableMode, setEditableMode] = useState(false);

  // Ref for the scrollable center area to measure available width
  const scrollContainerRef = useRef(null);
  // Track whether zoom was manually set by user (skip auto-fit overrides)
  const isManualZoom = useRef(false);
  const lastAutoFitWidth = useRef(0);

  // Determine rendering mode:
  // - PDF view: show react-pdf canvas (pixel-perfect, non-editable)
  // - Editable mode: show HTML blocks from DocumentContentEditor (editable text/images)
  // - If no PDF exists: always show HTML blocks if available
  const hasPdf = !!pdfFile;
  const hasBlocks = contentBlocks && contentBlocks.length > 0;
  const showPdf = hasPdf && (!editableMode || !hasBlocks);
  const isHtmlMode = hasBlocks && (!hasPdf || editableMode);

  // Auto-fit zoom to container width on mount and significant resize only
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const PAGE_W = 800;

    const computeFit = () => {
      if (isManualZoom.current) return;
      // Use scrollbar-agnostic measurement: offsetWidth includes scrollbar, clientWidth excludes it.
      // To avoid oscillation, always assume scrollbar may be present by using a conservative width.
      const scrollbarWidth = el.offsetWidth - el.clientWidth;
      const conservativeWidth = el.offsetWidth - Math.max(scrollbarWidth, 17) - 48;
      if (conservativeWidth <= 0 || conservativeWidth >= PAGE_W) return;

      // Only re-fit if the container size changed significantly (> 30px)
      if (Math.abs(conservativeWidth - lastAutoFitWidth.current) < 30 && lastAutoFitWidth.current > 0) return;
      lastAutoFitWidth.current = conservativeWidth;

      // Use floor to avoid rounding up into a value that triggers scrollbar
      const newZoom = Math.floor((conservativeWidth / PAGE_W) * 100) / 100;
      setZoom(newZoom);
    };

    computeFit();
    const ro = new ResizeObserver(computeFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Callback for DocumentContentEditor to report page count
  const handleContentPageCountChange = useCallback((count) => {
    if (isHtmlMode) {
      setNumPages(count);
    }
  }, [isHtmlMode]);

  // Store actual page offsets from DocumentContentEditor (cumulative content heights)
  const [pageOffsets, setPageOffsets] = useState([0]);
  const pageOffsetsRef = useRef([0]);

  // Track actual rendered PDF page heights in continuous mode
  const [pdfPageHeights, setPdfPageHeights] = useState({});
  const pdfPageHeightsRef = useRef({});
  const PDF_PAGE_GAP = 32; // mt-4 (16px) + pt-4 (16px) gap between pages in continuous mode

  // Calculate cumulative offsets from actual measured PDF page heights
  const pdfPageOffsets = useMemo(() => {
    if (!numPages) return [0];
    const offsets = [0];
    for (let i = 0; i < numPages - 1; i++) {
      const prevHeight = pdfPageHeights[i + 1] || 1035; // fallback for letter-size at width=800
      const gap = i < numPages - 1 ? PDF_PAGE_GAP : 0;
      offsets.push(offsets[i] + prevHeight + gap);
    }
    return offsets;
  }, [numPages, pdfPageHeights]);
  const pdfPageOffsetsRef = useRef([0]);
  useEffect(() => { pdfPageOffsetsRef.current = pdfPageOffsets; }, [pdfPageOffsets]);

  const handlePdfPageLoad = useCallback((pageNum, page) => {
    const height = page.height;
    setPdfPageHeights(prev => {
      if (prev[pageNum] === height) return prev;
      const next = { ...prev, [pageNum]: height };
      pdfPageHeightsRef.current = next;
      return next;
    });
  }, []);

  const handlePageOffsetsChange = useCallback((offsets) => {
    pageOffsetsRef.current = offsets;
    setPageOffsets(offsets);
  }, []);

  // Handle inline block editing — update contentBlocks and propagate to parent
  const handleBlockChange = useCallback((blockId, updatedBlock) => {
    if (!onContentBlocksChange) return;
    const newBlocks = contentBlocks.map(b => b.id === blockId ? updatedBlock : b);
    onContentBlocksChange(newBlocks);
  }, [contentBlocks, onContentBlocksChange]);

  const signingTypes = new Set(['signature', 'initials', 'date']);
  const recipientOptions = templateRecipients || [];

  const defaultRecipientId = (() => {
    if (!recipientOptions.length) return '';
    const sorted = [...recipientOptions].sort((a, b) => (parseInt(a.routing_order || 1, 10) - parseInt(b.routing_order || 1, 10)));
    const signer = sorted.find(r => r.role === 'signer');
    return (signer || sorted[0] || {}).id || '';
  })();

  const getRecipientLabel = (recipientId) => {
    if (!recipientId) return '';
    const r = recipientOptions.find(x => x.id === recipientId);
    return r?.placeholder_name || r?.role || '';
  };

  const getRecipientBorderColor = (recipientId) => {
    if (!recipientId) return '#3B82F6';
    const idx = recipientOptions.findIndex(x => x.id === recipientId);
    const colors = ['#3B82F6', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6'];
    return colors[idx % colors.length];
  };

  // Mouse-based drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragFieldId, setDragFieldId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeFieldId, setResizeFieldId] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Refs for stable access in event handlers
  const droppedFieldsRef = useRef(droppedFields);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragFieldIdRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeFieldIdRef = useRef(null);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Update ref whenever state changes
  useEffect(() => {
    droppedFieldsRef.current = droppedFields;
  }, [droppedFields]);

  // Sync to parent without causing dragging jitter
  // We only sync when NOT dragging/resizing to avoid re-render loops from parent
  const syncToParent = useCallback((currentFields) => {
    if (onFieldsChange) {
      onFieldsChange(currentFields || droppedFieldsRef.current);
    }
  }, [onFieldsChange]);

  // Dynamic CRM fields caching
  const [dynamicFields, setDynamicFields] = useState({});
  const [loadingDynamicFields, setLoadingDynamicFields] = useState(false);
  const [viewMode, setViewMode] = useState('pagination'); // 'pagination' | 'continuous'

  useEffect(() => {
    const selectedField = droppedFields.find(f => f.id === selectedFieldId);
    if (selectedField?.type === 'merge') {
      // Use object from Connection tab if not set on field
      const obj = selectedField.mergeObject || crmConnection?.object_name;
      
      if (obj && !dynamicFields[obj]) {
        setLoadingDynamicFields(true);
        const fetchPromise = crmConnection?.provider === 'salesforce' 
          ? docflowService.getSalesforceFields(obj)
          : docflowService.getCrmObjectFields(obj);

        fetchPromise
          .then(res => {
            // Salesforce API returns array or {fields: []}, Internal returns {fields: []}
            let flds = [];
            if (Array.isArray(res)) {
              flds = res.map(f => typeof f === 'string' ? { api_name: f, label: f, type: 'text' } : f);
            } else {
              flds = res.fields || res || [];
              if (Array.isArray(flds)) {
                flds = flds.map(f => typeof f === 'string' ? { api_name: f, label: f, type: 'text' } : f);
              }
            }
            setDynamicFields(prev => ({ ...prev, [obj]: flds }));
          })
          .catch(err => console.error('Error fetching fields for', obj, err))
          .finally(() => setLoadingDynamicFields(false));
      }
    }
  }, [selectedFieldId, droppedFields, dynamicFields, crmConnection]);

  const containerRef = useRef(null);
  const pdfCanvasRef = useRef(null);

  // Sync incoming fields from parent (ClueBot updates)
  useEffect(() => {
    console.log('[VisualBuilder] fields prop changed:', fields?.length, 'fields');
    if (fields) {
      // Always update if field count changed or any field ID is different
      const currentIds = new Set(droppedFields.map(f => f.id));
      const newIds = new Set(fields.map(f => f.id));
      
      const hasNewFields = fields.some(f => !currentIds.has(f.id));
      const hasRemovedFields = droppedFields.some(f => !newIds.has(f.id));
      const countChanged = fields.length !== droppedFields.length;
      
      if (hasNewFields || hasRemovedFields || countChanged) {
        console.log('[VisualBuilder] Syncing fields - new:', hasNewFields, 'removed:', hasRemovedFields, 'count:', countChanged);
        setDroppedFields(fields);
        droppedFieldsRef.current = fields;
      }
    }
  }, [fields]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Get selected field
  const selectedField = droppedFields.find(f => f.id === selectedFieldId);

  // Get field type config
  const getFieldTypeConfig = (type) => FIELD_TYPES.find(ft => ft.id === type) || FIELD_TYPES[0];

  // ---- PALETTE DRAG (HTML5 DnD for new fields) ----
  const handlePaletteDragStart = (fieldType) => {
    setDraggingFromPalette(fieldType);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handlePaletteDrop = (e) => {
    e.preventDefault();
    if (!draggingFromPalette || !pdfCanvasRef.current) return;

    const rect = pdfCanvasRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / zoom;
    let y = (e.clientY - rect.top) / zoom;

    if (showGrid) {
      x = snapToGrid(x);
      y = snapToGrid(y);
    }

    // In Scroll (continuous) mode, calculate the correct page from Y position
    // using actual measured page content offsets (not fixed 1100px intervals)
    let fieldPage = currentPage;
    let fieldY = y;
    if (viewMode === 'continuous' && isHtmlMode) {
      const offsets = pageOffsetsRef.current;
      // Find which page this Y position falls into
      let foundPage = 1;
      for (let i = offsets.length - 1; i >= 0; i--) {
        if (y >= offsets[i]) {
          foundPage = i + 1;
          fieldY = y - offsets[i];
          break;
        }
      }
      fieldPage = foundPage;
    } else if (viewMode === 'continuous') {
      // PDF mode — use measured page offsets
      const offsets = pdfPageOffsetsRef.current;
      let foundPage = 1;
      for (let i = offsets.length - 1; i >= 0; i--) {
        if (y >= offsets[i]) {
          foundPage = i + 1;
          fieldY = y - offsets[i];
          break;
        }
      }
      fieldPage = foundPage;
    }

    let nextNumber = 1;
    const sameTypeFields = droppedFields.filter(f => f.type === draggingFromPalette.id);
    if (sameTypeFields.length > 0) {
      nextNumber = sameTypeFields.length + 1;
    }
    const generatedLabel = `${draggingFromPalette.label} ${nextNumber}`;

    const newField = {
      id: `${draggingFromPalette.id}_${Date.now()}`,
      type: draggingFromPalette.id,
      label: generatedLabel,
      name: `${draggingFromPalette.id}_${Date.now()}`,
      page: fieldPage,
      x: Math.max(0, x),
      y: Math.max(0, fieldY),
      width: draggingFromPalette.width || 150,
      height: draggingFromPalette.height || 40,
      required: false,
      placeholder: '',
      helpText: '',
      validation: 'none',
      ...(signingTypes.has(draggingFromPalette.id) ? { recipient_id: defaultRecipientId } : {}),
      ...(draggingFromPalette.id === 'merge' && { 
        mergePattern: crmConnection?.object_name ? `{{${crmConnection.object_name}.Field}}` : '{{Object.Field}}', 
        mergeObject: crmConnection?.object_name || '', 
        mergeField: '',
        sourceType: crmConnection?.provider?.toUpperCase() === 'SALESFORCE' ? 'SALESFORCE' : 'CRM'
      }),
      ...(draggingFromPalette.id === 'label' && {
        text: 'Label Text',
        style: { fontSize: '12px', color: '#000000', fontWeight: 'normal' },
        isStatic: true
      }),
      ...(draggingFromPalette.id === 'signature' && { signatureSize: 'medium' }),
      ...(draggingFromPalette.id === 'text' && { fieldSubType: 'single-line', defaultValue: '', characterLimit: 100 }),
      ...(draggingFromPalette.id === 'checkbox' && { checkboxLabel: 'Check to agree', checked: false }),
      ...(draggingFromPalette.id === 'radio' && {
        radioOptions: ['Option 1', 'Option 2', 'Option 3'],
        selectedOption: '',
        radioLayout: 'vertical'
      })
    };

    const updatedFields = [...droppedFields, newField];
    setDroppedFields(updatedFields);
    setSelectedFieldId(newField.id);
    setDraggingFromPalette(null);
    syncToParent(updatedFields);
  };

  // ---- MOUSE-BASED DRAG (for repositioning existing fields) ----
  const handleFieldMouseDown = (e, field) => {
    if (isResizing) return;
    e.stopPropagation();
    e.preventDefault();

    const rect = pdfCanvasRef.current.getBoundingClientRect();
    const xInCanvas = (e.clientX - rect.left) / zoom;
    const yInCanvas = (e.clientY - rect.top) / zoom;

    setIsDragging(true);
    isDraggingRef.current = true;
    setDragFieldId(field.id);
    dragFieldIdRef.current = field.id;
    setSelectedFieldId(field.id);

    const offset = {
      x: xInCanvas - field.x,
      y: yInCanvas - field.y
    };
    setDragOffset(offset);
    dragOffsetRef.current = offset;
  };

  const handleMouseMove = useCallback((e) => {
    if (!pdfCanvasRef.current) return;

    if (isDraggingRef.current && dragFieldIdRef.current) {
      const rect = pdfCanvasRef.current.getBoundingClientRect();
      let newX = (e.clientX - rect.left) / zoom - dragOffsetRef.current.x;
      let newY = (e.clientY - rect.top) / zoom - dragOffsetRef.current.y;

      if (showGrid) {
        newX = snapToGrid(newX);
        newY = snapToGrid(newY);
      }

      const field = droppedFieldsRef.current.find(f => f.id === dragFieldIdRef.current);
      if (field) {
        const maxX = rect.width / zoom - field.width;
        const maxY = rect.height / zoom - field.height;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
      }

      setDroppedFields(prev => {
        const newFields = prev.map(f => {
          if (f.id !== dragFieldIdRef.current) return f;
          // In continuous mode, convert Y to page-relative coordinates
          if (viewMode === 'continuous' && isHtmlMode) {
            const offsets = pageOffsetsRef.current;
            let newPage = 1;
            let relativeY = newY;
            for (let i = offsets.length - 1; i >= 0; i--) {
              if (newY >= offsets[i]) {
                newPage = i + 1;
                relativeY = newY - offsets[i];
                break;
              }
            }
            return { ...f, x: newX, y: Math.max(0, relativeY), page: newPage };
          } else if (viewMode === 'continuous') {
            // PDF mode — use measured page offsets
            const offsets = pdfPageOffsetsRef.current;
            let newPage = 1;
            let relativeY = newY;
            for (let i = offsets.length - 1; i >= 0; i--) {
              if (newY >= offsets[i]) {
                newPage = i + 1;
                relativeY = newY - offsets[i];
                break;
              }
            }
            return { ...f, x: newX, y: Math.max(0, relativeY), page: newPage };
          }
          return { ...f, x: newX, y: newY };
        });
        droppedFieldsRef.current = newFields;
        return newFields;
      });
    }

    if (isResizingRef.current && resizeFieldIdRef.current) {
      const rect = pdfCanvasRef.current.getBoundingClientRect();
      const dx = (e.clientX - resizeStartRef.current.x) / zoom;
      const dy = (e.clientY - resizeStartRef.current.y) / zoom;
      let newW = Math.max(30, resizeStartRef.current.w + dx);
      let newH = Math.max(20, resizeStartRef.current.h + dy);

      if (showGrid) {
        newW = snapToGrid(newW);
        newH = snapToGrid(newH);
      }

      setDroppedFields(prev => {
        const newFields = prev.map(f =>
          f.id === resizeFieldIdRef.current
            ? { ...f, width: newW, height: newH }
            : f
        );
        droppedFieldsRef.current = newFields;
        return newFields;
      });
    }
  }, [zoom, showGrid]);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current || isResizingRef.current) {
      syncToParent(droppedFieldsRef.current);
    }

    setIsDragging(false);
    isDraggingRef.current = false;
    setDragFieldId(null);
    dragFieldIdRef.current = null;
    setIsResizing(false);
    isResizingRef.current = false;
    setResizeFieldId(null);
    resizeFieldIdRef.current = null;
  }, [syncToParent]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ---- RESIZE ----
  const handleResizeMouseDown = (e, field) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
    setResizeFieldId(field.id);
    resizeFieldIdRef.current = field.id;
    setResizeStart({ x: e.clientX, y: e.clientY, w: field.width, h: field.height });
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: field.width, h: field.height };
  };

  // ---- FIELD OPERATIONS ----
  const handleDuplicateField = (fieldId) => {
    const fieldToDuplicate = droppedFields.find(f => f.id === fieldId);
    if (!fieldToDuplicate) return;

    const baseTypeConfig = getFieldTypeConfig(fieldToDuplicate.type);
    const existingCount = droppedFields.filter(f => f.type === fieldToDuplicate.type).length;
    const generatedLabel = `${baseTypeConfig.label} ${existingCount + 1}`;

    const newField = {
      ...fieldToDuplicate,
      id: `${fieldToDuplicate.type}_${Date.now()}`,
      name: `${fieldToDuplicate.type}_${Date.now()}`,
      label: generatedLabel,
      x: fieldToDuplicate.x + 20,
      y: fieldToDuplicate.y + 20,
    };

    const updatedFields = [...droppedFields, newField];
    setDroppedFields(updatedFields);
    setSelectedFieldId(newField.id);
    syncToParent(updatedFields);
  };


  const handleDeleteField = (fieldId) => {
    const updatedFields = droppedFields.filter(f => f.id !== fieldId);
    setDroppedFields(updatedFields);
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    syncToParent(updatedFields);
  };

  const updateFieldProperty = (fieldId, key, value) => {
    updateFieldProperties(fieldId, { [key]: value });
  };

  const updateFieldProperties = (fieldId, updates) => {
    const updatedFields = droppedFields.map(f =>
      f.id === fieldId ? { ...f, ...updates } : f
    );
    setDroppedFields(updatedFields);
    syncToParent(updatedFields);
  };

  const handleLabelDoubleClick = (field) => {
    setEditingLabelId(field.id);
    setEditingLabelValue(field.label || field.text || '');
  };

  const handleLabelEditSave = () => {
    if (editingLabelId) {
      const field = droppedFields.find(f => f.id === editingLabelId);
      if (field) {
        let updatedFields;
        if (field.type === 'label') {
          updatedFields = droppedFields.map(f => f.id === editingLabelId ? { ...f, text: editingLabelValue } : f);
        } else {
          updatedFields = droppedFields.map(f => f.id === editingLabelId ? { ...f, label: editingLabelValue } : f);
        }
        setDroppedFields(updatedFields);
        syncToParent(updatedFields);
      }
    }
    setEditingLabelId(null);
    setEditingLabelValue('');
  };

  // In Scroll (continuous) mode, show ALL fields with Y positions offset by actual page offsets
  // In Page mode, show only the current page's fields
  const currentPageFields = useMemo(() => {
    if (viewMode === 'continuous') {
      return droppedFields.map(f => {
        const pageIdx = (f.page || 1) - 1;
        const offset = isHtmlMode
          ? (pageOffsets[pageIdx] || 0)
          : (pdfPageOffsets[pageIdx] || 0); // Use measured PDF page offsets
        return { ...f, _displayY: f.y + offset };
      });
    }
    return droppedFields.filter(f => f.page === currentPage).map(f => ({
      ...f,
      _displayY: f.y,
    }));
  }, [droppedFields, viewMode, currentPage, pageOffsets, pdfPageOffsets, isHtmlMode]);

  // Deselect on canvas click
  const handleCanvasClick = (e) => {
    if (e.target === pdfCanvasRef.current || e.target.closest('.react-pdf__Page')) {
      setSelectedFieldId(null);
    }
  };

  const [aiLoading, setAiLoading] = useState(false);

  const handleAiCommand = async (command) => {
    if (!command.trim()) return;
    
    try {
      setAiLoading(true);
      // Pass the current state to the AI for manipulation
      const result = await docflowService.aiVisualAssistant(
        command, 
        droppedFields, 
        numPages || 1
      );

      if (result.success && result.fields) {
        setDroppedFields(result.fields);
        syncToParent(result.fields);
        toast.success('Fields updated by AI');
      } else {
        toast.error(result.error || 'AI could not process instruction');
      }
    } catch (error) {
      console.error('Error in AI Assistant:', error);
      toast.error(error.message || 'AI Assistant is temporarily unavailable');
    } finally {
      setAiLoading(false);
      setAiCommand('');
    }
  };

  return (
    <div className="flex w-full gap-4 h-[calc(100vh-140px)] min-h-[700px] overflow-hidden">
      {/* Left Sidebar - Field Palette */}
      <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        
        {/* AI Assistant Command Bar */}
        {/* <div className="p-4 border-b border-gray-100 bg-indigo-50/50">
          <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> AI Assistant
          </label>
          <div className="relative">
            <input 
              type="text" 
              value={aiCommand}
              onChange={(e) => setAiCommand(e.target.value)}
              disabled={aiLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiCommand.trim() && !aiLoading) {
                  handleAiCommand(aiCommand);
                }
              }}
              placeholder={aiLoading ? "AI is thinking..." : "e.g. 'add signature'"}
              className={`w-full pl-2 pr-7 py-1.5 text-xs bg-white border rounded text-gray-800 focus:outline-none focus:ring-1 ${
                aiLoading ? 'border-gray-200 bg-gray-50' : 'border-indigo-200 placeholder-indigo-400 focus:ring-indigo-400'
              }`}
            />
            <button 
              onClick={() => {
                if (aiCommand.trim() && !aiLoading) handleAiCommand(aiCommand);
              }}
              disabled={aiLoading || !aiCommand.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </button>
          </div>
        </div> */}

        {/* Field Types */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-100 bg-white">
            <h3 className="font-semibold text-gray-900 text-sm">Field Types</h3>
            <p className="text-xs text-gray-500 mt-1">Drag onto document</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {FIELD_TYPES.map((fieldType) => {
              const Icon = fieldType.icon;
              return (
                <div
                  key={fieldType.id}
                  draggable
                  onDragStart={() => handlePaletteDragStart(fieldType)}
                  className="rounded-lg p-3 cursor-grab hover:shadow-md transition-all duration-150 flex items-center gap-2 border-2 active:cursor-grabbing"
                  style={{
                    backgroundColor: fieldType.bgColor,
                    borderColor: fieldType.borderColor,
                    color: fieldType.color
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium text-xs">{fieldType.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Placed Fields Summary */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-gray-200 bg-gray-50">
          <div className="p-4 border-b border-gray-200 bg-gray-100">
            <h4 className="font-semibold text-xs text-gray-700 uppercase tracking-wider">
              Placed ({droppedFields.length})
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {droppedFields.map((field) => {
              const config = getFieldTypeConfig(field.type);
              return (
                <div
                  key={field.id}
                  onClick={() => {
                    setSelectedFieldId(field.id);
                    if (field.page !== currentPage) setCurrentPage(field.page);
                  }}
                  className={`text-xs p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors border ${
                    selectedFieldId === field.id ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate flex-1 font-medium" style={{ color: config.color }}>
                    {field.type === 'label' ? (field.text || 'Label') : field.label} <span className="text-gray-400 font-normal ml-1">Pg {field.page}</span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                    className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0 p-1 rounded-md hover:bg-red-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Center - PDF Canvas */}
      <div className="flex-1 min-w-0 bg-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => { isManualZoom.current = true; setZoom(Math.max(0.5, zoom - 0.1)); }}
              className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4 text-gray-600" />
            </button>
            <span className="text-xs font-medium px-2 text-gray-700 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => { isManualZoom.current = true; setZoom(Math.min(2.0, zoom + 0.1)); }}
              className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4 text-gray-600" />
            </button>
            <div className="w-px h-5 bg-gray-200 mx-2" />
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-md transition-colors ${showGrid ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Toggle Grid Snap"
            >
              <Grid className="h-4 w-4" />
            </button>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <div data-testid="view-mode-toggle" className="flex bg-gray-100 rounded-md p-0.5">
              <button
                data-testid="view-mode-pagination"
                onClick={() => setViewMode('pagination')}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                  viewMode === 'pagination' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Page-by-page view"
              >
                Page
              </button>
              <button
                data-testid="view-mode-continuous"
                onClick={() => setViewMode('continuous')}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                  viewMode === 'continuous' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Continuous scroll view"
              >
                Scroll
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasPdf && onConvertToEditable && (
              <>
                {/* {hasBlocks ? (
                  editableMode ? (
                    <button
                      onClick={() => setEditableMode(false)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      data-testid="back-to-pdf-btn"
                    >
                      Back to PDF
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditableMode(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      data-testid="switch-to-editable-btn"
                    >
                      Editable Mode
                    </button>
                  )
                ) : (
                  <button
                    onClick={async () => {
                      setConvertingToEditable(true);
                      try {
                        await onConvertToEditable();
                        setEditableMode(true);
                      } catch (e) {
                        console.error('Conversion failed:', e);
                      } finally {
                        setConvertingToEditable(false);
                      }
                    }}
                    disabled={convertingToEditable}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    data-testid="convert-to-editable-btn"
                  >
                    {convertingToEditable ? 'Converting...' : 'Convert to Editable'}
                  </button>
                )} */}
                <div className="w-px h-5 bg-gray-200" />
              </>
            )}
            <div className={`flex items-center gap-1.5 ${viewMode === 'continuous' ? 'opacity-40 pointer-events-none' : ''}`}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-gray-50 rounded-md hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"
                data-testid="page-prev-btn"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-gray-500 min-w-[40px] text-center tabular-nums">
                {currentPage}/{numPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(numPages || 1, currentPage + 1))}
                disabled={currentPage === numPages}
                className="p-1.5 bg-gray-50 rounded-md hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"
                data-testid="page-next-btn"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Document Display — PDF or HTML Content */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto p-6 transition-colors duration-200 ${
            draggingFromPalette ? 'bg-indigo-50/50 ring-2 ring-inset ring-indigo-200/50' : ''
          }`}
          style={{ background: draggingFromPalette ? undefined : '#f3f4f6' }}
          onDragOver={handleDragOver}
          onDrop={handlePaletteDrop}
        >
          {draggingFromPalette && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl px-6 py-3 shadow-lg border border-indigo-200">
                <p className="text-sm font-medium text-indigo-600">Drop field here</p>
              </div>
            </div>
          )}
          {/* Canvas wrapper — CSS zoom adjusts both visual and layout size */}
          <div style={{ margin: '0 auto', width: 'fit-content' }}>
          <div
            ref={pdfCanvasRef}
            className="relative bg-white shadow-xl rounded-sm"
            onClick={handleCanvasClick}
            style={{
              zoom: zoom,
              cursor: isDragging ? 'grabbing' : 'default'
            }}
          >
            {/* PDF rendering — shown in preview mode, hidden when editable mode active */}
            {showPdf && (
              <div style={{ pointerEvents: 'none' }}>
                {convertingToEditable && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2 text-center" style={{ width: 800, pointerEvents: 'auto' }}>
                    <div className="animate-spin inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mb-2" />
                    <p className="text-sm text-blue-700 font-medium">Converting document to editable content...</p>
                  </div>
                )}
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={<div className="p-12 text-center text-gray-500">Loading PDF...</div>}
                >
                  {viewMode === 'continuous' ? (
                    Array.from({ length: numPages || 1 }, (_, i) => (
                      <div key={i + 1} className={i > 0 ? 'mt-4 border-t border-gray-200 pt-4' : ''}>
                        <Page
                          pageNumber={i + 1}
                          width={800}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onLoadSuccess={(page) => handlePdfPageLoad(i + 1, page)}
                        />
                      </div>
                    ))
                  ) : (
                    <Page
                      pageNumber={currentPage}
                      width={800}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  )}
                </Document>
              </div>
            )}
            {/* Non-PDF HTML content mode */}
            {isHtmlMode && (
              <DocumentContentEditor
                contentBlocks={contentBlocks}
                currentPage={viewMode === 'continuous' ? null : currentPage}
                onPageCountChange={handleContentPageCountChange}
                onPageOffsetsChange={handlePageOffsetsChange}
                onTextSelect={onTextSelect}
                onBlockChange={handleBlockChange}
                pageWidth={800}
                pageHeight={1100}
                highlightBlockId={highlightBlockId}
              />
            )}

            {/* Grid overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.06]"
                style={{
                  backgroundImage: `linear-gradient(to right, #6366F1 1px, transparent 1px), linear-gradient(to bottom, #6366F1 1px, transparent 1px)`,
                  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
                }}
              />
            )}

            {/* Render fields */}
            {currentPageFields.map((field) => {
              const config = getFieldTypeConfig(field.type);
              const isSelected = selectedFieldId === field.id;
              const isEditing = editingLabelId === field.id;

              return (
                <div
                  key={field.id}
                  className={`absolute group transition-all duration-150 ease-out ${isDragging && dragFieldId === field.id ? 'opacity-80 scale-[1.02]' : 'hover:shadow-lg'}`}
                  style={{
                    left: `${field.x}px`,
                    top: `${field._displayY}px`,
                    width: `${field.width}px`,
                    height: `${field.height}px`,
                    backgroundColor: config.bgColor,
                    border: `2px solid ${
                      isSelected
                        ? '#4F46E5'
                        : signingTypes.has(field.type)
                          ? getRecipientBorderColor(field.assigned_to || field.recipient_id)
                          : config.borderColor
                    }`,
                    borderRadius: '6px',
                    cursor: isDragging && dragFieldId === field.id ? 'grabbing' : 'grab',
                    pointerEvents: 'auto',
                    zIndex: isSelected ? 20 : 10,
                    boxShadow: isSelected
                      ? '0 0 0 2px rgba(79,70,229,0.3), 0 4px 12px rgba(0,0,0,0.1)'
                      : isDragging && dragFieldId === field.id
                        ? '0 8px 24px rgba(0,0,0,0.15)'
                        : 'none',
                    userSelect: 'none',
                    transform: isDragging && dragFieldId === field.id ? 'scale(1.02)' : 'scale(1)',
                  }}
                  onMouseDown={(e) => handleFieldMouseDown(e, field)}
                  onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                  onDoubleClick={() => handleLabelDoubleClick(field)}
                >
                  {/* Field Content */}
                  <div className="flex items-center justify-center h-full px-1 overflow-hidden">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingLabelValue}
                        onChange={(e) => setEditingLabelValue(e.target.value)}
                        onBlur={handleLabelEditSave}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleLabelEditSave(); if (e.key === 'Escape') { setEditingLabelId(null); } }}
                        className="w-full text-center text-xs bg-white border border-indigo-300 rounded px-1 py-0.5 outline-none"
                        style={{ color: config.color }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ) : field.type === 'checkbox' ? (
                      <div className="flex items-center gap-1.5 w-full px-1">
                        <input type="checkbox" checked={field.checked || false} readOnly className="w-3.5 h-3.5 rounded pointer-events-none flex-shrink-0" />
                        <span className="truncate text-xs" style={{ color: config.color }}>{field.checkboxLabel || 'Checkbox'}</span>
                      </div>
                    ) : field.type === 'radio' ? (
                      <div className={`w-full px-1 ${(field.radioLayout || 'vertical') === 'vertical' ? 'space-y-0.5' : 'flex gap-2 flex-wrap items-center'}`}>
                        {(field.radioOptions || ['Option 1', 'Option 2']).map((opt, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: config.color }}>
                              {field.selectedOption === opt && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />}
                            </div>
                            <span className="text-[10px] truncate" style={{ color: config.color }}>{opt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="truncate text-xs font-medium w-full px-1"
                        style={{
                          color: field.style?.color || config.color,
                          textAlign: (['label', 'text', 'merge'].includes(field.type) && field.style?.textAlign) ? field.style.textAlign : 'center',
                          ...((['label', 'text', 'merge'].includes(field.type) && field.style) ? {
                            fontFamily: field.style.fontFamily || undefined,
                            fontSize: field.style.fontSize ? `${field.style.fontSize}px` : undefined,
                            fontWeight: field.style.fontWeight || undefined,
                            fontStyle: field.style.fontStyle || undefined,
                            textDecoration: field.style.textDecoration || undefined,
                          } : {})
                        }}
                      >
                        {field.type === 'merge'
                          ? (field.mergePattern || '{{Object.Field}}')
                          : field.type === 'label'
                            ? (field.text || 'Label')
                            : signingTypes.has(field.type)
                              ? `${field.label}${getRecipientLabel(field.assigned_to || field.recipient_id) ? ` • ${getRecipientLabel(field.assigned_to || field.recipient_id)}` : ''}`
                              : field.label}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                    className="absolute -top-2.5 -right-2.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs shadow-md hover:bg-red-600"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    ×
                  </button>

                  {/* Required indicator */}
                  {field.required && (
                    <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" title="Required" />
                  )}

                  {/* Recipient assignment badge */}
                  {field.assigned_to && (() => {
                    const colors = getRecipientColor(field.assigned_to);
                    const rcpt = templateRecipients.find(r => r.id === field.assigned_to);
                    if (!colors || !rcpt) return null;
                    return (
                      <div
                        className={`absolute -bottom-2.5 left-1 px-1.5 py-0.5 rounded-full ${colors.bg} border ${colors.border} flex items-center gap-1 pointer-events-none`}
                        style={{ fontSize: '8px', lineHeight: '10px', zIndex: 15 }}
                        title={`Assigned to: ${rcpt.placeholder_name || rcpt.name}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                        <span className={`font-semibold ${colors.text} truncate max-w-[60px]`}>
                          {(rcpt.placeholder_name || rcpt.name || '').split(' ')[0]}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Resize handle */}
                  {isSelected && (
                    <div
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-500 rounded-sm cursor-se-resize border border-white shadow-sm"
                      onMouseDown={(e) => handleResizeMouseDown(e, field)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          </div>{/* Close zoom wrapper */}
        </div>
      </div>

      {/* Right Sidebar - Property Panel */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        {selectedField ? (
          <>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: getFieldTypeConfig(selectedField.type).bgColor }}>
              <div className="flex items-center gap-2">
                {React.createElement(getFieldTypeConfig(selectedField.type).icon, {
                  className: 'h-4 w-4',
                  style: { color: getFieldTypeConfig(selectedField.type).color }
                })}
                <h3 className="font-semibold text-sm" style={{ color: getFieldTypeConfig(selectedField.type).color }}>
                  {getFieldTypeConfig(selectedField.type).label} Properties
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDuplicateField(selectedField.id)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                  title="Duplicate Field"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteField(selectedField.id)}
                  className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
                  title="Delete Field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Label */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                <input
                  type="text"
                  value={selectedField.type === 'label' ? (selectedField.text || '') : (selectedField.label || '')}
                  onChange={(e) => {
                    if (selectedField.type === 'label') {
                      updateFieldProperty(selectedField.id, 'text', e.target.value);
                    } else {
                      updateFieldProperty(selectedField.id, 'label', e.target.value);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Required */}
              {selectedField.type !== 'label' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="field-required"
                    checked={selectedField.required || false}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'required', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="field-required" className="text-sm font-medium text-gray-700">Required</label>
                </div>
              )}

              {/* Assign to Recipient */}
              {selectedField.type !== 'label' && selectedField.type !== 'merge' && templateRecipients.length > 0 && (
                <div className="border-t border-gray-100 pt-3 mt-1" data-testid="field-assignment-section">
                  <label className="block text-xs font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-indigo-500" />
                    Assign to Recipient
                  </label>
                  <select
                    value={selectedField.assigned_to || ''}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'assigned_to', e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    data-testid="field-recipient-select"
                  >
                    <option value="">All recipients (no restriction)</option>
                    {templateRecipients.map((r, i) => {
                      const colors = RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
                      return (
                        <option key={r.id} value={r.id}>
                          {r.placeholder_name || r.name || `Recipient ${i + 1}`} — {r.role_type || 'SIGN'}
                        </option>
                      );
                    })}
                  </select>
                  {selectedField.assigned_to && (() => {
                    const assignedRcpt = templateRecipients.find(r => r.id === selectedField.assigned_to);
                    const colors = getRecipientColor(selectedField.assigned_to);
                    return assignedRcpt && colors ? (
                      <div className={`mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md ${colors.bg} border ${colors.border}`}>
                        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                        <span className={`text-xs font-medium ${colors.text}`}>
                          {assignedRcpt.placeholder_name || assignedRcpt.name}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Text Styling Controls — for Label, Text Input, and Merge Field */}
              {['label', 'text', 'merge'].includes(selectedField.type) && (
                <div className="border-t border-gray-100 pt-3 mt-1 space-y-3" data-testid="text-styling-section">
                  <label className="block text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    Text Styling
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Font Family</label>
                      <select
                        value={selectedField.style?.fontFamily || 'Arial'}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), fontFamily: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                        data-testid="field-font-family"
                      >
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Trebuchet MS">Trebuchet MS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Font Size</label>
                      <select
                        value={selectedField.style?.fontSize || '12'}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), fontSize: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                        data-testid="field-font-size"
                      >
                        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map(s => (
                          <option key={s} value={String(s)}>{s}px</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Weight / Style</label>
                      <div className="flex gap-1">
                        {[
                          { key: 'fontWeight', val: 'bold', label: 'B', title: 'Bold', active: (selectedField.style?.fontWeight || 'normal') === 'bold' },
                          { key: 'fontStyle', val: 'italic', label: 'I', title: 'Italic', active: (selectedField.style?.fontStyle || 'normal') === 'italic', italic: true },
                          { key: 'textDecoration', val: 'underline', label: 'U', title: 'Underline', active: (selectedField.style?.textDecoration || 'none') === 'underline', underline: true },
                        ].map(btn => (
                          <button
                            key={btn.key}
                            title={btn.title}
                            onClick={() => {
                              const current = selectedField.style?.[btn.key] || (btn.key === 'textDecoration' ? 'none' : 'normal');
                              const newVal = current === btn.val ? (btn.key === 'textDecoration' ? 'none' : 'normal') : btn.val;
                              updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), [btn.key]: newVal });
                            }}
                            className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                              btn.active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            data-testid={`field-style-${btn.key}`}
                          >
                            <span style={{ fontWeight: btn.key === 'fontWeight' ? 'bold' : undefined, fontStyle: btn.italic ? 'italic' : undefined, textDecoration: btn.underline ? 'underline' : undefined }}>
                              {btn.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Align</label>
                      <div className="flex gap-1">
                        {['left', 'center', 'right'].map(a => (
                          <button
                            key={a}
                            onClick={() => updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), textAlign: a })}
                            className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${
                              (selectedField.style?.textAlign || 'left') === a
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            data-testid={`field-align-${a}`}
                          >
                            {a === 'left' ? '⫷' : a === 'center' ? '⫿' : '⫸'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedField.style?.color || '#000000'}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), color: e.target.value })}
                        className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
                        data-testid="field-text-color"
                      />
                      <input
                        type="text"
                        value={selectedField.style?.color || '#000000'}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'style', { ...(selectedField.style || {}), color: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md font-mono"
                        data-testid="field-text-color-hex"
                      />
                    </div>
                  </div>
                </div>
              )}
              {/* Field Sub-Type (for text) */}
              {selectedField.type === 'text' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Field Type</label>
                  <select
                    value={selectedField.fieldSubType || 'single-line'}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'fieldSubType', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="single-line">Single-Line Text</option>
                    <option value="multi-line">Multi-Line Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="url">URL</option>
                  </select>
                </div>
              )}

              {/* Signature Size */}
              {selectedField.type === 'signature' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Signature Size</label>
                  <div className="flex gap-1">
                    {['small', 'medium', 'large'].map(size => (
                      <button
                        key={size}
                        onClick={() => updateFieldProperty(selectedField.id, 'signatureSize', size)}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                          (selectedField.signatureSize || 'medium') === size
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Merge Field Config */}
              {selectedField.type === 'merge' && (
                <>
                  {/* Source Label */}
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      crmConnection?.provider === 'salesforce' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {crmConnection?.provider === 'salesforce' ? 'Salesforce' : 'Internal CRM'}
                    </span>
                    <span className="text-[10px] text-gray-400">Source</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">CRM Object</label>
                    <SearchableSelect
                      options={(crmObjects || []).map(obj => ({
                        label: obj.object_label || obj.object_name,
                        value: obj.object_name
                      })).concat(
                        crmConnection?.object_name && !(crmObjects || []).find(o => o.object_name === crmConnection.object_name)
                          ? [{ label: crmConnection.object_name, value: crmConnection.object_name }]
                          : []
                      )}
                      value={selectedField.mergeObject || crmConnection?.object_name || ''}
                      onChange={(val) => {
                        updateFieldProperties(selectedField.id, {
                          mergeObject: val,
                          mergeField: '',
                          mergePattern: val ? `{{${val}.}}` : '{{Object.Field}}'
                        });
                      }}
                      placeholder="Select Object..."
                      disabled={!!crmConnection?.object_name}
                      data-testid="merge-object-select"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                      Field
                      {loadingDynamicFields && <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />}
                    </label>
                    <SearchableSelect
                      options={(dynamicFields[selectedField.mergeObject || crmConnection?.object_name] || []).map(fld => ({
                        label: fld.label || fld.api_name,
                        value: fld.api_name
                      }))}
                      value={selectedField.mergeField || ''}
                      onChange={(fld) => {
                        const obj = selectedField.mergeObject || crmConnection?.object_name;
                        const srcType = crmConnection?.provider?.toUpperCase() === 'SALESFORCE' ? 'SALESFORCE' : 'CRM';
                        const updates = { mergeField: fld, mergeObject: obj, sourceType: srcType };
                        if (obj && fld) {
                          updates.mergePattern = `{{${obj}.${fld}}}`;
                        }
                        updateFieldProperties(selectedField.id, updates);
                      }}
                      placeholder={loadingDynamicFields ? 'Loading fields...' : 'Select Field...'}
                      disabled={loadingDynamicFields || (!selectedField.mergeObject && !crmConnection?.object_name)}
                      data-testid="merge-field-select"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Merge Pattern</label>
                    <input
                      type="text"
                      value={selectedField.mergePattern || ''}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'mergePattern', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono"
                      placeholder="{{Object.Field}}"
                      disabled
                    />
                  </div>
                  {/* Fallback to Input Toggle */}
                  <div className="border-t border-gray-100 pt-2 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        data-testid="merge-fallback-toggle"
                        type="checkbox"
                        checked={selectedField.fallbackToInput || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'fallbackToInput', e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded"
                      />
                      <span className="text-xs font-medium text-gray-700">Convert to input if value is empty</span>
                    </label>
                    {selectedField.fallbackToInput && (
                      <div className="mt-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Input Type</label>
                        <SearchableSelect
                          options={[
                            { label: 'Text Field', value: 'text' },
                            { label: 'Date Picker', value: 'date' },
                            { label: 'Number Input', value: 'number' },
                            { label: 'Checkbox', value: 'checkbox' }
                          ]}
                          value={selectedField.fallbackInputType || 'text'}
                          onChange={(val) => updateFieldProperty(selectedField.id, 'fallbackInputType', val)}
                          placeholder="Select type..."
                          data-testid="merge-fallback-type"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Default Value */}
              {['text', 'date'].includes(selectedField.type) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Value</label>
                  <input
                    type={selectedField.type === 'date' ? 'date' : 'text'}
                    value={selectedField.defaultValue || ''}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'defaultValue', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Checkbox with Label Config */}
              {selectedField.type === 'checkbox' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Checkbox Label</label>
                  <input
                    data-testid="checkbox-label-input"
                    type="text"
                    value={selectedField.checkboxLabel || ''}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'checkboxLabel', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter checkbox label..."
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={selectedField.checked || false}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'checked', e.target.checked)}
                      className="w-3.5 h-3.5 text-indigo-600 rounded"
                    />
                    <span className="text-xs text-gray-500">Default checked</span>
                  </div>
                </div>
              )}

              {/* Radio Group Config */}
              {selectedField.type === 'radio' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Radio Options</label>
                  <div className="space-y-1.5">
                    {(selectedField.radioOptions || ['Option 1', 'Option 2']).map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`radio-preview-${selectedField.id}`}
                          checked={selectedField.selectedOption === opt}
                          onChange={() => updateFieldProperty(selectedField.id, 'selectedOption', opt)}
                          className="w-3 h-3 text-indigo-600"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOptions = [...(selectedField.radioOptions || [])];
                            newOptions[idx] = e.target.value;
                            updateFieldProperty(selectedField.id, 'radioOptions', newOptions);
                          }}
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500"
                        />
                        {(selectedField.radioOptions || []).length > 2 && (
                          <button
                            onClick={() => {
                              const newOptions = (selectedField.radioOptions || []).filter((_, i) => i !== idx);
                              updateFieldProperty(selectedField.id, 'radioOptions', newOptions);
                            }}
                            className="text-gray-400 hover:text-red-500 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    data-testid="add-radio-option-btn"
                    onClick={() => {
                      const newOptions = [...(selectedField.radioOptions || []), `Option ${(selectedField.radioOptions || []).length + 1}`];
                      updateFieldProperty(selectedField.id, 'radioOptions', newOptions);
                    }}
                    className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Add Option
                  </button>
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Layout</label>
                    <div className="flex gap-1">
                      {['vertical', 'horizontal'].map(layout => (
                        <button
                          key={layout}
                          onClick={() => updateFieldProperty(selectedField.id, 'radioLayout', layout)}
                          className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                            (selectedField.radioLayout || 'vertical') === layout
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {layout}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Placeholder */}
              {['text', 'date', 'signature', 'initials'].includes(selectedField.type) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Placeholder</label>
                  <input
                    type="text"
                    value={selectedField.placeholder || ''}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'placeholder', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter placeholder..."
                  />
                </div>
              )}

              {/* Character Limit */}
              {selectedField.type === 'text' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Character Limit</label>
                  <input
                    type="number"
                    value={selectedField.characterLimit || 100}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'characterLimit', parseInt(e.target.value) || 100)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    min="1"
                    max="5000"
                  />
                </div>
              )}

              {/* Validation */}
              {selectedField.type === 'text' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Validation</label>
                  <select
                    value={selectedField.validation || 'none'}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'validation', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="none">None</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone Number</option>
                    <option value="number">Number Only</option>
                    <option value="alphanumeric">Alphanumeric</option>
                    <option value="url">URL</option>
                  </select>
                </div>
              )}

              {/* Help Text */}
              {selectedField.type !== 'label' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Help Text</label>
                  <input
                    type="text"
                    value={selectedField.helpText || ''}
                    onChange={(e) => updateFieldProperty(selectedField.id, 'helpText', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    placeholder="Optional help text"
                  />
                </div>
              )}

              {/* Conditional Logic — for all field types */}
              {['checkbox', 'radio', 'text', 'date', 'signature', 'initials'].includes(selectedField.type) && (
                <div className="border-t border-gray-100 pt-3 mt-2" data-testid="conditional-logic-section">
                  <label className="block text-xs font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/></svg>
                    Conditional Logic
                  </label>
                  <p className="text-[10px] text-gray-400 mb-2">Show/hide fields based on this field's value</p>

                  {(selectedField.conditionalRules || []).map((rule, rIdx) => (
                    <div key={rIdx} className="bg-gray-50 rounded-md p-2.5 mb-2 border border-gray-200">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-500">IF</span>
                        <span className="flex-1 text-[10px] font-medium text-indigo-600">
                          {selectedField.type === 'checkbox' ? (rule.triggerValue ? 'Checked' : 'Unchecked') :
                           selectedField.type === 'radio' ? `= "${rule.triggerValue || ''}"` :
                           ['signature', 'initials'].includes(selectedField.type) ? (rule.triggerValue === 'filled' ? 'Is signed' : 'Is empty') :
                           selectedField.type === 'text' ? `${rule.triggerCondition === 'equals' ? `= "${rule.triggerValue}"` : rule.triggerCondition === 'contains' ? `contains "${rule.triggerValue}"` : rule.triggerCondition === 'empty' ? 'Is empty' : 'Has value'}` :
                           selectedField.type === 'date' ? (rule.triggerCondition === 'empty' ? 'Is empty' : 'Has value') :
                           `= "${rule.triggerValue || ''}"`}
                        </span>
                        <button
                          onClick={() => {
                            const newRules = (selectedField.conditionalRules || []).filter((_, i) => i !== rIdx);
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {selectedField.type === 'checkbox' && (
                        <select
                          value={rule.triggerValue ? 'true' : 'false'}
                          onChange={(e) => {
                            const newRules = [...(selectedField.conditionalRules || [])];
                            newRules[rIdx] = { ...rule, triggerValue: e.target.value === 'true' };
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded mb-1.5"
                        >
                          <option value="true">When checked</option>
                          <option value="false">When unchecked</option>
                        </select>
                      )}
                      {selectedField.type === 'radio' && (
                        <select
                          value={rule.triggerValue || ''}
                          onChange={(e) => {
                            const newRules = [...(selectedField.conditionalRules || [])];
                            newRules[rIdx] = { ...rule, triggerValue: e.target.value };
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded mb-1.5"
                        >
                          <option value="">Select option...</option>
                          {(selectedField.radioOptions || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      {selectedField.type === 'text' && (
                        <div className="space-y-1.5 mb-1.5">
                          <select
                            value={rule.triggerCondition || 'filled'}
                            onChange={(e) => {
                              const newRules = [...(selectedField.conditionalRules || [])];
                              newRules[rIdx] = { ...rule, triggerCondition: e.target.value, triggerValue: ['filled', 'empty'].includes(e.target.value) ? e.target.value : '' };
                              updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                            }}
                            className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded"
                          >
                            <option value="filled">Has value</option>
                            <option value="empty">Is empty</option>
                            <option value="equals">Equals</option>
                            <option value="contains">Contains</option>
                          </select>
                          {['equals', 'contains'].includes(rule.triggerCondition) && (
                            <input
                              type="text"
                              value={rule.triggerValue || ''}
                              onChange={(e) => {
                                const newRules = [...(selectedField.conditionalRules || [])];
                                newRules[rIdx] = { ...rule, triggerValue: e.target.value };
                                updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                              }}
                              placeholder="Enter value..."
                              className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded"
                            />
                          )}
                        </div>
                      )}
                      {selectedField.type === 'date' && (
                        <select
                          value={rule.triggerCondition || 'filled'}
                          onChange={(e) => {
                            const newRules = [...(selectedField.conditionalRules || [])];
                            newRules[rIdx] = { ...rule, triggerCondition: e.target.value, triggerValue: e.target.value };
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded mb-1.5"
                        >
                          <option value="filled">Has date</option>
                          <option value="empty">Is empty</option>
                        </select>
                      )}
                      {['signature', 'initials'].includes(selectedField.type) && (
                        <select
                          value={rule.triggerValue || 'filled'}
                          onChange={(e) => {
                            const newRules = [...(selectedField.conditionalRules || [])];
                            newRules[rIdx] = { ...rule, triggerValue: e.target.value };
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded mb-1.5"
                        >
                          <option value="filled">When signed</option>
                          <option value="empty">When empty</option>
                        </select>
                      )}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-500">THEN</span>
                        <select
                          value={rule.action || 'show'}
                          onChange={(e) => {
                            const newRules = [...(selectedField.conditionalRules || [])];
                            newRules[rIdx] = { ...rule, action: e.target.value };
                            updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                          }}
                          className="px-1.5 py-0.5 text-[10px] border border-gray-200 rounded"
                        >
                          <option value="show">Show</option>
                          <option value="hide">Hide</option>
                        </select>
                      </div>
                      <SearchableSelect
                        options={droppedFields.filter(f => f.id !== selectedField.id).map(f => ({
                          label: f.label || f.name || f.id,
                          value: f.id,
                        }))}
                        value={rule.targetFieldId || ''}
                        onChange={(val) => {
                          const newRules = [...(selectedField.conditionalRules || [])];
                          newRules[rIdx] = { ...rule, targetFieldId: val };
                          updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                        }}
                        placeholder="Select target field..."
                      />
                    </div>
                  ))}
                  <button
                    data-testid="add-condition-btn"
                    onClick={() => {
                      const newRule = {
                        triggerValue: selectedField.type === 'checkbox' ? true : ['signature', 'initials'].includes(selectedField.type) ? 'filled' : '',
                        triggerCondition: ['text', 'date'].includes(selectedField.type) ? 'filled' : undefined,
                        action: 'show',
                        targetFieldId: '',
                      };
                      const newRules = [...(selectedField.conditionalRules || []), newRule];
                      updateFieldProperty(selectedField.id, 'conditionalRules', newRules);
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Add Condition
                  </button>
                </div>
              )}

              {/* Position & Size */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Position & Size</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedField.x)}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'x', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedField.y)}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'y', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Width</label>
                    <input
                      type="number"
                      value={Math.round(selectedField.width)}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'width', parseInt(e.target.value) || 30)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                      min="30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Height</label>
                    <input
                      type="number"
                      value={Math.round(selectedField.height)}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'height', parseInt(e.target.value) || 20)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md"
                      min="20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <Maximize2 className="h-10 w-10 text-gray-300 mb-3" />
            <h3 className="text-sm font-semibold text-gray-500 mb-1">No Field Selected</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Click a field on the document to edit its properties, or drag a new field from the left panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiPageVisualBuilder;
