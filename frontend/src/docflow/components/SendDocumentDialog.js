import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';

const SendDocumentDialog = ({ templateId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    crm_object_type: 'opportunity',
    crm_object_id: '',
    recipient_email: '',
    recipient_name: ''
  });
  const [crmRecords, setCrmRecords] = useState([]);

  useEffect(() => {
    loadCrmRecords();
  }, [formData.crm_object_type]);

  const loadCrmRecords = async () => {
    // Mock CRM records for demo
    // In production, fetch from actual CRM API
    setCrmRecords([
      { id: '1', name: 'Acme Corp - $50,000 Deal' },
      { id: '2', name: 'TechStart Inc - $35,000 Deal' },
      { id: '3', name: 'Global Systems - $120,000 Deal' }
    ]);
  };

  const handleSend = async () => {
    if (!formData.crm_object_id) {
      toast.error('Please select a CRM record');
      return;
    }
    if (!formData.recipient_email) {
      toast.error('Please enter recipient email');
      return;
    }
    if (!formData.recipient_name) {
      toast.error('Please enter recipient name');
      return;
    }

    try {
      setLoading(true);
      const result = await docflowService.sendTemplateManually(
        templateId,
        formData
      );
      
      if (result.success) {
        toast.success('Document sent successfully!');
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.message || 'Failed to send document');
      }
    } catch (error) {
      console.error('Error sending document:', error);
      toast.error('Failed to send document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Send Document</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CRM Object Type
            </label>
            <select
              value={formData.crm_object_type}
              onChange={(e) => setFormData({ ...formData, crm_object_type: e.target.value, crm_object_id: '' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="opportunity">Opportunity</option>
              <option value="account">Account</option>
              <option value="lead">Lead</option>
              <option value="order">Order</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Record
            </label>
            <select
              value={formData.crm_object_id}
              onChange={(e) => setFormData({ ...formData, crm_object_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose a record...</option>
              {crmRecords.map(record => (
                <option key={record.id} value={record.id}>{record.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient Name
            </label>
            <input
              type="text"
              value={formData.recipient_name}
              onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient Email
            </label>
            <input
              type="email"
              value={formData.recipient_email}
              onChange={(e) => setFormData({ ...formData, recipient_email: e.target.value })}
              placeholder="john@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
          >
            <Send className="h-4 w-4" />
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendDocumentDialog;
