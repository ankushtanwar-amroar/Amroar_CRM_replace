/**
 * File Manager Admin Setup Page
 * 9-tab configuration interface for File Manager administration
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';

// Icons
import {
  ArrowLeft,
  Settings,
  FileType,
  Tags,
  FolderOpen,
  Share2,
  Database,
  Zap,
  Bot,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  HardDrive,
  Cloud,
  Link,
  Lock,
  Eye,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ChevronRight,
} from 'lucide-react';

// Services
import fileManagerAdminService from '../services/fileManagerAdminService';

// ============================================================================
// TAB COMPONENTS
// ============================================================================

// TAB 1: General Settings
const GeneralSettingsTab = ({ settings, onSave, loading }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Module Settings
          </CardTitle>
          <CardDescription>Configure core File Manager behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Module Enabled</Label>
              <p className="text-sm text-slate-500">Enable or disable the File Manager module</p>
            </div>
            <Switch
              checked={localSettings?.module_enabled ?? true}
              onCheckedChange={(v) => handleChange('module_enabled', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Multi-Record Linking</Label>
              <p className="text-sm text-slate-500">Allow files to be linked to multiple CRM records</p>
            </div>
            <Switch
              checked={localSettings?.multi_record_linking ?? true}
              onCheckedChange={(v) => handleChange('multi_record_linking', v)}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Default Storage Mode</Label>
            <Select
              value={localSettings?.default_storage_mode || 'crm'}
              onValueChange={(v) => handleChange('default_storage_mode', v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="crm">CRM Storage</SelectItem>
                <SelectItem value="external">External Storage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Public Link Defaults
          </CardTitle>
          <CardDescription>Default settings for public file links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Expiry (Days)</Label>
              <Input
                type="number"
                value={localSettings?.default_public_link_expiry_days || 7}
                onChange={(e) => handleChange('default_public_link_expiry_days', parseInt(e.target.value))}
                min={1}
                max={365}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Password by Default</Label>
              <p className="text-sm text-slate-500">Public links require password</p>
            </div>
            <Switch
              checked={localSettings?.default_public_link_require_password ?? false}
              onCheckedChange={(v) => handleChange('default_public_link_require_password', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Download by Default</Label>
              <p className="text-sm text-slate-500">Allow file download from public links</p>
            </div>
            <Switch
              checked={localSettings?.default_public_link_allow_download ?? true}
              onCheckedChange={(v) => handleChange('default_public_link_allow_download', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure notification triggers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Notify on File Upload</Label>
            <Switch
              checked={localSettings?.notification_on_upload ?? true}
              onCheckedChange={(v) => handleChange('notification_on_upload', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Notify on File Share</Label>
            <Switch
              checked={localSettings?.notification_on_share ?? true}
              onCheckedChange={(v) => handleChange('notification_on_share', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Notify on Record Link</Label>
            <Switch
              checked={localSettings?.notification_on_link ?? false}
              onCheckedChange={(v) => handleChange('notification_on_link', v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
};

// TAB 2: File Types & Categories
const CategoriesTab = ({ categories, onRefresh, loading }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'file',
    color: '#6B7280',
    allowed_file_types: [],
    max_file_size_mb: null
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createCategory(formData);
      toast.success('Category created');
      setShowDialog(false);
      setFormData({ name: '', description: '', icon: 'file', color: '#6B7280', allowed_file_types: [], max_file_size_mb: null });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateCategory(editingCategory.id, formData);
      toast.success('Category updated');
      setEditingCategory(null);
      setFormData({ name: '', description: '', icon: 'file', color: '#6B7280', allowed_file_types: [], max_file_size_mb: null });
      onRefresh();
    } catch (err) {
      toast.error('Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await fileManagerAdminService.deleteCategory(id);
      toast.success('Category deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete category');
    }
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      description: cat.description || '',
      icon: cat.icon || 'file',
      color: cat.color || '#6B7280',
      allowed_file_types: cat.allowed_file_types || [],
      max_file_size_mb: cat.max_file_size_mb
    });
  };

  const iconOptions = ['file', 'file-text', 'file-check', 'receipt', 'bar-chart', 'presentation', 'image', 'table', 'folder', 'archive'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">File Categories</h3>
          <p className="text-sm text-slate-500">Organize files into categories with specific rules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {categories.map(cat => (
          <Card key={cat.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: cat.color + '20' }}
                  >
                    <FileType className="h-5 w-5" style={{ color: cat.color }} />
                  </div>
                  <div>
                    <p className="font-medium">{cat.name}</p>
                    <p className="text-sm text-slate-500">{cat.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cat.allowed_file_types?.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {cat.allowed_file_types.length} file types
                    </Badge>
                  )}
                  {cat.max_file_size_mb && (
                    <Badge variant="outline" className="text-xs">
                      Max {cat.max_file_size_mb}MB
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(cat.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {categories.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              No categories found. Create your first category to organize files.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showDialog || !!editingCategory} onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
          setEditingCategory(null);
          setFormData({ name: '', description: '', icon: 'file', color: '#6B7280', allowed_file_types: [], max_file_size_mb: null });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>Configure file category settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Category name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={formData.icon} onValueChange={(v) => setFormData(prev => ({ ...prev, icon: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {iconOptions.map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max File Size (MB)</Label>
              <Input
                type="number"
                value={formData.max_file_size_mb || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, max_file_size_mb: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="Leave empty for no limit"
              />
            </div>
            <div className="space-y-2">
              <Label>Allowed File Types</Label>
              <Input
                value={formData.allowed_file_types?.join(', ') || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  allowed_file_types: e.target.value ? e.target.value.split(',').map(s => s.trim()) : []
                }))}
                placeholder=".pdf, .docx, .xlsx (comma separated)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditingCategory(null); }}>
              Cancel
            </Button>
            <Button onClick={editingCategory ? handleUpdate : handleCreate} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// TAB 3: Tags & Metadata Rules
const TagsTab = ({ tagsConfig, onRefresh, loading }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [formData, setFormData] = useState({ name: '', color: '#6B7280', tag_type: 'user', description: '' });
  const [tagSettings, setTagSettings] = useState(tagsConfig?.settings || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTagSettings(tagsConfig?.settings || {});
  }, [tagsConfig]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createTag(formData);
      toast.success('Tag created');
      setShowDialog(false);
      setFormData({ name: '', color: '#6B7280', tag_type: 'user', description: '' });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateTag(editingTag.id, formData);
      toast.success('Tag updated');
      setEditingTag(null);
      setFormData({ name: '', color: '#6B7280', tag_type: 'user', description: '' });
      onRefresh();
    } catch (err) {
      toast.error('Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tag?')) return;
    try {
      await fileManagerAdminService.deleteTag(id);
      toast.success('Tag deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete tag');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fileManagerAdminService.updateTagSettings(tagSettings);
      toast.success('Tag settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  const openEdit = (tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color || '#6B7280',
      tag_type: tag.tag_type || 'user',
      description: tag.description || ''
    });
  };

  const tags = tagsConfig?.tags || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tag Settings</CardTitle>
          <CardDescription>Global configuration for file tags</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Freeform Tags</Label>
              <p className="text-sm text-slate-500">Users can create tags on the fly</p>
            </div>
            <Switch
              checked={tagSettings?.allow_freeform_tags ?? true}
              onCheckedChange={(v) => setTagSettings(prev => ({ ...prev, allow_freeform_tags: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Tag Validation</Label>
              <p className="text-sm text-slate-500">Enforce tag rules on upload</p>
            </div>
            <Switch
              checked={tagSettings?.tag_validation_enabled ?? false}
              onCheckedChange={(v) => setTagSettings(prev => ({ ...prev, tag_validation_enabled: v }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Tags Per File</Label>
            <Input
              type="number"
              value={tagSettings?.max_tags_per_file || 10}
              onChange={(e) => setTagSettings(prev => ({ ...prev, max_tags_per_file: parseInt(e.target.value) }))}
              className="w-24"
              min={1}
              max={50}
            />
          </div>
          <Button variant="outline" onClick={handleSaveSettings}>
            <Save className="h-4 w-4 mr-2" />
            Save Tag Settings
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Defined Tags</h3>
          <p className="text-sm text-slate-500">Manage predefined tags</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tag
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <div
            key={tag.id}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-full border"
            style={{ backgroundColor: tag.color + '15', borderColor: tag.color + '40' }}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
            <span className="text-sm font-medium">{tag.name}</span>
            <Badge variant="outline" className="text-xs">{tag.tag_type}</Badge>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => openEdit(tag)}
            >
              <Pencil className="h-3 w-3 text-slate-500" />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(tag.id)}
            >
              <Trash2 className="h-3 w-3 text-red-500" />
            </button>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-slate-500 text-sm">No tags defined yet.</p>
        )}
      </div>

      <Dialog open={showDialog || !!editingTag} onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
          setEditingTag(null);
          setFormData({ name: '', color: '#6B7280', tag_type: 'user', description: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Tag name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.tag_type} onValueChange={(v) => setFormData(prev => ({ ...prev, tag_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditingTag(null); }}>
              Cancel
            </Button>
            <Button onClick={editingTag ? handleUpdate : handleCreate} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingTag ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// TAB 4: Folders & Libraries
const LibrariesTab = ({ libraries, onRefresh, loading }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'folder',
    color: '#3B82F6',
    is_public: false,
    default_role: 'viewer',
    is_default: false
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createLibrary(formData);
      toast.success('Library created');
      setShowDialog(false);
      setFormData({ name: '', description: '', icon: 'folder', color: '#3B82F6', is_public: false, default_role: 'viewer', is_default: false });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create library');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateLibrary(editingLibrary.id, formData);
      toast.success('Library updated');
      setEditingLibrary(null);
      setFormData({ name: '', description: '', icon: 'folder', color: '#3B82F6', is_public: false, default_role: 'viewer', is_default: false });
      onRefresh();
    } catch (err) {
      toast.error('Failed to update library');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this library? This action cannot be undone.')) return;
    try {
      await fileManagerAdminService.deleteLibrary(id);
      toast.success('Library deleted');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete library');
    }
  };

  const openEdit = (lib) => {
    setEditingLibrary(lib);
    setFormData({
      name: lib.name,
      description: lib.description || '',
      icon: lib.icon || 'folder',
      color: lib.color || '#3B82F6',
      is_public: lib.is_public ?? false,
      default_role: lib.default_role || 'viewer',
      is_default: lib.is_default ?? false
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Libraries</h3>
          <p className="text-sm text-slate-500">Organize files into separate libraries with access control</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Library
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {libraries.map(lib => (
          <Card key={lib.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: lib.color + '20' }}
                  >
                    <FolderOpen className="h-6 w-6" style={{ color: lib.color }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{lib.name}</p>
                      {lib.is_default && <Badge className="bg-blue-100 text-blue-700 text-xs">Default</Badge>}
                      {lib.is_public ? (
                        <Badge variant="outline" className="text-xs text-green-600">Public</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-orange-600">Private</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{lib.description || 'No description'}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {lib.member_count || 0} members • {lib.file_count || 0} files • Default role: {lib.default_role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(lib)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!lib.is_default && (
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(lib.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {libraries.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              No libraries found. Create your first library to organize files.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showDialog || !!editingLibrary} onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
          setEditingLibrary(null);
          setFormData({ name: '', description: '', icon: 'folder', color: '#3B82F6', is_public: false, default_role: 'viewer', is_default: false });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLibrary ? 'Edit Library' : 'Create Library'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Library name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Public Library</Label>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_public: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Role for New Members</Label>
              <Select value={formData.default_role} onValueChange={(v) => setFormData(prev => ({ ...prev, default_role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditingLibrary(null); }}>
              Cancel
            </Button>
            <Button onClick={editingLibrary ? handleUpdate : handleCreate} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingLibrary ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// TAB 5: Sharing & Public Links
const SharingTab = ({ settings, onSave, loading }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Public Links
          </CardTitle>
          <CardDescription>Configure public link sharing options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Public Links Enabled</Label>
              <p className="text-sm text-slate-500">Allow creating public shareable links</p>
            </div>
            <Switch
              checked={localSettings?.public_links_enabled ?? true}
              onCheckedChange={(v) => handleChange('public_links_enabled', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Expiry Date</Label>
              <p className="text-sm text-slate-500">Public links must have an expiration</p>
            </div>
            <Switch
              checked={localSettings?.require_expiry ?? true}
              onCheckedChange={(v) => handleChange('require_expiry', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Maximum Expiry (Days)</Label>
              <Input
                type="number"
                value={localSettings?.max_expiry_days || 90}
                onChange={(e) => handleChange('max_expiry_days', parseInt(e.target.value))}
                min={1}
                max={365}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Expiry (Days)</Label>
              <Input
                type="number"
                value={localSettings?.default_expiry_days || 7}
                onChange={(e) => handleChange('default_expiry_days', parseInt(e.target.value))}
                min={1}
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Password</Label>
              <p className="text-sm text-slate-500">All public links require a password</p>
            </div>
            <Switch
              checked={localSettings?.require_password ?? false}
              onCheckedChange={(v) => handleChange('require_password', v)}
            />
          </div>
          {localSettings?.require_password && (
            <div className="space-y-2">
              <Label>Minimum Password Length</Label>
              <Input
                type="number"
                value={localSettings?.min_password_length || 6}
                onChange={(e) => handleChange('min_password_length', parseInt(e.target.value))}
                min={4}
                max={32}
                className="w-24"
              />
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Download by Default</Label>
              <p className="text-sm text-slate-500">Public links allow downloading files</p>
            </div>
            <Switch
              checked={localSettings?.allow_download_default ?? true}
              onCheckedChange={(v) => handleChange('allow_download_default', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Restricted Files Can Have Public Links</Label>
              <p className="text-sm text-slate-500">Allow public links for restricted sensitivity files</p>
            </div>
            <Switch
              checked={localSettings?.restricted_files_public_link_allowed ?? false}
              onCheckedChange={(v) => handleChange('restricted_files_public_link_allowed', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Internal Sharing
          </CardTitle>
          <CardDescription>Configure internal sharing options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Internal Sharing Enabled</Label>
              <p className="text-sm text-slate-500">Allow sharing files with other users</p>
            </div>
            <Switch
              checked={localSettings?.internal_sharing_enabled ?? true}
              onCheckedChange={(v) => handleChange('internal_sharing_enabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Share to Teams</Label>
              <p className="text-sm text-slate-500">Allow sharing files with entire teams</p>
            </div>
            <Switch
              checked={localSettings?.share_to_teams_enabled ?? true}
              onCheckedChange={(v) => handleChange('share_to_teams_enabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Share to Roles</Label>
              <p className="text-sm text-slate-500">Allow sharing files based on roles</p>
            </div>
            <Switch
              checked={localSettings?.share_to_roles_enabled ?? true}
              onCheckedChange={(v) => handleChange('share_to_roles_enabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Access Logging</Label>
              <p className="text-sm text-slate-500">Log all file access events</p>
            </div>
            <Switch
              checked={localSettings?.access_logging_enabled ?? true}
              onCheckedChange={(v) => handleChange('access_logging_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
};

// TAB 6: Storage & Connectors
const StorageTab = ({ storageConfig, onRefresh, loading }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    provider: 'local',
    bucket_name: '',
    region: '',
    root_path: '/',
    is_default: false
  });
  const [saving, setSaving] = useState(false);

  const connectors = storageConfig?.connectors || [];
  const settings = storageConfig?.settings || {};

  const handleCreate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createStorageConnector(formData);
      toast.success('Connector created');
      setShowDialog(false);
      setFormData({ name: '', provider: 'local', bucket_name: '', region: '', root_path: '/', is_default: false });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create connector');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this storage connector?')) return;
    try {
      await fileManagerAdminService.deleteStorageConnector(id);
      toast.success('Connector deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete connector');
    }
  };

  const getProviderIcon = (provider) => {
    switch (provider) {
      case 's3': return <Cloud className="h-5 w-5 text-orange-500" />;
      case 'google_drive': return <Cloud className="h-5 w-5 text-blue-500" />;
      default: return <HardDrive className="h-5 w-5 text-slate-500" />;
    }
  };

  const getProviderLabel = (provider) => {
    switch (provider) {
      case 's3': return 'Amazon S3';
      case 'google_drive': return 'Google Drive';
      default: return 'Local Storage';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Settings
          </CardTitle>
          <CardDescription>Configure default storage behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Storage Provider</Label>
            <Select value={settings.default_provider || 'local'} disabled>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local Storage</SelectItem>
                <SelectItem value="s3">Amazon S3</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">Storage providers are configured via connectors below</p>
          </div>
          <div className="space-y-2">
            <Label>Conflict Handling</Label>
            <Select value={settings.conflict_handling || 'rename'} disabled>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rename">Auto Rename</SelectItem>
                <SelectItem value="overwrite">Overwrite</SelectItem>
                <SelectItem value="error">Show Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Storage Connectors</h3>
          <p className="text-sm text-slate-500">Configure external storage integrations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connector
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {connectors.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <HardDrive className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Using local storage by default</p>
              <p className="text-sm text-slate-400 mt-1">Add a connector to integrate external storage</p>
            </CardContent>
          </Card>
        ) : (
          connectors.map(connector => (
            <Card key={connector.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      {getProviderIcon(connector.provider)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{connector.name}</p>
                        {connector.is_default && <Badge className="bg-blue-100 text-blue-700 text-xs">Default</Badge>}
                        {connector.status === 'configured' ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">{connector.status}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{getProviderLabel(connector.provider)}</p>
                      {connector.config?.bucket_name && (
                        <p className="text-xs text-slate-400">Bucket: {connector.config.bucket_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(connector.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Storage Connector</DialogTitle>
            <DialogDescription>Configure a new storage integration (mocked for demo)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Connector name"
              />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={formData.provider} onValueChange={(v) => setFormData(prev => ({ ...prev, provider: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Storage</SelectItem>
                  <SelectItem value="s3">Amazon S3</SelectItem>
                  <SelectItem value="google_drive">Google Drive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.provider === 's3' && (
              <>
                <div className="space-y-2">
                  <Label>Bucket Name</Label>
                  <Input
                    value={formData.bucket_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, bucket_name: e.target.value }))}
                    placeholder="my-bucket"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input
                    value={formData.region}
                    onChange={(e) => setFormData(prev => ({ ...prev, region: e.target.value }))}
                    placeholder="us-east-1"
                  />
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <Label>Set as Default</Label>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_default: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// TAB 7: Automation & Endpoints
const AutomationTab = ({ rules, onRefresh, loading }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    trigger: { type: 'file_uploaded' },
    conditions: [],
    actions: [{ type: 'apply_tag', params: { tag_name: '' } }]
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createAutomationRule(formData);
      toast.success('Rule created');
      setShowDialog(false);
      setFormData({
        name: '',
        description: '',
        is_active: true,
        trigger: { type: 'file_uploaded' },
        conditions: [],
        actions: [{ type: 'apply_tag', params: { tag_name: '' } }]
      });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this automation rule?')) return;
    try {
      await fileManagerAdminService.deleteAutomationRule(id);
      toast.success('Rule deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggle = async (rule) => {
    try {
      await fileManagerAdminService.updateAutomationRule(rule.id, { is_active: !rule.is_active });
      toast.success(`Rule ${rule.is_active ? 'disabled' : 'enabled'}`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to update rule');
    }
  };

  const handleCreateTemplates = async () => {
    try {
      const result = await fileManagerAdminService.createDefaultAutomationTemplates();
      toast.success(`Created ${result.templates?.length || 0} templates`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to create templates');
    }
  };

  const triggerTypes = [
    { value: 'file_uploaded', label: 'File Uploaded' },
    { value: 'file_downloaded', label: 'File Downloaded' },
    { value: 'file_shared', label: 'File Shared' },
    { value: 'file_linked', label: 'File Linked to Record' },
    { value: 'public_link_created', label: 'Public Link Created' },
    { value: 'public_link_expiring', label: 'Public Link Expiring' }
  ];

  const actionTypes = [
    { value: 'apply_tag', label: 'Apply Tag' },
    { value: 'set_sensitivity', label: 'Set Sensitivity' },
    { value: 'move_to_folder', label: 'Move to Folder' },
    { value: 'notify_owner', label: 'Notify Owner' },
    { value: 'send_email', label: 'Send Email' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Automation Rules</h3>
          <p className="text-sm text-slate-500">Automate file management workflows</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCreateTemplates}>
            <Zap className="h-4 w-4 mr-2" />
            Add Templates
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <Card key={rule.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.is_active ? 'bg-green-100' : 'bg-slate-100'}`}>
                    <Zap className={`h-5 w-5 ${rule.is_active ? 'text-green-600' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{rule.name}</p>
                      {rule.is_template && <Badge variant="outline" className="text-xs">Template</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">{rule.description || 'No description'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        Trigger: {rule.trigger?.type?.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {rule.actions?.length || 0} actions
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(rule.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Zap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No automation rules configured</p>
              <p className="text-sm text-slate-400 mt-1">Create rules or add templates to automate file workflows</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Automation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Rule name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select
                value={formData.trigger.type}
                onValueChange={(v) => setFormData(prev => ({ ...prev, trigger: { type: v } }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={formData.actions[0]?.type || 'apply_tag'}
                onValueChange={(v) => setFormData(prev => ({
                  ...prev,
                  actions: [{ type: v, params: {} }]
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actionTypes.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// TAB 8: AI Assistant
const AITab = ({ settings, onSave, loading }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant Settings
          </CardTitle>
          <CardDescription>Configure AI-powered file management features (MOCKED)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">AI Features Are Mocked</p>
              <p className="text-sm text-yellow-700">
                The AI auto-tagging feature is currently using rule-based suggestions. 
                Real AI integration is planned for a future release.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>AI Features Enabled</Label>
              <p className="text-sm text-slate-500">Enable AI-powered assistance</p>
            </div>
            <Switch
              checked={localSettings?.ai_enabled ?? true}
              onCheckedChange={(v) => handleChange('ai_enabled', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Tag on Upload</Label>
              <p className="text-sm text-slate-500">Automatically suggest tags for uploaded files</p>
            </div>
            <Switch
              checked={localSettings?.auto_tag_enabled ?? true}
              onCheckedChange={(v) => handleChange('auto_tag_enabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Sensitivity Detection</Label>
              <p className="text-sm text-slate-500">Detect and flag sensitive content</p>
            </div>
            <Switch
              checked={localSettings?.sensitivity_detection_enabled ?? false}
              onCheckedChange={(v) => handleChange('sensitivity_detection_enabled', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Content Analysis</Label>
              <p className="text-sm text-slate-500">Analyze file content for insights</p>
            </div>
            <Switch
              checked={localSettings?.content_analysis_enabled ?? false}
              onCheckedChange={(v) => handleChange('content_analysis_enabled', v)}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Confidence Threshold</Label>
            <p className="text-sm text-slate-500">Minimum confidence for AI suggestions (0.0 - 1.0)</p>
            <Input
              type="number"
              value={localSettings?.confidence_threshold || 0.7}
              onChange={(e) => handleChange('confidence_threshold', parseFloat(e.target.value))}
              min={0}
              max={1}
              step={0.1}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label>Max Suggestions</Label>
            <p className="text-sm text-slate-500">Maximum number of AI suggestions to show</p>
            <Input
              type="number"
              value={localSettings?.max_suggestions || 5}
              onChange={(e) => handleChange('max_suggestions', parseInt(e.target.value))}
              min={1}
              max={20}
              className="w-24"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>AI Logging</Label>
              <p className="text-sm text-slate-500">Log AI decisions for review</p>
            </div>
            <Switch
              checked={localSettings?.ai_logging_enabled ?? true}
              onCheckedChange={(v) => handleChange('ai_logging_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
};

// TAB 9: Audit & Retention
const AuditTab = ({ auditSettings, retentionPolicies, onRefresh, onSaveSettings, loading }) => {
  const [localSettings, setLocalSettings] = useState(auditSettings);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    description: '',
    retention_days: 365,
    action: 'archive',
    legal_hold: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalSettings(auditSettings);
  }, [auditSettings]);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleEventToggle = (event, enabled) => {
    setLocalSettings(prev => ({
      ...prev,
      audit_events_enabled: {
        ...prev.audit_events_enabled,
        [event]: enabled
      }
    }));
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
  };

  const handleCreatePolicy = async () => {
    setSaving(true);
    try {
      await fileManagerAdminService.createRetentionPolicy(policyForm);
      toast.success('Policy created');
      setShowPolicyDialog(false);
      setPolicyForm({ name: '', description: '', retention_days: 365, action: 'archive', legal_hold: false });
      onRefresh();
    } catch (err) {
      toast.error('Failed to create policy');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async (id) => {
    if (!window.confirm('Delete this retention policy?')) return;
    try {
      await fileManagerAdminService.deleteRetentionPolicy(id);
      toast.success('Policy deleted');
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete policy');
    }
  };

  const auditEvents = [
    { key: 'file_uploaded', label: 'File Uploaded' },
    { key: 'file_downloaded', label: 'File Downloaded' },
    { key: 'file_deleted', label: 'File Deleted' },
    { key: 'file_shared', label: 'File Shared' },
    { key: 'file_linked', label: 'File Linked' },
    { key: 'version_created', label: 'Version Created' },
    { key: 'public_link_created', label: 'Public Link Created' },
    { key: 'public_link_accessed', label: 'Public Link Accessed' },
    { key: 'metadata_updated', label: 'Metadata Updated' }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Audit Logging
          </CardTitle>
          <CardDescription>Configure which events are logged for compliance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {auditEvents.map(event => (
              <div key={event.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <Label className="text-sm">{event.label}</Label>
                <Switch
                  checked={localSettings?.audit_events_enabled?.[event.key] ?? true}
                  onCheckedChange={(v) => handleEventToggle(event.key, v)}
                />
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Audit Export Enabled</Label>
              <p className="text-sm text-slate-500">Allow exporting audit logs</p>
            </div>
            <Switch
              checked={localSettings?.audit_export_enabled ?? true}
              onCheckedChange={(v) => handleChange('audit_export_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Retention Settings
          </CardTitle>
          <CardDescription>Configure data retention policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Retention Policies Enabled</Label>
              <p className="text-sm text-slate-500">Automatically archive or delete old files</p>
            </div>
            <Switch
              checked={localSettings?.retention_enabled ?? false}
              onCheckedChange={(v) => handleChange('retention_enabled', v)}
            />
          </div>
          {localSettings?.retention_enabled && (
            <div className="space-y-2">
              <Label>Default Retention (Days)</Label>
              <Input
                type="number"
                value={localSettings?.default_retention_days || 365}
                onChange={(e) => handleChange('default_retention_days', parseInt(e.target.value))}
                min={30}
                className="w-32"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Audit Settings
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Retention Policies</h3>
          <p className="text-sm text-slate-500">Define retention rules for different file types</p>
        </div>
        <Button size="sm" onClick={() => setShowPolicyDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Policy
        </Button>
      </div>

      <div className="grid gap-4">
        {retentionPolicies.map(policy => (
          <Card key={policy.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{policy.name}</p>
                    {policy.legal_hold && (
                      <Badge className="bg-red-100 text-red-700 text-xs">Legal Hold</Badge>
                    )}
                    <Badge variant="outline" className="text-xs capitalize">{policy.action}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{policy.description || 'No description'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Retention: {policy.retention_days} days
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeletePolicy(policy.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {retentionPolicies.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-slate-500">
              No retention policies defined. Files will be retained indefinitely.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Retention Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={policyForm.name}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Policy name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={policyForm.description}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label>Retention Period (Days)</Label>
              <Input
                type="number"
                value={policyForm.retention_days}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, retention_days: parseInt(e.target.value) }))}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={policyForm.action} onValueChange={(v) => setPolicyForm(prev => ({ ...prev, action: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archive">Archive</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Legal Hold</Label>
                <p className="text-xs text-slate-500">Prevent deletion regardless of retention</p>
              </div>
              <Switch
                checked={policyForm.legal_hold}
                onCheckedChange={(v) => setPolicyForm(prev => ({ ...prev, legal_hold: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPolicyDialog(false)}>Cancel</Button>
            <Button onClick={handleCreatePolicy} disabled={saving || !policyForm.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

const FileManagerAdminPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State for all tabs
  const [generalSettings, setGeneralSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const [tagsConfig, setTagsConfig] = useState({ tags: [], settings: {} });
  const [libraries, setLibraries] = useState([]);
  const [sharingSettings, setSharingSettings] = useState({});
  const [storageConfig, setStorageConfig] = useState({ connectors: [], settings: {} });
  const [automationRules, setAutomationRules] = useState([]);
  const [aiSettings, setAISettings] = useState({});
  const [auditSettings, setAuditSettings] = useState({});
  const [retentionPolicies, setRetentionPolicies] = useState([]);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'categories', label: 'Categories', icon: FileType },
    { id: 'tags', label: 'Tags', icon: Tags },
    { id: 'libraries', label: 'Libraries', icon: FolderOpen },
    { id: 'sharing', label: 'Sharing', icon: Share2 },
    { id: 'storage', label: 'Storage', icon: Database },
    { id: 'automation', label: 'Automation', icon: Zap },
    { id: 'ai', label: 'AI Assistant', icon: Bot },
    { id: 'audit', label: 'Audit', icon: Shield }
  ];

  // Load data for active tab
  const loadTabData = async (tab) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'general':
          const genRes = await fileManagerAdminService.getGeneralSettings();
          setGeneralSettings(genRes.settings);
          break;
        case 'categories':
          const catRes = await fileManagerAdminService.getCategories();
          setCategories(catRes.categories);
          break;
        case 'tags':
          const tagRes = await fileManagerAdminService.getTagsConfig();
          setTagsConfig(tagRes);
          break;
        case 'libraries':
          const libRes = await fileManagerAdminService.getLibraries();
          setLibraries(libRes.libraries);
          break;
        case 'sharing':
          const shareRes = await fileManagerAdminService.getSharingSettings();
          setSharingSettings(shareRes.settings);
          break;
        case 'storage':
          const storRes = await fileManagerAdminService.getStorageConfig();
          setStorageConfig(storRes);
          break;
        case 'automation':
          const autoRes = await fileManagerAdminService.getAutomationRules();
          setAutomationRules(autoRes.rules);
          break;
        case 'ai':
          const aiRes = await fileManagerAdminService.getAISettings();
          setAISettings(aiRes.settings);
          break;
        case 'audit':
          const [auditRes, retRes] = await Promise.all([
            fileManagerAdminService.getAuditSettings(),
            fileManagerAdminService.getRetentionPolicies()
          ]);
          setAuditSettings(auditRes.settings);
          setRetentionPolicies(retRes.policies);
          break;
      }
    } catch (err) {
      console.error('Failed to load tab data:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  // Save handlers
  const handleSaveGeneralSettings = async (settings) => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateGeneralSettings(settings);
      setGeneralSettings(settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSharingSettings = async (settings) => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateSharingSettings(settings);
      setSharingSettings(settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAISettings = async (settings) => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateAISettings(settings);
      setAISettings(settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAuditSettings = async (settings) => {
    setSaving(true);
    try {
      await fileManagerAdminService.updateAuditSettings(settings);
      setAuditSettings(settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettingsTab settings={generalSettings} onSave={handleSaveGeneralSettings} loading={saving} />;
      case 'categories':
        return <CategoriesTab categories={categories} onRefresh={() => loadTabData('categories')} loading={loading} />;
      case 'tags':
        return <TagsTab tagsConfig={tagsConfig} onRefresh={() => loadTabData('tags')} loading={loading} />;
      case 'libraries':
        return <LibrariesTab libraries={libraries} onRefresh={() => loadTabData('libraries')} loading={loading} />;
      case 'sharing':
        return <SharingTab settings={sharingSettings} onSave={handleSaveSharingSettings} loading={saving} />;
      case 'storage':
        return <StorageTab storageConfig={storageConfig} onRefresh={() => loadTabData('storage')} loading={loading} />;
      case 'automation':
        return <AutomationTab rules={automationRules} onRefresh={() => loadTabData('automation')} loading={loading} />;
      case 'ai':
        return <AITab settings={aiSettings} onSave={handleSaveAISettings} loading={saving} />;
      case 'audit':
        return (
          <AuditTab
            auditSettings={auditSettings}
            retentionPolicies={retentionPolicies}
            onRefresh={() => loadTabData('audit')}
            onSaveSettings={handleSaveAuditSettings}
            loading={saving}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="file-manager-admin-page">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/setup')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Setup
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <FolderOpen className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">File Manager Setup</h1>
                <p className="text-xs text-slate-500">Configure document management settings</p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/files')}>
            <Eye className="h-4 w-4 mr-2" />
            View File Manager
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Left Sidebar - Tabs */}
        <aside className="w-56 bg-white border-r min-h-[calc(100vh-73px)]">
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Configuration</p>
            <nav className="space-y-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    data-testid={`tab-${tab.id}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {activeTab === tab.id && <ChevronRight className="h-4 w-4 ml-auto" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl">
            {loading && activeTab !== 'general' ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              renderTabContent()
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default FileManagerAdminPage;
