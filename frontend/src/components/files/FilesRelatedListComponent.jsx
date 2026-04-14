/**
 * FilesRelatedListComponent - CRM-Native File Management Related List
 * 
 * This component provides a Files section on ALL record pages, functioning
 * as a core CRM capability similar to Salesforce Files.
 * 
 * Features:
 * - Drag & drop upload
 * - Paste screenshot
 * - Link existing files (if enabled)
 * - Filter by Category/Tag/Sensitivity
 * - Version history
 * - Multi-record linking (configurable)
 * 
 * Uses FileRecordLink model - does NOT duplicate files per record.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  File,
  Upload,
  Link2,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Download,
  Share2,
  Eye,
  History,
  Tag,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  FileCode,
  Film,
  Music,
  Archive,
  FileSpreadsheet,
  Loader2,
  Plus,
  X,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../components/ui/dropdown-menu';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL;

// Get auth header
const getAuthHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

// File type icons
const getFileIcon = (mimeType) => {
  if (!mimeType) return File;
  const type = mimeType.split('/')[0];
  const subtype = mimeType.split('/')[1];
  
  if (type === 'image') return ImageIcon;
  if (type === 'video') return Film;
  if (type === 'audio') return Music;
  if (subtype === 'pdf') return FileText;
  if (subtype?.includes('spreadsheet') || subtype?.includes('excel')) return FileSpreadsheet;
  if (subtype?.includes('zip') || subtype?.includes('archive')) return Archive;
  if (type === 'text' || subtype?.includes('javascript') || subtype?.includes('json')) return FileCode;
  
  return File;
};

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format date
const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Upload Modal with drag & drop, paste, and metadata
 */
const UploadModal = ({ 
  isOpen, 
  onClose, 
  objectName, 
  recordId, 
  categories, 
  onUploadComplete 
}) => {
  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({
    name: '',
    description: '',
    category_id: ''
  });
  const [uploading, setUploading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Handle file selection
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    if (selectedFiles.length === 1) {
      setMetadata(prev => ({ ...prev, name: selectedFiles[0].name }));
    }
  };

  // Handle drag & drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
      if (droppedFiles.length === 1) {
        setMetadata(prev => ({ ...prev, name: droppedFiles[0].name }));
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.add('border-blue-400', 'bg-blue-50');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
  };

  // Handle paste (for screenshots)
  useEffect(() => {
    const handlePaste = (e) => {
      if (!isOpen) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const filename = `screenshot_${Date.now()}.png`;
            const file = new window.File([blob], filename, { type: blob.type });
            setFiles([file]);
            setMetadata(prev => ({ ...prev, name: filename }));
            toast.success('Screenshot pasted');
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // AI Auto-tag
  const handleAutoTag = async () => {
    if (!files.length) return;
    
    setLoadingAI(true);
    try {
      const response = await axios.post(
        `${API}/api/files/ai/suggest?filename=${encodeURIComponent(files[0].name)}&mime_type=${encodeURIComponent(files[0].type)}`,
        {},
        { headers: getAuthHeader() }
      );
      
      const suggestions = response.data;
      setAiSuggestions(suggestions);
      
      if (suggestions.suggested_category_id) {
        setMetadata(prev => ({ ...prev, category_id: suggestions.suggested_category_id }));
      }
      
      toast.success('AI suggestions applied');
    } catch (error) {
      console.error('AI suggestion error:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  // Upload handler
  const handleUpload = async () => {
    if (!files.length) return;
    
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', metadata.name || file.name);
        if (metadata.description) formData.append('description', metadata.description);
        if (metadata.category_id) formData.append('category_id', metadata.category_id);
        formData.append('record_id', recordId);
        formData.append('object_name', objectName);

        await axios.post(`${API}/api/files/upload`, formData, {
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      
      toast.success(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`);
      onUploadComplete();
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setMetadata({ name: '', description: '', category_id: '' });
    setAiSuggestions(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload File
          </DialogTitle>
          <DialogDescription>
            Drag & drop, paste screenshot, or click to browse
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            ref={dropZoneRef}
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            data-testid="upload-drop-zone"
          >
            <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-600 mb-1">
              Drag & drop files here
            </p>
            <p className="text-xs text-slate-400">
              or paste a screenshot (Ctrl+V)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded text-sm">
                  <File className="w-4 h-4 text-slate-500" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-slate-400">{formatFileSize(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* AI Auto-tag */}
          {files.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoTag}
              disabled={loadingAI}
              className="w-full"
            >
              {loadingAI ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
              )}
              Auto-tag with AI
            </Button>
          )}

          {/* AI Suggestions */}
          {aiSuggestions && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="font-medium text-amber-700">AI Suggestion</span>
              </div>
              <p className="text-slate-600">
                Category: <span className="font-medium">{aiSuggestions.suggested_category_name}</span>
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={metadata.name}
                onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
                placeholder="File name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={metadata.description}
                onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={metadata.category_id}
                onValueChange={(value) => setMetadata(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!files.length || uploading}>
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Link Existing File Modal
 */
const LinkFileModal = ({ isOpen, onClose, objectName, recordId, onLinkComplete }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [linking, setLinking] = useState(false);

  // Search files
  const searchFiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/files`, {
        headers: getAuthHeader(),
        params: { search: searchQuery, limit: 20 }
      });
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      searchFiles();
    }
  }, [isOpen]);

  // Link file
  const handleLink = async () => {
    if (!selectedFile) return;
    
    setLinking(true);
    try {
      await axios.post(
        `${API}/api/files/${selectedFile.id}/link?record_id=${recordId}&object_name=${objectName}`,
        {},
        { headers: getAuthHeader() }
      );
      
      toast.success('File linked to record');
      onLinkComplete();
      handleClose();
    } catch (error) {
      console.error('Link error:', error);
      const msg = error.response?.data?.detail || 'Failed to link file';
      toast.error(msg);
    } finally {
      setLinking(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedFile(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Link Existing File
          </DialogTitle>
          <DialogDescription>
            Search and select a file to link to this record
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchFiles()}
                placeholder="Search files..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={searchFiles}>
              Search
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <File className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p>No files found</p>
              </div>
            ) : (
              files.map((file) => {
                const FileIcon = getFileIcon(file.mime_type);
                const isSelected = selectedFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-300' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <FileIcon className="w-8 h-8 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(file.size_bytes)} • {formatDate(file.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleLink} disabled={!selectedFile || linking}>
            {linking ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 mr-2" />
            )}
            Link File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Main FilesRelatedListComponent
 */
export const FilesRelatedListComponent = ({ 
  objectName, 
  recordId,
  showHeader = true,
  maxHeight = '400px'
}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [multiRecordLinkingEnabled, setMultiRecordLinkingEnabled] = useState(true);
  const [settings, setSettings] = useState({});

  // Fetch files for this record
  const fetchFiles = useCallback(async () => {
    if (!recordId || !objectName) return;
    
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/api/files/record/${objectName}/${recordId}`,
        { headers: getAuthHeader() }
      );
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      // If endpoint doesn't exist yet, show empty
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [recordId, objectName]);

  // Fetch categories and settings
  const fetchMetadata = useCallback(async () => {
    try {
      const [catRes, settingsRes] = await Promise.all([
        axios.get(`${API}/api/files/setup/categories`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/files/setup/settings`, { headers: getAuthHeader() }).catch(() => ({ data: {} }))
      ]);
      
      setCategories(catRes.data.categories || []);
      setSettings(settingsRes.data.settings || {});
      setMultiRecordLinkingEnabled(settingsRes.data.settings?.multi_record_linking !== false);
    } catch (error) {
      console.error('Error fetching metadata:', error);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
    fetchMetadata();
  }, [fetchFiles, fetchMetadata]);

  // Download file
  const handleDownload = async (file) => {
    try {
      const response = await axios.get(
        `${API}/api/files/download/${file.id}`,
        {
          headers: getAuthHeader(),
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.original_filename || file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  // Unlink file from record
  const handleUnlink = async (fileId) => {
    if (!window.confirm('Remove this file from the record? The file will not be deleted.')) return;
    
    try {
      await axios.delete(
        `${API}/api/files/${fileId}/link/${recordId}`,
        { headers: getAuthHeader() }
      );
      
      toast.success('File removed from record');
      fetchFiles();
    } catch (error) {
      console.error('Unlink error:', error);
      toast.error('Failed to remove file');
    }
  };

  // View file
  const handleView = (file) => {
    window.open(`${API}/api/files/download/${file.id}`, '_blank');
  };

  return (
    <Card className="w-full" data-testid="files-related-list">
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2 min-w-0 flex-shrink">
              <FolderOpen className="w-5 h-5 text-slate-500 flex-shrink-0" />
              <span className="truncate">Files</span>
              <Badge variant="secondary" className="ml-1 flex-shrink-0">
                {files.length}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-1 flex-shrink-0">
              {multiRecordLinkingEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinkModal(true)}
                  data-testid="link-file-btn"
                  className="whitespace-nowrap"
                >
                  <Link2 className="w-4 h-4 mr-1" />
                  Link
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setShowUploadModal(true)}
                data-testid="upload-file-btn"
                className="whitespace-nowrap"
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>
        </CardHeader>
      )}

      <CardContent className="pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="w-12 h-12 mx-auto text-slate-200 mb-2" />
            <p className="text-sm text-slate-500 mb-3">No files attached</p>
            <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
              <Upload className="w-4 h-4 mr-1" />
              Upload File
            </Button>
          </div>
        ) : (
          <div className="space-y-2" style={{ maxHeight, overflowY: 'auto' }}>
            {files.map((file) => {
              const FileIcon = getFileIcon(file.mime_type);
              return (
                <div
                  key={file.id}
                  className="group flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                  data-testid={`file-item-${file.id}`}
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                    <FileIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate text-sm">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{formatFileSize(file.size_bytes)}</span>
                      <span>•</span>
                      <span>{formatDate(file.created_at)}</span>
                      {file.linked_records_count > 1 && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs py-0">
                            {file.linked_records_count} records
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleView(file)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(file)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open('/files', '_blank')}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in File Manager
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleUnlink(file.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove from Record
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Modals */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        objectName={objectName}
        recordId={recordId}
        categories={categories}
        onUploadComplete={fetchFiles}
      />

      <LinkFileModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        objectName={objectName}
        recordId={recordId}
        onLinkComplete={fetchFiles}
      />
    </Card>
  );
};

export default FilesRelatedListComponent;
