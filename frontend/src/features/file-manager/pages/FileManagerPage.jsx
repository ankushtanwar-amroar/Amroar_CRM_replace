/**
 * FileManagerPage - Main File Manager View
 * Full-featured file management with libraries, folders, and file operations
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  FolderOpen,
  File,
  Upload,
  Search,
  Grid,
  List,
  Plus,
  MoreVertical,
  Trash2,
  Download,
  Share2,
  Eye,
  History,
  Tag,
  Sparkles,
  FolderPlus,
  ChevronRight,
  Home,
  Clock,
  Star,
  Settings,
  Loader2,
  FileText,
  Image as ImageIcon,
  FileCode,
  FileSpreadsheet,
  Archive,
  Film,
  Music,
  Link,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../components/ui/select';
import { Checkbox } from '../../../components/ui/checkbox';
import useFileManager, { VIEW_MODE } from '../hooks/useFileManager';
import fileManagerService from '../services/fileManagerService';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL;

// File type icons
const getFileIcon = (mimeType, extension) => {
  if (!mimeType && !extension) return File;
  
  const type = mimeType?.split('/')[0] || '';
  const ext = extension?.toLowerCase() || '';
  
  if (type === 'image' || ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) return ImageIcon;
  if (type === 'video' || ['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return Film;
  if (type === 'audio' || ['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) return Music;
  if (['.pdf'].includes(ext)) return FileText;
  if (['.doc', '.docx', '.txt', '.rtf', '.md'].includes(ext)) return FileText;
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return FileSpreadsheet;
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.html', '.css', '.json'].includes(ext)) return FileCode;
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return Archive;
  
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
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Upload Modal Component
const UploadModal = ({ isOpen, onClose, onUpload, categories, tags, getAISuggestions, selectedLibrary, selectedFolder }) => {
  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({
    name: '',
    description: '',
    category_id: '',
    tags: ''
  });
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    if (selectedFiles.length === 1) {
      setMetadata(prev => ({ ...prev, name: selectedFiles[0].name }));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
    if (droppedFiles.length === 1) {
      setMetadata(prev => ({ ...prev, name: droppedFiles[0].name }));
    }
  };

  const handleAutoTag = async () => {
    if (!files.length) return;
    
    setLoadingAI(true);
    try {
      const suggestions = await getAISuggestions(files[0].name, files[0].type);
      if (suggestions) {
        setAiSuggestions(suggestions);
        // Auto-fill category if suggested
        if (suggestions.suggested_category_id) {
          setMetadata(prev => ({ ...prev, category_id: suggestions.suggested_category_id }));
        }
        if (suggestions.suggested_tag_names?.length > 0) {
          setMetadata(prev => ({ ...prev, tags: suggestions.suggested_tag_names.join(', ') }));
        }
        toast.success('AI suggestions applied');
      }
    } catch (error) {
      toast.error('Failed to get AI suggestions');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    
    setUploading(true);
    try {
      for (const file of files) {
        await onUpload(file, metadata);
      }
      onClose();
      setFiles([]);
      setMetadata({ name: '', description: '', category_id: '', tags: '' });
      setAiSuggestions(null);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setMetadata({ name: '', description: '', category_id: '', tags: '' });
    setAiSuggestions(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Files
          </DialogTitle>
          <DialogDescription>
            Upload files to {selectedLibrary?.name || 'library'}
            {selectedFolder && ` / ${selectedFolder.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            data-testid="file-drop-zone"
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-600">
              Drag and drop files here, or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              data-testid="file-input"
            />
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Selected Files</Label>
              <div className="space-y-1">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded text-sm">
                    <File className="w-4 h-4 text-slate-500" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-slate-400">{formatFileSize(file.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Auto-tag button */}
          {files.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoTag}
              disabled={loadingAI}
              className="w-full"
              data-testid="auto-tag-btn"
            >
              {loadingAI ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
              )}
              Auto-tag with AI
            </Button>
          )}

          {/* AI Suggestions display */}
          {aiSuggestions && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="font-medium text-amber-700">AI Suggestions</span>
                <Badge variant="outline" className="text-xs">
                  {Math.round(aiSuggestions.confidence_score * 100)}% confidence
                </Badge>
              </div>
              {aiSuggestions.suggested_category_name && (
                <p className="text-slate-600">Category: <span className="font-medium">{aiSuggestions.suggested_category_name}</span></p>
              )}
              {aiSuggestions.suggested_tag_names?.length > 0 && (
                <p className="text-slate-600">Tags: <span className="font-medium">{aiSuggestions.suggested_tag_names.join(', ')}</span></p>
              )}
            </div>
          )}

          {/* Metadata fields */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={metadata.name}
                onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
                placeholder="File name"
                data-testid="file-name-input"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={metadata.description}
                onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
                data-testid="file-description-input"
              />
            </div>

            <div>
              <Label>Category</Label>
              <Select
                value={metadata.category_id}
                onValueChange={(value) => setMetadata(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger data-testid="category-select">
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

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={metadata.tags}
                onChange={(e) => setMetadata(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="tag1, tag2, tag3"
                data-testid="tags-input"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!files.length || uploading}
            data-testid="upload-btn"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {files.length > 1 ? `${files.length} Files` : 'File'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Create Folder Modal
const CreateFolderModal = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    setCreating(true);
    try {
      await onCreate({ name: name.trim(), description });
      onClose();
      setName('');
      setDescription('');
    } catch (error) {
      console.error('Error creating folder:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5" />
            Create Folder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="folderName">Folder Name</Label>
            <Input
              id="folderName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              data-testid="folder-name-input"
            />
          </div>
          <div>
            <Label htmlFor="folderDesc">Description (optional)</Label>
            <Textarea
              id="folderDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating} data-testid="create-folder-btn">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderPlus className="w-4 h-4 mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Share Modal
const ShareModal = ({ isOpen, onClose, file, onCreatePublicLink }) => {
  const [allowDownload, setAllowDownload] = useState(true);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const options = {
        file_id: file.id,
        allow_download: allowDownload
      };
      
      if (hasExpiry) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + expiryDays);
        options.expires_at = expiry.toISOString();
      }
      
      if (hasPassword && password) {
        options.password = password;
      }
      
      const result = await onCreatePublicLink(file.id, options);
      setCreatedLink(result);
    } catch (error) {
      console.error('Error creating public link:', error);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = () => {
    if (createdLink) {
      const fullUrl = `${API}/api/files/public/${createdLink.link_token}`;
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied to clipboard');
    }
  };

  const handleClose = () => {
    setCreatedLink(null);
    setCopied(false);
    setAllowDownload(true);
    setHasExpiry(false);
    setHasPassword(false);
    setPassword('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share "{file?.name}"
          </DialogTitle>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-green-700">
                <Check className="w-5 h-5" />
                <span className="font-medium">Public link created!</span>
              </div>
              <div className="flex items-center gap-2">
                <Input 
                  readOnly 
                  value={`${API}/api/files/public/${createdLink.link_token}`}
                  className="text-sm"
                />
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allowDownload"
                  checked={allowDownload}
                  onCheckedChange={setAllowDownload}
                />
                <Label htmlFor="allowDownload">Allow download</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasExpiry"
                  checked={hasExpiry}
                  onCheckedChange={setHasExpiry}
                />
                <Label htmlFor="hasExpiry">Set expiry</Label>
                {hasExpiry && (
                  <Select value={String(expiryDays)} onValueChange={(v) => setExpiryDays(Number(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasPassword"
                  checked={hasPassword}
                  onCheckedChange={setHasPassword}
                />
                <Label htmlFor="hasPassword">Password protect</Label>
              </div>
              {hasPassword && (
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link className="w-4 h-4 mr-2" />}
                Create Link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Version History Modal
const VersionHistoryModal = ({ isOpen, onClose, file, onDownloadVersion, onVersionUploaded }) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (isOpen && file) {
      loadVersions();
    }
  }, [isOpen, file]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const response = await fileManagerService.getFileVersions(file.id);
      setVersions(response.versions || []);
    } catch (error) {
      console.error('Error loading versions:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadNewVersion = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setUploading(true);
    try {
      await fileManagerService.uploadNewVersion(file.id, selectedFile);
      toast.success('New version uploaded successfully');
      await loadVersions();
      if (onVersionUploaded) {
        onVersionUploaded();
      }
    } catch (error) {
      console.error('Error uploading version:', error);
      const errorMsg = error.response?.data?.detail?.message || error.response?.data?.detail || 'Failed to upload new version';
      toast.error(errorMsg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Version History - {file?.name}
          </DialogTitle>
          <DialogDescription>
            View previous versions or upload a new version of this file
          </DialogDescription>
        </DialogHeader>

        {/* Upload New Version Button */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Upload New Version</span>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUploadNewVersion}
              className="hidden"
              id="version-upload"
            />
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Select File
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p>No version history available</p>
              <p className="text-xs mt-1">Upload a new version to start tracking changes</p>
            </div>
          ) : (
            versions.map((version, idx) => (
              <div
                key={version.id || idx}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  version.is_current ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    version.is_current ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    v{version.version_number}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        Version {version.version_number}
                      </span>
                      {version.is_current && (
                        <Badge className="bg-green-600 text-white text-xs">Current</Badge>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">
                      {formatFileSize(version.size_bytes)} • {formatDate(version.created_at)}
                    </div>
                    {version.created_by_name && (
                      <div className="text-xs text-slate-400">
                        Uploaded by {version.created_by_name}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownloadVersion(file.id, version.version_number, file.name)}
                  title={`Download v${version.version_number}`}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Audit Log Modal
const AuditLogModal = ({ isOpen, onClose, file }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen && file) {
      loadAuditHistory();
    }
  }, [isOpen, file]);

  const loadAuditHistory = async () => {
    setLoading(true);
    try {
      const response = await fileManagerService.getFileAuditHistory(file.id, 50);
      setEvents(response.events || []);
    } catch (error) {
      console.error('Error loading audit history:', error);
      toast.error('Failed to load audit history');
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'file_uploaded':
        return <Upload className="w-4 h-4 text-green-600" />;
      case 'file_downloaded':
        return <Download className="w-4 h-4 text-blue-600" />;
      case 'file_deleted':
        return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'file_shared':
      case 'public_link_created':
        return <Share2 className="w-4 h-4 text-purple-600" />;
      case 'file_viewed':
        return <Eye className="w-4 h-4 text-slate-600" />;
      case 'version_created':
        return <History className="w-4 h-4 text-amber-600" />;
      case 'metadata_updated':
        return <Tag className="w-4 h-4 text-teal-600" />;
      default:
        return <File className="w-4 h-4 text-slate-500" />;
    }
  };

  const formatEventType = (eventType) => {
    return eventType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Audit Log - {file?.name}
          </DialogTitle>
          <DialogDescription>
            Activity history for this file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p>No activity recorded yet</p>
            </div>
          ) : (
            events.map((event, idx) => (
              <div
                key={event.id || idx}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="mt-0.5">
                  {getEventIcon(event.event_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm">
                      {formatEventType(event.event_type)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {event.event_description || event.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    {event.user_name && (
                      <span>by {event.user_name}</span>
                    )}
                    <span>•</span>
                    <span>{formatDate(event.created_at)}</span>
                    {event.ip_address && (
                      <>
                        <span>•</span>
                        <span>IP: {event.ip_address}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main File Manager Page
export const FileManagerPage = () => {
  const {
    isInitialized,
    isLoading,
    libraries,
    selectedLibrary,
    folders,
    selectedFolder,
    files,
    totalFiles,
    categories,
    tags,
    sensitivities,
    featureFlags,
    stats,
    viewMode,
    initialize,
    fetchFiles,
    uploadFile,
    deleteFile,
    downloadFile,
    toggleStar,
    shareFile,
    createPublicLink,
    getFilePublicLinks,
    createFolder,
    getAISuggestions,
    selectLibrary,
    selectFolder,
    setQuickAccessView,
    VIEW_MODE
  } = useFileManager();

  const [displayMode, setDisplayMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedFileForShare, setSelectedFileForShare] = useState(null);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [selectedFileForVersions, setSelectedFileForVersions] = useState(null);
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);
  const [selectedFileForAudit, setSelectedFileForAudit] = useState(null);

  // Search handler
  const handleSearch = useCallback(() => {
    fetchFiles({ search: searchQuery });
  }, [fetchFiles, searchQuery]);

  // Delete handler
  const handleDelete = async (fileId) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      await deleteFile(fileId);
    }
  };

  // Download handler
  const handleDownload = async (file) => {
    await downloadFile(file.id, file.original_filename || file.name);
  };

  // View file handler - uses authenticated blob download
  const handleView = async (file) => {
    try {
      const response = await fileManagerService.downloadFile(file.id);
      const blob = new Blob([response.data], { type: file.mime_type || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Clean up after a delay to allow the new tab to load
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Error viewing file:', error);
      toast.error('Failed to view file');
    }
  };

  // Share handler
  const handleShare = (file) => {
    setSelectedFileForShare(file);
    setShowShareModal(true);
  };

  // Version History handler
  const handleVersionHistory = (file) => {
    setSelectedFileForVersions(file);
    setShowVersionHistoryModal(true);
  };

  // Audit Log handler
  const handleAuditLog = (file) => {
    setSelectedFileForAudit(file);
    setShowAuditLogModal(true);
  };

  // Download specific version
  const handleDownloadVersion = async (fileId, versionNumber, fileName) => {
    try {
      const response = await fileManagerService.downloadFile(fileId, versionNumber);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `v${versionNumber}_${fileName}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (error) {
      console.error('Error downloading version:', error);
      toast.error('Failed to download version');
    }
  };

  // Breadcrumb navigation
  const getBreadcrumbs = () => {
    const crumbs = [{ label: 'Files', path: null }];
    
    if (viewMode === VIEW_MODE.RECENT) {
      crumbs.push({ label: 'Recent', path: 'recent' });
    } else if (viewMode === VIEW_MODE.STARRED) {
      crumbs.push({ label: 'Starred', path: 'starred' });
    } else if (viewMode === VIEW_MODE.SHARED) {
      crumbs.push({ label: 'Shared with me', path: 'shared' });
    } else if (selectedLibrary) {
      crumbs.push({ label: selectedLibrary.name, path: selectedLibrary.id });
      if (selectedFolder) {
        crumbs.push({ label: selectedFolder.name, path: selectedFolder.id });
      }
    }
    
    return crumbs;
  };

  // Get title based on view mode
  const getTitle = () => {
    switch (viewMode) {
      case VIEW_MODE.RECENT:
        return 'Recent Files';
      case VIEW_MODE.STARRED:
        return 'Starred Files';
      case VIEW_MODE.SHARED:
        return 'Shared with Me';
      default:
        return 'Files';
    }
  };

  // Not initialized view
  if (!isInitialized && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50" data-testid="file-manager-init">
        <div className="text-center max-w-md p-8">
          <FolderOpen className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">File Manager</h2>
          <p className="text-slate-600 mb-6">
            Set up your file management system to organize, share, and collaborate on documents.
          </p>
          <Button onClick={initialize} size="lg" data-testid="initialize-btn">
            <Sparkles className="w-5 h-5 mr-2" />
            Initialize File Manager
          </Button>
        </div>
      </div>
    );
  }

  // Loading view
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="file-manager-loading">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50" data-testid="file-manager-page">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-slate-800">{getTitle()}</h1>
            
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-sm">
              {getBreadcrumbs().map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <button
                    className={`px-2 py-1 rounded hover:bg-slate-100 ${idx === getBreadcrumbs().length - 1 ? 'text-slate-800 font-medium' : 'text-slate-500'}`}
                    onClick={() => {
                      if (idx === 0) {
                        selectLibrary(libraries[0] || null);
                      } else if (viewMode !== VIEW_MODE.LIBRARY) {
                        selectLibrary(selectedLibrary || libraries[0] || null);
                      } else if (selectedFolder) {
                        selectFolder(null);
                      }
                    }}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search files..."
                className="pl-9 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                data-testid="search-input"
              />
            </div>

            {/* View toggle */}
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={displayMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setDisplayMode('grid')}
                data-testid="view-grid-btn"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={displayMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setDisplayMode('list')}
                data-testid="view-list-btn"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>

            {/* Actions - only show in library view */}
            {viewMode === VIEW_MODE.LIBRARY && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowCreateFolderModal(true)} data-testid="new-folder-btn">
                  <FolderPlus className="w-4 h-4 mr-2" />
                  New Folder
                </Button>
                <Button size="sm" onClick={() => setShowUploadModal(true)} data-testid="upload-btn-main">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Libraries */}
        <div className="w-64 bg-white border-r p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Libraries</h3>
          <div className="space-y-1">
            {libraries.map((lib) => (
              <button
                key={lib.id}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  viewMode === VIEW_MODE.LIBRARY && selectedLibrary?.id === lib.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => selectLibrary(lib)}
                data-testid={`library-${lib.id}`}
              >
                <FolderOpen className="w-5 h-5" style={{ color: lib.color || '#3B82F6' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lib.name}</div>
                  <div className="text-xs text-slate-500">{lib.file_count || 0} files</div>
                </div>
              </button>
            ))}
          </div>

          {/* Quick access */}
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-6 mb-3">Quick Access</h3>
          <div className="space-y-1">
            <button
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                viewMode === VIEW_MODE.RECENT ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setQuickAccessView(VIEW_MODE.RECENT)}
              data-testid="quick-access-recent"
            >
              <Clock className="w-5 h-5 text-slate-400" />
              <span>Recent</span>
            </button>
            <button
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                viewMode === VIEW_MODE.STARRED ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setQuickAccessView(VIEW_MODE.STARRED)}
              data-testid="quick-access-starred"
            >
              <Star className="w-5 h-5 text-slate-400" />
              <span>Starred</span>
            </button>
            <button
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                viewMode === VIEW_MODE.SHARED ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setQuickAccessView(VIEW_MODE.SHARED)}
              data-testid="quick-access-shared"
            >
              <Share2 className="w-5 h-5 text-slate-400" />
              <span>Shared with me</span>
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Folders - only show in library view */}
          {viewMode === VIEW_MODE.LIBRARY && folders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Folders</h3>
              <div className={displayMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    className={`flex items-center gap-3 p-4 bg-white border rounded-lg hover:border-blue-300 hover:shadow-sm transition-all text-left ${
                      displayMode === 'grid' ? '' : 'w-full'
                    }`}
                    onClick={() => selectFolder(folder)}
                    data-testid={`folder-${folder.id}`}
                  >
                    <FolderOpen className="w-8 h-8 text-amber-500" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{folder.name}</div>
                      <div className="text-xs text-slate-500">{folder.file_count || 0} files</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700">
                Files {totalFiles > 0 && <span className="text-slate-400">({totalFiles})</span>}
              </h3>
            </div>

            {files.length === 0 ? (
              <div className="text-center py-12 bg-white border rounded-lg" data-testid="no-files">
                <FolderOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 mb-4">
                  {viewMode === VIEW_MODE.RECENT && 'No recent files'}
                  {viewMode === VIEW_MODE.STARRED && 'No starred files'}
                  {viewMode === VIEW_MODE.SHARED && 'No files shared with you'}
                  {viewMode === VIEW_MODE.LIBRARY && 'No files here yet'}
                </p>
                {viewMode === VIEW_MODE.LIBRARY && (
                  <Button variant="outline" onClick={() => setShowUploadModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload your first file
                  </Button>
                )}
              </div>
            ) : displayMode === 'grid' ? (
              // Grid view
              <div className="grid grid-cols-4 gap-4">
                {files.map((file) => {
                  const FileIcon = getFileIcon(file.mime_type, file.file_extension);
                  return (
                    <div
                      key={file.id}
                      className="group bg-white border rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                      data-testid={`file-${file.id}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                          <FileIcon className="w-6 h-6 text-slate-500" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`opacity-0 group-hover:opacity-100 ${file.is_starred ? 'opacity-100' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleStar(file.id, file.is_starred); }}
                          >
                            <Star className={`w-4 h-4 ${file.is_starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
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
                              <DropdownMenuItem onClick={() => handleShare(file)}>
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleVersionHistory(file)}>
                                <History className="w-4 h-4 mr-2" />
                                Version History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAuditLog(file)}>
                                <Clock className="w-4 h-4 mr-2" />
                                Audit Log
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleStar(file.id, file.is_starred)}>
                                <Star className="w-4 h-4 mr-2" />
                                {file.is_starred ? 'Unstar' : 'Star'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(file.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatFileSize(file.size_bytes)} • {formatDate(file.created_at)}
                        </div>
                        {file.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {file.tags.slice(0, 2).map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {file.tags.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{file.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // List view
              <div className="bg-white border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Size</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Modified</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Tags</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const FileIcon = getFileIcon(file.mime_type, file.file_extension);
                      return (
                        <tr
                          key={file.id}
                          className="border-b last:border-b-0 hover:bg-slate-50"
                          data-testid={`file-row-${file.id}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <FileIcon className="w-5 h-5 text-slate-500" />
                              <span className="font-medium text-slate-800">{file.name}</span>
                              {file.is_starred && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatFileSize(file.size_bytes)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatDate(file.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {file.tags?.slice(0, 3).map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
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
                                <DropdownMenuItem onClick={() => handleShare(file)}>
                                  <Share2 className="w-4 h-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleVersionHistory(file)}>
                                  <History className="w-4 h-4 mr-2" />
                                  Version History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAuditLog(file)}>
                                  <Clock className="w-4 h-4 mr-2" />
                                  Audit Log
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleStar(file.id, file.is_starred)}>
                                  <Star className="w-4 h-4 mr-2" />
                                  {file.is_starred ? 'Unstar' : 'Star'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDelete(file.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={uploadFile}
        categories={categories}
        tags={tags}
        getAISuggestions={getAISuggestions}
        selectedLibrary={selectedLibrary}
        selectedFolder={selectedFolder}
      />

      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        onCreate={createFolder}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => { setShowShareModal(false); setSelectedFileForShare(null); }}
        file={selectedFileForShare}
        onCreatePublicLink={createPublicLink}
      />

      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        onClose={() => { setShowVersionHistoryModal(false); setSelectedFileForVersions(null); }}
        file={selectedFileForVersions}
        onDownloadVersion={handleDownloadVersion}
        onVersionUploaded={() => {
          // Refresh the file list to show updated version info
          loadFiles();
        }}
      />

      <AuditLogModal
        isOpen={showAuditLogModal}
        onClose={() => { setShowAuditLogModal(false); setSelectedFileForAudit(null); }}
        file={selectedFileForAudit}
      />
    </div>
  );
};

export default FileManagerPage;
