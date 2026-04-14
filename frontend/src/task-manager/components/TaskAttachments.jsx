/**
 * Task Attachments Component
 * Upload, list, download, and delete file attachments
 */
import React, { useState, useEffect, useRef } from 'react';
import { 
  Paperclip, Upload, Download, Trash2, Loader2, 
  FileText, Image, File, X, Plus
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fileTypeIcons = {
  'image': Image,
  'application/pdf': FileText,
  'text': FileText,
  'default': File
};

const getFileIcon = (fileType) => {
  if (fileType?.startsWith('image')) return Image;
  if (fileType?.includes('pdf')) return FileText;
  if (fileType?.startsWith('text')) return FileText;
  return File;
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TaskAttachments = ({ taskId, onUpdate }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAttachments();
  }, [taskId]);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/attachments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data);
      }
    } catch (err) {
      console.error('Error fetching attachments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `${API_URL}/api/task-manager/tasks/${taskId}/attachments`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const newAttachment = await response.json();
        setAttachments(prev => [newAttachment, ...prev]);
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (attachment) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/attachments/${attachment.id}/download`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  const handleDelete = async (attachmentId) => {
    if (!window.confirm('Delete this attachment?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error deleting attachment:', err);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4" data-testid="task-attachments">
      {/* Upload Area */}
      <div 
        className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleUpload}
          className="hidden"
          data-testid="attachment-file-input"
        />
        
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-600">Uploading... {Math.round(uploadProgress)}%</p>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-slate-400" />
            <p className="text-sm text-slate-600">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-slate-400">
              Max 10MB per file
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Attachments List */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : attachments.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">
              {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {attachments.map(attachment => {
            const FileIcon = getFileIcon(attachment.file_type);
            
            return (
              <div 
                key={attachment.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg group hover:bg-slate-100 transition-colors"
                data-testid={`attachment-${attachment.id}`}
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileIcon className="w-5 h-5 text-blue-600" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(attachment.file_size)} • {attachment.uploaded_by_name} • {formatDate(attachment.created_at)}
                  </p>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment)}
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(attachment.id)}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400 py-4">
          No attachments yet
        </p>
      )}
    </div>
  );
};

export default TaskAttachments;
