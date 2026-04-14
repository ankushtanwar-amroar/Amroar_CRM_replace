import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Search, Mail, Copy, Trash2, Edit, FolderOpen,
  MoreVertical, FileText, Clock, Sparkles
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import EmailTemplateEditor from './components/EmailTemplateEditor';

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    subject: '',
    description: '',
    email_type: 'rich',
    related_object: null
  });

  useEffect(() => {
    fetchTemplates();
    fetchFolders();
  }, [selectedFolder]);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = selectedFolder ? { folder: selectedFolder } : {};
      const res = await axios.get(`${API}/api/email-templates/templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setTemplates(res.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/api/email-templates/folders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFolders(res.data.folders || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.subject) {
      toast.error('Name and subject are required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/api/email-templates/templates`, newTemplate, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Template created');
      setShowCreateDialog(false);
      setNewTemplate({ name: '', subject: '', description: '', email_type: 'rich', related_object: null });
      
      // Open editor for new template
      const templateRes = await axios.get(`${API}/api/email-templates/templates/${res.data.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedTemplate(templateRes.data);
      setShowEditor(true);
      fetchTemplates();
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    }
  };

  const handleDuplicateTemplate = async (templateId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/email-templates/templates/${templateId}/duplicate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Template duplicated');
      fetchTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Failed to duplicate template');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/email-templates/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleEditTemplate = async (template) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/api/email-templates/templates/${template.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedTemplate(res.data);
      setShowEditor(true);
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (showEditor) {
    return (
      <EmailTemplateEditor
        template={selectedTemplate}
        onClose={() => {
          setShowEditor(false);
          setSelectedTemplate(null);
          fetchTemplates();
        }}
        onSave={(updatedTemplate) => {
          setSelectedTemplate(updatedTemplate);
          fetchTemplates();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Mail className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Email Templates</h1>
                <p className="text-sm text-slate-500">Create and manage sales email templates</p>
              </div>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Folders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <Button
                  variant={selectedFolder === null ? 'secondary' : 'ghost'}
                  className="w-full justify-start h-9"
                  onClick={() => setSelectedFolder(null)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  All Templates
                  <Badge variant="outline" className="ml-auto">{templates.length}</Badge>
                </Button>
                {folders.map(folder => (
                  <Button
                    key={folder}
                    variant={selectedFolder === folder ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-9"
                    onClick={() => setSelectedFolder(folder)}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {folder}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Templates Grid */}
            {loading ? (
              <div className="text-center py-12 text-slate-500">Loading templates...</div>
            ) : filteredTemplates.length === 0 ? (
              <Card className="py-12">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No templates yet</h3>
                  <p className="text-slate-500 mb-4">Create your first email template to get started</p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <h3 className="font-medium text-slate-900 group-hover:text-indigo-600">
                            {template.name}
                          </h3>
                          <p className="text-sm text-slate-500 truncate mt-1">{template.subject}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicateTemplate(template.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {template.email_type === 'rich' ? 'HTML' : 'Plain Text'}
                          </Badge>
                          {template.related_object && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {template.related_object}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {new Date(template.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Email Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Template Name *</Label>
              <Input
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="e.g., Follow-up Email"
              />
            </div>
            <div>
              <Label>Subject Line *</Label>
              <Input
                value={newTemplate.subject}
                onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                placeholder="e.g., Following up on our conversation"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Brief description of when to use this template"
                rows={2}
              />
            </div>
            <div>
              <Label>Email Type</Label>
              <Select
                value={newTemplate.email_type}
                onValueChange={(value) => setNewTemplate({ ...newTemplate, email_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rich">Rich (HTML)</SelectItem>
                  <SelectItem value="plain">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Object (for merge fields)</Label>
              <Select
                value={newTemplate.related_object || ''}
                onValueChange={(value) => setNewTemplate({ ...newTemplate, related_object: value || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select object..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="opportunity">Opportunity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTemplate} className="bg-indigo-600 hover:bg-indigo-700">
                <Sparkles className="h-4 w-4 mr-2" />
                Create & Edit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
