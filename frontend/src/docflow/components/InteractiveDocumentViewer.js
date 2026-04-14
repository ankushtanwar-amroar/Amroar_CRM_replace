import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { CheckCircle, Layers, ScrollText } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const InteractiveDocumentViewer = ({
  pdfUrl,
  fields = [],
  onFieldsChange,
  readOnly = false,
  showSignatureModal,
  externalFieldValues = {}  // Accept external field values (like signatures)
}) => {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fieldValues, setFieldValues] = useState({});
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState('page'); // 'page' or 'scroll'
  const [pdfPageHeights, setPdfPageHeights] = useState({});
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const PDF_WIDTH = 800;
  const PAGE_GAP = 16; // gap between pages in scroll mode

  // Memoize the file prop to prevent infinite reload loops in react-pdf
  const pdfFile = useMemo(() => ({ url: pdfUrl }), [pdfUrl]);

  // Sync with external field values (from parent component)
  useEffect(() => {
    if (Object.keys(externalFieldValues).length > 0) {
      setFieldValues(prev => ({ ...prev, ...externalFieldValues }));
    }
  }, [externalFieldValues]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    setPageSize({ width: page.width, height: page.height });
  };

  // Track individual page heights for scroll mode
  const handleScrollPageLoad = useCallback((pageNum, page) => {
    setPdfPageHeights(prev => {
      if (prev[pageNum] === page.height) return prev;
      return { ...prev, [pageNum]: page.height };
    });
  }, []);

  // Calculate cumulative offsets for scroll mode
  const scrollPageOffsets = useMemo(() => {
    if (!numPages) return [0];
    const offsets = [0];
    for (let i = 1; i < numPages; i++) {
      const prevHeight = pdfPageHeights[i] || pageSize.height || 1035;
      offsets.push(offsets[i - 1] + prevHeight + PAGE_GAP);
    }
    return offsets;
  }, [numPages, pdfPageHeights, pageSize.height]);

  const handleFieldChange = (fieldId, value) => {
    const newValues = { ...fieldValues, [fieldId]: value };
    setFieldValues(newValues);
    if (onFieldsChange) {
      onFieldsChange(newValues);
    }
  };

  // Evaluate conditional logic rules to determine which fields should be hidden
  const hiddenFieldIds = useMemo(() => {
    const hidden = new Set();
    fields.forEach(field => {
      if (field.conditionalLogic && field.conditionalLogic.rules && field.conditionalLogic.rules.length > 0) {
        const { rules, action } = field.conditionalLogic;
        const allMatch = rules.every(rule => {
          const sourceValue = fieldValues[rule.sourceFieldId] || '';
          switch (rule.condition) {
            case 'equals': return sourceValue === rule.value;
            case 'not_equals': return sourceValue !== rule.value;
            case 'contains': return sourceValue.includes(rule.value);
            case 'not_empty': return sourceValue !== '';
            case 'is_empty': return sourceValue === '';
            default: return false;
          }
        });
        if (action === 'show' && !allMatch) hidden.add(field.id);
        if (action === 'hide' && allMatch) hidden.add(field.id);
      }
    });
    return hidden;
  }, [fields, fieldValues]);

  const renderField = (field) => {
    const fieldValue = fieldValues[field.id] || externalFieldValues[field.id] || '';
    const isDisabled = readOnly || field.field_disabled;
    const disabledStyle = field.field_disabled ? 'opacity-60 cursor-not-allowed' : '';
    
    switch (field.type || field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={fieldValue}
            onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
            placeholder={field.defaultValue || field.label || 'Enter text...'}
            disabled={isDisabled}
            className={`w-full h-full px-2 py-1 text-sm border-2 border-blue-400 bg-blue-50 rounded focus:ring-2 focus:ring-blue-400 focus:border-transparent ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : ''}
            data-testid={`field-${field.id}`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={fieldValue}
            onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
            disabled={isDisabled}
            className={`w-full h-full px-2 py-1 text-sm border-2 border-green-400 bg-green-50 rounded focus:ring-2 focus:ring-green-400 focus:border-transparent ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : ''}
            data-testid={`field-${field.id}`}
          />
        );

      case 'checkbox':
        return (
          <div className={`flex items-center gap-2 w-full h-full px-2 ${disabledStyle}`} data-testid={`field-${field.id}`}>
            <input
              type="checkbox"
              checked={fieldValue === true || fieldValue === 'true'}
              onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.checked)}
              disabled={isDisabled}
              className="w-5 h-5 text-purple-600 rounded border-purple-400"
            />
            {field.label && <span className="text-xs text-gray-600">{field.label}</span>}
          </div>
        );

      case 'signature':
        return (
          <div 
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, false) : null}
            className={`w-full h-full border-2 ${field.field_disabled ? 'border-gray-300 bg-gray-50' : 'border-indigo-500'} rounded flex items-center justify-center ${!isDisabled ? 'cursor-pointer hover:bg-indigo-50' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click to sign'}
            data-testid={`field-${field.id}`}
          >
            {fieldValue ? (
              <img src={fieldValue} alt="Signature" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-500">
                {field.field_disabled ? 'Other recipient' : 'Click to sign'}
              </span>
            )}
          </div>
        );

      case 'initials':
        return (
          <div 
            onClick={!isDisabled ? () => showSignatureModal && showSignatureModal(field.id, true) : null}
            className={`w-full h-full border-2 ${field.field_disabled ? 'border-gray-300 bg-gray-50' : 'border-indigo-500'} rounded flex items-center justify-center ${!isDisabled ? 'cursor-pointer hover:bg-indigo-50' : ''} ${disabledStyle}`}
            title={field.field_disabled ? (field.field_hint || 'Assigned to another recipient') : 'Click for initials'}
            data-testid={`field-${field.id}`}
          >
            {fieldValue ? (
              <img src={fieldValue} alt="Initials" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-500">
                {field.field_disabled ? 'Other recipient' : 'Click for initials'}
              </span>
            )}
          </div>
        );

      case 'merge':
        const mergeObj = field.merge_object || field.mergeObject || '';
        const mergeField = field.merge_field || field.mergeField || '';
        const fullKey = `${mergeObj}.${mergeField}`;
        const crmValue = fieldValues[fullKey] || fieldValues[mergeField] || '';
        const userEnteredValue = fieldValue || fieldValues[`${field.id}_fallback`] || '';
        
        if (!crmValue && field.fallbackToInput) {
          const inputType = field.fallbackInputType || 'text';
          return (
            <div className="w-full h-full" data-testid={`field-${field.id}`}>
              {inputType === 'checkbox' ? (
                <div className="flex items-center gap-2 h-full px-2">
                  <input
                    type="checkbox"
                    checked={userEnteredValue === true || userEnteredValue === 'true'}
                    onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.checked)}
                    disabled={isDisabled}
                    className="w-4 h-4 text-orange-600 rounded border-orange-400"
                  />
                  <span className="text-xs text-gray-500">{field.label || mergeField}</span>
                </div>
              ) : (
                <input
                  type={inputType}
                  value={userEnteredValue}
                  onChange={(e) => !isDisabled && handleFieldChange(field.id, e.target.value)}
                  placeholder={field.defaultValue || field.label || mergeField || 'Enter value...'}
                  disabled={isDisabled}
                  className={`w-full h-full px-2 py-1 text-sm border-2 border-orange-400 bg-orange-50 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent ${disabledStyle}`}
                />
              )}
            </div>
          );
        }

        const displayValue = crmValue || userEnteredValue;
        return (
          <div className="w-full h-full px-2 py-1 border-2 border-orange-300 bg-orange-50 rounded flex items-center text-sm text-gray-700" data-testid={`field-${field.id}`}>
            {displayValue || field.mergePattern}
          </div>
        );

      case 'label':
        return (
          <div 
            className="w-full h-full px-2 py-1 flex items-center text-gray-900"
            style={{
              fontFamily: field.style?.fontFamily || undefined,
              fontSize: field.style?.fontSize ? `${field.style.fontSize}px` : '12px',
              fontWeight: field.style?.fontWeight || 'normal',
              textAlign: field.style?.textAlign || 'left',
              color: field.style?.color || '#000000',
              justifyContent: field.style?.textAlign === 'center' ? 'center' : field.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
            }}
          >
            {field.text || field.label || 'Static Text'}
          </div>
        );

      default:
        return (
          <div className="w-full h-full border-2 border-gray-300 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-500">
            {field.label}
          </div>
        );
    }
  };

  // Fields for current page (page mode)
  const currentPageFields = fields.filter(f => f.page === currentPage);

  // Render a single page with its overlaid fields
  const renderPageWithFields = (pageNum, yOffset = 0) => {
    const pageFields = fields.filter(f => f.page === pageNum);
    const pageHeight = pdfPageHeights[pageNum] || pageSize.height || 1035;

    return (
      <div
        key={pageNum}
        className="relative"
        style={{ width: `${PDF_WIDTH}px`, minHeight: `${pageHeight}px` }}
      >
        {/* PDF page — pointer-events disabled so fields above receive clicks */}
        <div style={{ pointerEvents: 'none' }}>
          <Page
            pageNumber={pageNum}
            width={PDF_WIDTH}
            onLoadSuccess={(page) => {
              if (pageNum === 1) onPageLoadSuccess(page);
              handleScrollPageLoad(pageNum, page);
            }}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </div>

        {/* Overlay interactive fields for this page */}
        {pageFields
          .filter(field => !hiddenFieldIds.has(field.id))
          .map((field) => (
            <div
              key={field.id}
              className="absolute"
              style={{
                left: `${field.x}px`,
                top: `${field.y}px`,
                width: `${field.width}px`,
                height: `${field.height}px`,
                pointerEvents: 'auto',
                zIndex: 10
              }}
            >
              {renderField(field)}
            </div>
          ))}
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Top bar: Navigation + View Toggle */}
      <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5" data-testid="view-mode-toggle">
            <button
              onClick={() => setViewMode('page')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'page'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="view-mode-page"
            >
              <Layers className="h-3.5 w-3.5" />
              Page
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'scroll'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="view-mode-scroll"
            >
              <ScrollText className="h-3.5 w-3.5" />
              Scroll
            </button>
          </div>

          {/* Page navigation (only in page mode) */}
          {viewMode === 'page' && (
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="prev-page-btn"
              >
                Previous
              </button>
              <span className="text-xs font-medium px-2 text-gray-600">
                Page {currentPage} of {numPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(numPages || 1, currentPage + 1))}
                disabled={currentPage === numPages}
                className="px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                data-testid="next-page-btn"
              >
                Next
              </button>
            </div>
          )}

          {/* Scroll mode page indicator */}
          {viewMode === 'scroll' && numPages && (
            <span className="text-xs text-gray-500 ml-2">
              {numPages} pages — scroll to navigate
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">Fill all fields to sign</span>
          </div>
        )}
      </div>

      {/* Document Display */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-6 bg-gray-100"
      >
        {viewMode === 'page' ? (
          /* ═══ PAGE MODE ═══ */
          <div className="flex justify-center">
            <div ref={containerRef} className="relative bg-white shadow-lg">
              <div style={{ pointerEvents: 'none' }}>
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => console.error('PDF load error:', error)}
                  loading={<div className="p-12 text-center text-gray-500">Loading document...</div>}
                  error={<div className="p-12 text-center text-red-500">Failed to load document. Please refresh the page.</div>}
                >
                  <Page
                    pageNumber={currentPage}
                    width={PDF_WIDTH}
                    onLoadSuccess={onPageLoadSuccess}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              </div>

              {/* Render interactive fields on current page */}
              {currentPageFields
                .filter(field => !hiddenFieldIds.has(field.id))
                .map((field) => (
                  <div
                    key={field.id}
                    className="absolute"
                    style={{
                      left: `${field.x}px`,
                      top: `${field.y}px`,
                      width: `${field.width}px`,
                      height: `${field.height}px`,
                      pointerEvents: 'auto',
                      zIndex: 10
                    }}
                  >
                    {renderField(field)}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          /* ═══ SCROLL MODE ═══ */
          <div className="flex justify-center">
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(error) => console.error('PDF load error:', error)}
              loading={<div className="p-12 text-center text-gray-500">Loading document...</div>}
              error={<div className="p-12 text-center text-red-500">Failed to load document. Please refresh the page.</div>}
            >
              <div className="space-y-4">
                {Array.from({ length: numPages || 1 }, (_, i) => (
                  <div key={i + 1} className="bg-white shadow-lg">
                    {renderPageWithFields(i + 1)}
                  </div>
                ))}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractiveDocumentViewer;
