import React from 'react';
import { Plus, Trash2, ArrowUpDown } from 'lucide-react';

const roleOptions = [
  { value: 'signer', label: 'Signer' },
  { value: 'approver', label: 'Approver' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'witness', label: 'Witness' },
];

const routingModes = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
];

const newRecipient = (idx = 0) => {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `rcpt_${Date.now()}_${idx}`;
  return {
    id,
    placeholder_name: `Signer ${idx + 1}`,
    routing_order: idx + 1,
    is_required: true,
    assigned_field_ids: [],
  };
};

const RecipientsRoutingTab = ({ templateData, fieldPlacements = [], onUpdate }) => {
  const recipients = templateData?.recipients || [];
  const routing_mode = templateData?.routing_mode || 'sequential';

  const updateRecipient = (recipientId, updates) => {
    const next = recipients.map(r => (r.id === recipientId ? { ...r, ...updates } : r));
    onUpdate({ recipients: next });
  };

  const toggleComponentAssignment = (recipientId, fieldId) => {
    const recipient = recipients.find(r => r.id === recipientId);
    if (!recipient) return;

    const currentIds = recipient.assigned_field_ids || [];
    const nextIds = currentIds.includes(fieldId)
      ? currentIds.filter(id => id !== fieldId)
      : [...currentIds, fieldId];

    updateRecipient(recipientId, { assigned_field_ids: nextIds });
  };

  const removeRecipient = (recipientId) => {
    const next = recipients.filter(r => r.id !== recipientId);
    onUpdate({ recipients: next });
  };

  const addRecipient = () => {
    const next = [...recipients, newRecipient(recipients.length)];
    onUpdate({ recipients: next });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Routing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Routing Mode</label>
            <select
              value={routing_mode}
              onChange={(e) => onUpdate({ routing_mode: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            >
              {routingModes.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 flex items-start gap-2">
            <ArrowUpDown className="h-4 w-4 mt-0.5 text-indigo-600" />
            <div>
              {routing_mode === 'sequential'
                ? 'Recipients sign one-by-one. Next recipient can sign after the previous completes.'
                : 'All required recipients can sign at the same time. Routing order is informational.'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recipients</h3>
          <button
            onClick={addRecipient}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Recipient
          </button>
        </div>

        {recipients.length === 0 ? (
          <div className="text-sm text-gray-500">Add at least one signer recipient to enable e-signing fields.</div>
        ) : (
          <div className="space-y-4">
            {recipients.map((r, idx) => (
              <div key={r.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder / Name</label>
                        <input
                          value={r.placeholder_name || ''}
                          onChange={(e) => updateRecipient(r.id, { placeholder_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Routing Order</label>
                        <input
                          type="number"
                          min={1}
                          value={r.routing_order || idx + 1}
                          onChange={(e) => updateRecipient(r.id, { routing_order: parseInt(e.target.value || '1', 10) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>



                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!!r.is_required}
                        onChange={(e) => updateRecipient(r.id, { is_required: e.target.checked })}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-800">Required Signer</div>
                        <div className="text-xs text-gray-600">This recipient must complete all assigned fields.</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeRecipient(r.id)}
                    disabled={recipients.length <= 1}
                    className={`p-2 rounded-lg transition-colors ${
                      recipients.length <= 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-200 text-red-600 hover:bg-red-50'
                    }`}
                    title="Remove recipient"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipientsRoutingTab;

