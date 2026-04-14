import React, { useState } from 'react';
import { Plus, Trash2, Edit, X, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

const IntentBuilder = ({ intents = [], onUpdate }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingIntent, setEditingIntent] = useState(null);
  const [intentData, setIntentData] = useState({
    name: '',
    example_phrases: [''],
    response_strategy: 'knowledge',
    response_config: {},
    confidence_threshold: 0.7,
    enabled: true
  });

  const handleOpenDialog = (intent = null) => {
    if (intent) {
      setEditingIntent(intent);
      setIntentData(intent);
    } else {
      setEditingIntent(null);
      setIntentData({
        name: '',
        example_phrases: [''],
        response_strategy: 'knowledge',
        response_config: {},
        confidence_threshold: 0.7,
        enabled: true
      });
    }
    setShowDialog(true);
  };

  const handleSaveIntent = () => {
    if (!intentData.name.trim()) {
      toast.error('Please enter an intent name');
      return;
    }

    const filteredPhrases = intentData.example_phrases.filter(p => p.trim());
    if (filteredPhrases.length === 0) {
      toast.error('Please add at least one example phrase');
      return;
    }

    const newIntent = {
      ...intentData,
      id: editingIntent?.id || `intent_${Date.now()}`,
      example_phrases: filteredPhrases
    };

    if (editingIntent) {
      const updatedIntents = intents.map(i => i.id === editingIntent.id ? newIntent : i);
      onUpdate(updatedIntents);
      toast.success('Intent updated');
    } else {
      onUpdate([...intents, newIntent]);
      toast.success('Intent added');
    }

    setShowDialog(false);
  };

  const handleDeleteIntent = (intentId) => {
    if (!window.confirm('Are you sure you want to delete this intent?')) return;
    onUpdate(intents.filter(i => i.id !== intentId));
    toast.success('Intent deleted');
  };

  const handleAddPhrase = () => {
    setIntentData({
      ...intentData,
      example_phrases: [...intentData.example_phrases, '']
    });
  };

  const handleUpdatePhrase = (index, value) => {
    const newPhrases = [...intentData.example_phrases];
    newPhrases[index] = value;
    setIntentData({ ...intentData, example_phrases: newPhrases });
  };

  const handleRemovePhrase = (index) => {
    const newPhrases = intentData.example_phrases.filter((_, i) => i !== index);
    setIntentData({ ...intentData, example_phrases: newPhrases });
  };

  const getStrategyBadge = (strategy) => {
    const styles = {
      knowledge: 'bg-blue-100 text-blue-800',
      crm_action: 'bg-green-100 text-green-800',
      escalate: 'bg-orange-100 text-orange-800',
      collect_details: 'bg-purple-100 text-purple-800'
    };
    const labels = {
      knowledge: 'Answer using Knowledge',
      crm_action: 'Execute CRM Action',
      escalate: 'Escalate to Human',
      collect_details: 'Collect Details'
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[strategy]}`}>
        {labels[strategy]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Add Intent Button */}
      <button
        onClick={() => handleOpenDialog()}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        Add Intent
      </button>

      {/* Intents List */}
      {intents.length > 0 ? (
        <div className="space-y-3">
          {intents.map((intent) => (
            <div key={intent.id} className="p-4 border border-gray-200 rounded-lg bg-white">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">{intent.name}</h4>
                    {!intent.enabled && (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">Disabled</span>
                    )}
                  </div>
                  <div className="mb-2">{getStrategyBadge(intent.response_strategy)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenDialog(intent)}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteIntent(intent.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <div className="font-medium mb-1">Example Phrases ({intent.example_phrases?.length || 0}):</div>
                <div className="space-y-1">
                  {intent.example_phrases?.slice(0, 3).map((phrase, idx) => (
                    <div key={idx} className="text-gray-500">• {phrase}</div>
                  ))}
                  {intent.example_phrases?.length > 3 && (
                    <div className="text-gray-400 text-xs">+{intent.example_phrases.length - 3} more</div>
                  )}
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-500">
                Confidence threshold: {Math.round(intent.confidence_threshold * 100)}%
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-600 mb-3">No intents configured yet</p>
        </div>
      )}

      {/* Intent Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editingIntent ? 'Edit Intent' : 'Add New Intent'}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Intent Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intent Name *</label>
                <input
                  type="text"
                  value={intentData.name}
                  onChange={(e) => setIntentData({ ...intentData, name: e.target.value })}
                  placeholder="e.g., Check Order Status"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Example Phrases */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Example Phrases *</label>
                <div className="space-y-2">
                  {intentData.example_phrases.map((phrase, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) => handleUpdatePhrase(index, e.target.value)}
                        placeholder="What the user might say..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                      {intentData.example_phrases.length > 1 && (
                        <button
                          onClick={() => handleRemovePhrase(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddPhrase}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    + Add Another Phrase
                  </button>
                </div>
              </div>

              {/* Response Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Response Strategy *</label>
                <select
                  value={intentData.response_strategy}
                  onChange={(e) => setIntentData({ ...intentData, response_strategy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="knowledge">Answer using Knowledge</option>
                  <option value="crm_action">Execute CRM Action</option>
                  <option value="escalate">Escalate to Human</option>
                  <option value="collect_details">Collect Details</option>
                </select>
              </div>

              {/* CRM Action Config */}
              {intentData.response_strategy === 'crm_action' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CRM Action</label>
                  <input
                    type="text"
                    value={intentData.response_config?.action || ''}
                    onChange={(e) => setIntentData({
                      ...intentData,
                      response_config: { ...intentData.response_config, action: e.target.value }
                    })}
                    placeholder="e.g., create_lead, update_contact"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              {/* Confidence Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confidence Threshold: {Math.round(intentData.confidence_threshold * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(intentData.confidence_threshold * 100)}
                  onChange={(e) => setIntentData({ ...intentData, confidence_threshold: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Low (0%)</span>
                  <span>High (100%)</span>
                </div>
              </div>

              {/* Enabled Toggle */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={intentData.enabled}
                    onChange={(e) => setIntentData({ ...intentData, enabled: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Intent Enabled</span>
                </label>
              </div>
            </div>

            {/* Dialog Actions */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSaveIntent}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Save className="h-4 w-4" />
                {editingIntent ? 'Update Intent' : 'Add Intent'}
              </button>
              <button
                onClick={() => setShowDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntentBuilder;
