import React, { useState } from 'react';
import { Plus, Upload, Globe, Database, FileText, Trash2, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { chatbotService } from '../services/chatbotService';

const KnowledgeSourceManager = ({ botId, sources, onUpdate }) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [sourceType, setSourceType] = useState('website');
  const [sourceName, setSourceName] = useState('');
  const [sourceConfig, setSourceConfig] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleAddSource = async () => {
    if (!sourceName.trim()) {
      toast.error('Please enter a source name');
      return;
    }

    try {
      const newSource = await chatbotService.addKnowledgeSource(botId, sourceType, sourceName, sourceConfig);
      toast.success('Knowledge source added successfully');
      onUpdate([...sources, newSource]);
      setShowAddDialog(false);
      resetForm();
    } catch (error) {
      console.error('Error adding source:', error);
      toast.error('Failed to add knowledge source');
    }
  };

  const handleFileUpload = async (file) => {
    try {
      setUploading(true);
      const newSource = await chatbotService.uploadKnowledgeFile(botId, file);
      toast.success('File uploaded successfully');
      onUpdate([...sources, newSource]);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleReindex = async (sourceId) => {
    try {
      await chatbotService.reindexKnowledgeSource(botId, sourceId);
      toast.success('Reindexing started');
      // Update source status
      const updatedSources = sources.map(s => 
        s.id === sourceId ? { ...s, index_status: 'indexing' } : s
      );
      onUpdate(updatedSources);
    } catch (error) {
      console.error('Error reindexing:', error);
      toast.error('Failed to start reindexing');
    }
  };

  const handleDelete = async (sourceId) => {
    if (!window.confirm('Are you sure you want to delete this knowledge source?')) return;
    
    try {
      await chatbotService.deleteKnowledgeSource(botId, sourceId);
      toast.success('Knowledge source deleted');
      onUpdate(sources.filter(s => s.id !== sourceId));
    } catch (error) {
      console.error('Error deleting source:', error);
      toast.error('Failed to delete knowledge source');
    }
  };

  const resetForm = () => {
    setSourceName('');
    setSourceConfig({});
    setSourceType('website');
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      indexing: 'bg-blue-100 text-blue-800',
      indexed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Add Source Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setSourceType('website');
            setShowAddDialog(true);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Globe className="h-4 w-4" />
          Website URL
        </button>
        <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
          <Upload className="h-4 w-4" />
          Upload Files
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt"
            onChange={(e) => {
              if (e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
        </label>
        <button
          onClick={() => {
            setSourceType('crm_object');
            setShowAddDialog(true);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Database className="h-4 w-4" />
          CRM Objects
        </button>
        <button
          onClick={() => {
            setSourceType('faq');
            setShowAddDialog(true);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <FileText className="h-4 w-4" />
          FAQ
        </button>
      </div>

      {/* Sources List */}
      {sources && sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="font-medium text-sm">{source.name}</div>
                <div className="text-xs text-gray-500">
                  {source.type} • {source.document_count || 0} documents
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(source.index_status)}
                <button
                  onClick={() => handleReindex(source.id)}
                  className="p-2 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                  title="Reindex"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(source.id)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Source Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add {sourceType.replace('_', ' ')} Source</h3>
              <button onClick={() => { setShowAddDialog(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g., Company Website"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {sourceType === 'website' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input
                    type="url"
                    value={sourceConfig.url || ''}
                    onChange={(e) => setSourceConfig({ ...sourceConfig, url: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              )}

              {sourceType === 'crm_object' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Object Type</label>
                  <select
                    value={sourceConfig.object_type || 'lead'}
                    onChange={(e) => setSourceConfig({ ...sourceConfig, object_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="lead">Lead</option>
                    <option value="contact">Contact</option>
                    <option value="account">Account</option>
                    <option value="opportunity">Opportunity</option>
                  </select>
                </div>
              )}

              {sourceType === 'faq' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FAQ Content</label>
                  <textarea
                    value={sourceConfig.content || ''}
                    onChange={(e) => setSourceConfig({ ...sourceConfig, content: e.target.value })}
                    placeholder="Q: Question here?\nA: Answer here..."
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddSource}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Add Source
              </button>
              <button
                onClick={() => { setShowAddDialog(false); resetForm(); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Uploading file...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeSourceManager;
