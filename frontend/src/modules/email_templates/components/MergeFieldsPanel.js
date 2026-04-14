import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Copy, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MergeFieldsPanel({ relatedObject, onInsert, onClose }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchMergeFields();
  }, [relatedObject]);

  const fetchMergeFields = async () => {
    try {
      const token = localStorage.getItem('token');
      const objectType = relatedObject || 'lead';
      const res = await axios.get(`${API}/api/email-templates/merge-fields/${objectType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFields(res.data.fields || []);
    } catch (error) {
      console.error('Error fetching merge fields:', error);
      // Set default fields
      setFields([
        { name: 'FirstName', label: 'First Name' },
        { name: 'LastName', label: 'Last Name' },
        { name: 'Email', label: 'Email' },
        { name: 'Company', label: 'Company' },
        { name: 'Title', label: 'Title' },
        { name: 'Phone', label: 'Phone' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredFields = fields.filter(f =>
    f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const copyMergeTag = async (field) => {
    const tag = `{{${field.name}}}`;
    try {
      await navigator.clipboard.writeText(tag);
      toast.success(`Copied ${tag}`);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="w-72 bg-white border-l flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-medium">Merge Fields</h3>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : filteredFields.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No fields found</div>
        ) : (
          <div className="space-y-2">
            {filteredFields.map((field) => (
              <div
                key={field.name}
                className="group flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer"
                onClick={() => onInsert(field)}
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{field.label}</p>
                  <p className="text-xs text-slate-400 font-mono">{`{{${field.name}}}`}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyMergeTag(field);
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-slate-50">
        <p className="text-xs text-slate-500">
          Click a field to insert at cursor, or click the copy icon to copy the merge tag.
        </p>
      </div>
    </div>
  );
}
