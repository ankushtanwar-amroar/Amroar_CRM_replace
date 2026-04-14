import React from 'react';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';

/**
 * ValidationResultsModal
 * Displays validation errors and warnings in a modal dialog
 */
const ValidationResultsModal = ({ isOpen, onClose, validationResult, flowName }) => {
  if (!isOpen) return null;

  const { is_valid, error_count, warning_count, errors, warnings } = validationResult || {};

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'structural':
        return <AlertCircle className="h-4 w-4" />;
      case 'variable':
        return <Info className="h-4 w-4" />;
      case 'metadata':
        return <AlertTriangle className="h-4 w-4" />;
      case 'action':
        return <AlertTriangle className="h-4 w-4" />;
      case 'permission':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'structural':
        return 'text-red-600 bg-red-50';
      case 'variable':
        return 'text-blue-600 bg-blue-50';
      case 'metadata':
        return 'text-orange-600 bg-orange-50';
      case 'action':
        return 'text-purple-600 bg-purple-50';
      case 'permission':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${is_valid ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {is_valid ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-600" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {is_valid ? 'Validation Passed' : 'Validation Failed'}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {flowName || 'Flow'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-slate-50 border-b">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-red-600">{error_count || 0}</span>
              <span className="text-sm text-slate-600">Errors</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-600">{warning_count || 0}</span>
              <span className="text-sm text-slate-600">Warnings</span>
            </div>
          </div>
        </div>

        {/* Results Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {is_valid && error_count === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-900 mb-2">
                Flow is ready to activate!
              </p>
              <p className="text-sm text-slate-600">
                No validation errors found. You can safely activate this flow.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Errors */}
              {errors && errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Errors ({errors.length})
                  </h3>
                  <div className="space-y-2">
                    {errors.map((error, index) => (
                      <div
                        key={index}
                        className="border border-red-200 rounded-lg p-4 bg-red-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded ${getCategoryColor(error.category)}`}>
                            {getCategoryIcon(error.category)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                {error.category}
                              </span>
                              {error.node_label && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-xs text-slate-600">
                                    Node: {error.node_label}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-900 mb-1">
                              {error.message}
                            </p>
                            {error.details && (
                              <p className="text-xs text-slate-600">
                                {error.details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {warnings && warnings.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-yellow-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Warnings ({warnings.length})
                  </h3>
                  <div className="space-y-2">
                    {warnings.map((warning, index) => (
                      <div
                        key={index}
                        className="border border-yellow-200 rounded-lg p-4 bg-yellow-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded ${getCategoryColor(warning.category)}`}>
                            {getCategoryIcon(warning.category)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                {warning.category}
                              </span>
                              {warning.node_label && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-xs text-slate-600">
                                    Node: {warning.node_label}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-900 mb-1">
                              {warning.message}
                            </p>
                            {warning.details && (
                              <p className="text-xs text-slate-600">
                                {warning.details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-end gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-slate-300"
          >
            Close
          </Button>
          {is_valid && (
            <Button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700"
            >
              Proceed to Activate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationResultsModal;
