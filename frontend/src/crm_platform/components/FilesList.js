import React, { useState, useEffect } from 'react';
import { File, Upload, Trash2, Download, FileText, Image, Video, Music } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fileIcons = {
  'image': Image,
  'video': Video,
  'audio': Music,
  'text': FileText,
  'application': File
};

const FilesList = ({ objectType, recordId, tenantId }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [objectType, recordId, tenantId]);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/crm-platform/files?object_type=${objectType}&record_id=${recordId}&tenant_id=${tenantId}`
      );
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(
        `${API_URL}/api/crm-platform/files/upload?object_type=${objectType}&record_id=${recordId}&tenant_id=${tenantId}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );
      await fetchFiles();
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(
        `${API_URL}/api/crm-platform/files/${fileId}?tenant_id=${tenantId}`
      );
      await fetchFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType) => {
    const category = fileType.split('/')[0];
    const Icon = fileIcons[category] || File;
    return Icon;
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading files...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold">Files ({files.length})</h3>
        <label className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm cursor-pointer">
          <Upload className="w-4 h-4 mr-1" />
          {uploading ? 'Uploading...' : 'Upload'}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      <div className="p-4">
        {files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <File className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No files attached</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const Icon = getFileIcon(file.file_type);
              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <Icon className="w-8 h-8 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.file_size)} • {new Date(file.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FilesList;
