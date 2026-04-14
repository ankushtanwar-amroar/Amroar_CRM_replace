/**
 * useFileManager - Custom hook for File Manager state
 */

import { useState, useEffect, useCallback } from 'react';
import fileManagerService from '../services/fileManagerService';
import toast from 'react-hot-toast';

// View modes for quick access
export const VIEW_MODE = {
  LIBRARY: 'library',
  RECENT: 'recent',
  STARRED: 'starred',
  SHARED: 'shared'
};

export const useFileManager = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [libraries, setLibraries] = useState([]);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [sensitivities, setSensitivities] = useState([]);
  const [featureFlags, setFeatureFlags] = useState({});
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState(VIEW_MODE.LIBRARY);

  // Check initialization status
  const checkStatus = useCallback(async () => {
    try {
      const status = await fileManagerService.getStatus();
      setIsInitialized(status.initialized);
      setStats(status.stats);
      setFeatureFlags(status.feature_flags || {});
      return status.initialized;
    } catch (error) {
      console.error('Error checking file manager status:', error);
      return false;
    }
  }, []);

  // Initialize file manager
  const initialize = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fileManagerService.initialize();
      if (result.success) {
        setIsInitialized(true);
        toast.success('File Manager initialized successfully');
        await loadInitialData();
      }
      return result;
    } catch (error) {
      console.error('Error initializing file manager:', error);
      toast.error('Failed to initialize File Manager');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [librariesRes, categoriesRes, tagsRes, sensitivitiesRes] = await Promise.all([
        fileManagerService.listLibraries(),
        fileManagerService.getCategories(),
        fileManagerService.getTags(),
        fileManagerService.getSensitivities()
      ]);

      setLibraries(librariesRes.libraries || []);
      setCategories(categoriesRes.categories || []);
      setTags(tagsRes.tags || []);
      setSensitivities(sensitivitiesRes.sensitivities || []);

      // Select default library
      if (librariesRes.libraries?.length > 0) {
        const defaultLib = librariesRes.libraries.find(l => l.is_default) || librariesRes.libraries[0];
        setSelectedLibrary(defaultLib);
      }
    } catch (error) {
      console.error('Error loading file manager data:', error);
      toast.error('Failed to load file manager data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch files based on current view mode
  const fetchFiles = useCallback(async (params = {}) => {
    try {
      let response;
      
      switch (viewMode) {
        case VIEW_MODE.RECENT:
          response = await fileManagerService.getRecentFiles(50);
          setFiles(response.files || []);
          setTotalFiles(response.files?.length || 0);
          break;
          
        case VIEW_MODE.STARRED:
          response = await fileManagerService.getStarredFiles(50);
          setFiles(response.files || []);
          setTotalFiles(response.files?.length || 0);
          break;
          
        case VIEW_MODE.SHARED:
          response = await fileManagerService.getSharedWithMe(50);
          setFiles(response.files || []);
          setTotalFiles(response.files?.length || 0);
          break;
          
        case VIEW_MODE.LIBRARY:
        default:
          const queryParams = {
            library_id: selectedLibrary?.id,
            folder_id: selectedFolder?.id,
            ...params
          };
          response = await fileManagerService.listFiles(queryParams);
          setFiles(response.files || []);
          setTotalFiles(response.total || 0);
          break;
      }
      
      return response;
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error('Failed to load files');
      return { files: [], total: 0 };
    }
  }, [viewMode, selectedLibrary, selectedFolder]);

  // Fetch folders
  const fetchFolders = useCallback(async (libraryId = null, parentFolderId = null) => {
    try {
      const response = await fileManagerService.listFolders(
        libraryId || selectedLibrary?.id,
        parentFolderId
      );
      setFolders(response.folders || []);
      return response.folders || [];
    } catch (error) {
      console.error('Error fetching folders:', error);
      return [];
    }
  }, [selectedLibrary]);

  // Upload file
  const uploadFile = useCallback(async (file, metadata = {}) => {
    try {
      const result = await fileManagerService.uploadFile(file, {
        library_id: selectedLibrary?.id,
        folder_id: selectedFolder?.id,
        ...metadata
      });
      
      if (result.success) {
        toast.success(`File "${file.name}" uploaded successfully`);
        await fetchFiles();
        // Refresh libraries to update file count
        const libRes = await fileManagerService.listLibraries();
        setLibraries(libRes.libraries || []);
      }
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to upload "${file.name}"`);
      throw error;
    }
  }, [selectedLibrary, selectedFolder, fetchFiles]);

  // Delete file
  const deleteFile = useCallback(async (fileId, permanent = false) => {
    try {
      const result = await fileManagerService.deleteFile(fileId, permanent);
      if (result.success) {
        toast.success('File deleted');
        // Remove from local state immediately
        setFiles(prev => prev.filter(f => f.id !== fileId));
        setTotalFiles(prev => prev - 1);
        // Refresh libraries to update file count
        const libRes = await fileManagerService.listLibraries();
        setLibraries(libRes.libraries || []);
      }
      return result;
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
      throw error;
    }
  }, []);

  // Download file
  const downloadFile = useCallback(async (fileId, fileName) => {
    try {
      const response = await fileManagerService.downloadFile(fileId);
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName || 'download');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Download started');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
      throw error;
    }
  }, []);

  // Star/unstar file
  const toggleStar = useCallback(async (fileId, isStarred) => {
    try {
      if (isStarred) {
        await fileManagerService.unstarFile(fileId);
        toast.success('Removed from starred');
      } else {
        await fileManagerService.starFile(fileId);
        toast.success('Added to starred');
      }
      
      // Update local state
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, is_starred: !isStarred } : f
      ));
      
      // If in starred view, remove the file
      if (viewMode === VIEW_MODE.STARRED && isStarred) {
        setFiles(prev => prev.filter(f => f.id !== fileId));
      }
    } catch (error) {
      console.error('Error toggling star:', error);
      toast.error('Failed to update star status');
    }
  }, [viewMode]);

  // Share file
  const shareFile = useCallback(async (fileId, userIds) => {
    try {
      const result = await fileManagerService.shareFileInternally(fileId, userIds);
      if (result.success) {
        toast.success('File shared successfully');
      }
      return result;
    } catch (error) {
      console.error('Error sharing file:', error);
      toast.error('Failed to share file');
      throw error;
    }
  }, []);

  // Create public link
  const createPublicLink = useCallback(async (fileId, options = {}) => {
    try {
      const result = await fileManagerService.createPublicLink({
        file_id: fileId,
        ...options
      });
      toast.success('Public link created');
      return result;
    } catch (error) {
      console.error('Error creating public link:', error);
      toast.error('Failed to create public link');
      throw error;
    }
  }, []);

  // Get file public links
  const getFilePublicLinks = useCallback(async (fileId) => {
    try {
      return await fileManagerService.getFilePublicLinks(fileId);
    } catch (error) {
      console.error('Error getting public links:', error);
      return { links: [] };
    }
  }, []);

  // Create folder
  const createFolder = useCallback(async (data) => {
    try {
      const result = await fileManagerService.createFolder({
        ...data,
        library_id: selectedLibrary?.id,
        parent_folder_id: selectedFolder?.id
      });
      toast.success(`Folder "${data.name}" created`);
      await fetchFolders();
      return result;
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
      throw error;
    }
  }, [selectedLibrary, selectedFolder, fetchFolders]);

  // Get AI suggestions
  const getAISuggestions = useCallback(async (filename, mimeType) => {
    try {
      return await fileManagerService.getAISuggestions(filename, mimeType);
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      return null;
    }
  }, []);

  // Select library
  const selectLibrary = useCallback(async (library) => {
    setSelectedLibrary(library);
    setSelectedFolder(null);
    setViewMode(VIEW_MODE.LIBRARY);
    if (library) {
      await fetchFolders(library.id);
    }
  }, [fetchFolders]);

  // Select folder
  const selectFolder = useCallback((folder) => {
    setSelectedFolder(folder);
  }, []);

  // Set quick access view
  const setQuickAccessView = useCallback((mode) => {
    setViewMode(mode);
    setSelectedFolder(null);
    // Don't clear selected library for breadcrumb purposes
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const initialized = await checkStatus();
      if (initialized) {
        await loadInitialData();
      }
      setIsLoading(false);
    };
    init();
  }, [checkStatus, loadInitialData]);

  // Fetch files when view mode, library or folder changes
  useEffect(() => {
    if (isInitialized) {
      if (viewMode === VIEW_MODE.LIBRARY && selectedLibrary) {
        fetchFiles();
      } else if (viewMode !== VIEW_MODE.LIBRARY) {
        fetchFiles();
      }
    }
  }, [isInitialized, viewMode, selectedLibrary, selectedFolder, fetchFiles]);

  return {
    // State
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

    // Actions
    initialize,
    checkStatus,
    loadInitialData,
    fetchFiles,
    fetchFolders,
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
    setSelectedLibrary,
    setSelectedFolder,
    setQuickAccessView,
    VIEW_MODE
  };
};

export default useFileManager;
