import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Grid, ChevronDown, Home, Users, Building2, Briefcase, CheckSquare, Calendar as CalendarIcon, X, Search, Loader, RefreshCw, Settings2, GripVertical, Lock, Eye, EyeOff, RotateCcw, Activity, Layout, UserPlus } from 'lucide-react';
import SalesConsoleHeader from '../components/SalesConsoleHeader';
import DynamicRecordView from '../components/DynamicRecordView';
import ObjectManagerListPage from './ObjectManagerListPage';
import ObjectManagerDetailPage from './ObjectManagerDetailPage';
import CRMDashboardHome from '../components/CRMDashboardHome';
import { EnhancedObjectListView } from '../../App';
import { Button } from '../../components/ui/button';
import { CluBotButton } from '../../components/clu_bot';
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
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { Switch } from '../../components/ui/switch';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getPage, listAppPages, listApps } from '../app_manager/services/appManagerService';

// Home page component imports for rendering app pages
import TasksDueComponent from '../app_manager/components/TasksDueComponent';
import EventsTodayComponent from '../app_manager/components/EventsTodayComponent';
import PipelineSnapshotComponent from '../app_manager/components/PipelineSnapshotComponent';
import WorkQueueComponent from '../app_manager/components/WorkQueueComponent';
import RecentRecordsComponent from '../app_manager/components/RecentRecordsComponent';
import QuickActionsComponent from '../app_manager/components/QuickActionsComponent';

// Redux slices for performance optimization
import {
  cacheRecord,
  selectCachedRecord,
  accessRecord,
} from '../../store/slices/recordCacheSlice';

// Persistent Tab Panel for instant switching
import { PersistentTabPanel } from '../../components/tabs/PersistentTabPanel';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Objects cache constants - for instant Home dropdown loading
const OBJECTS_CACHE_KEY = 'crm_nav_objects_cache';
const OBJECTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper functions for objects cache (outside component for stable references)
const loadObjectsCacheFromStorage = () => {
  try {
    const cached = localStorage.getItem(OBJECTS_CACHE_KEY);
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid (within TTL)
    if (cacheData.timestamp && (now - cacheData.timestamp) < OBJECTS_CACHE_TTL) {
      return cacheData;
    }
    
    // Cache expired but still return it for instant display
    // Background refresh will update it
    return { ...cacheData, expired: true };
  } catch (error) {
    console.error('[Objects Cache] Load failed:', error);
    return null;
  }
};

const saveObjectsCacheToStorage = (objectsList, navConfigData) => {
  try {
    const cacheData = {
      objects: objectsList,
      navConfig: navConfigData,
      timestamp: Date.now()
    };
    localStorage.setItem(OBJECTS_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('[Objects Cache] Save failed:', error);
  }
};

// Component map for rendering App Page components
const APP_PAGE_COMPONENT_MAP = {
  tasks_due: TasksDueComponent,
  events_today: EventsTodayComponent,
  pipeline_snapshot: PipelineSnapshotComponent,
  work_queue: WorkQueueComponent,
  recent_records: RecentRecordsComponent,
  quick_actions: QuickActionsComponent,
};

// App Page Tab Content - Renders an App Page as a standalone tab
const AppPageTabContent = ({ pageId, pageName }) => {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPage = async () => {
      if (!pageId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const pageData = await getPage(pageId);
        setPage(pageData);
      } catch (err) {
        console.error('Error loading app page:', err);
        setError('Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [pageId]);

  // Render a single component from the page layout
  const renderPageComponent = (component, index) => {
    const componentId = component.componentType || component.component_type || component.type || component.id;
    const Component = APP_PAGE_COMPONENT_MAP[componentId];

    if (!Component) {
      return (
        <div
          key={component.instanceId || `comp-${index}`}
          className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center"
        >
          <Layout className="h-6 w-6 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Component: {componentId || 'Unknown'}</p>
        </div>
      );
    }

    return (
      <Component
        key={component.instanceId || `comp-${index}`}
        config={component.config || {}}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-600">Loading {pageName || 'page'}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-red-600 mb-2">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Get components from page layout
  const layout = page?.layout || {};
  const regions = layout.regions || {};

  // Flatten all components from all regions
  const allComponents = [];
  Object.entries(regions).forEach(([regionName, regionComponents]) => {
    if (Array.isArray(regionComponents)) {
      regionComponents.forEach((comp) => {
        allComponents.push({ ...comp, region: regionName });
      });
    }
  });

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50/80 via-white to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Layout className="h-5 w-5 text-indigo-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{page?.name || pageName}</h1>
        </div>

        {/* Page Components */}
        {allComponents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {allComponents.map((comp, idx) => renderPageComponent(comp, idx))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Layout className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">This page has no components configured.</p>
            <p className="text-sm text-slate-400 mt-2">
              Use the Page Builder to add components to this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// State for View More modal
const VIEW_MORE_MODAL_TABS = ['all', 'apps', 'items'];

/**
 * CachedRecordTab - Record view with Redux caching for instant tab switching
 * 
 * This component:
 * 1. Checks Redux cache for existing record data
 * 2. Passes cached data to DynamicRecordView for instant display
 * 3. Updates cache when record data is fetched or updated
 * 4. Prevents unnecessary re-fetches when switching between tabs
 */
const CachedRecordTab = memo(({ 
  objectApiName, 
  recordSeriesId, 
  tenantId, 
  onOpenRelated,
  isActive 
}) => {
  const dispatch = useDispatch();
  
  // Select cached data from Redux store
  const cachedData = useSelector(state => 
    selectCachedRecord(state, objectApiName, recordSeriesId)
  );
  
  // Handle record data fetch - cache in Redux
  const handleRecordFetched = useCallback((data) => {
    if (data && objectApiName && recordSeriesId) {
      dispatch(cacheRecord({
        objectType: objectApiName,
        recordId: recordSeriesId,
        data: data,
        schema: null, // Schema is cached separately by DynamicRecordView
        layout: null, // Layout is cached separately
      }));
      console.log(`[CachedRecordTab] Cached record data for ${objectApiName}/${recordSeriesId}`);
    }
  }, [dispatch, objectApiName, recordSeriesId]);
  
  // Mark record as accessed when tab becomes active
  useEffect(() => {
    if (isActive && objectApiName && recordSeriesId) {
      dispatch(accessRecord({ objectType: objectApiName, recordId: recordSeriesId }));
    }
  }, [isActive, dispatch, objectApiName, recordSeriesId]);
  
  return (
    <DynamicRecordView
      objectApiName={objectApiName}
      recordSeriesId={recordSeriesId}
      tenantId={tenantId}
      onOpenRelated={onOpenRelated}
      initialData={cachedData?.data || null}
      onRecordUpdate={handleRecordFetched}
    />
  );
});

CachedRecordTab.displayName = 'CachedRecordTab';

// Sortable Item Component for drag-and-drop
const SortableObjectItem = ({ obj, getObjectIcon }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: obj.object_name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = getObjectIcon(obj.object_name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white border rounded-lg ${isDragging ? 'shadow-lg border-blue-400' : 'border-gray-200'}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="w-5 h-5" />
      </button>
      <Icon className="w-5 h-5 text-gray-500" />
      <span className="flex-1 font-medium text-gray-900">{obj.object_label || obj.object_name}</span>
    </div>
  );
};

const SalesConsolePageNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { objectType: urlObjectType, recordId: urlRecordId } = useParams();
  
  const [tenantId, setTenantId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAppLauncher, setShowAppLauncher] = useState(false);
  const [appSearchTerm, setAppSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentView, setCurrentView] = useState('list');
  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedObjectData, setSelectedObjectData] = useState(null);
  const [objects, setObjects] = useState([]);
  const [showActivitiesCenter, setShowActivitiesCenter] = useState(false);
  
  // Objects cache state - for instant dropdown loading
  const [objectsCacheLoaded, setObjectsCacheLoaded] = useState(false);
  const objectsCacheRef = useRef(null); // To prevent duplicate API calls
  
  // Tab management
  const [primaryTabs, setPrimaryTabs] = useState([]);
  const [activePrimaryTabId, setActivePrimaryTabId] = useState(null);
  const [tabsInitialized, setTabsInitialized] = useState(false);
  
  // Ref to track intentional non-record tab activation (skip URL sync)
  const skipUrlSyncRef = React.useRef(false);
  
  // Edit Objects Modal state
  const [showEditObjectsModal, setShowEditObjectsModal] = useState(false);
  const [editableObjects, setEditableObjects] = useState([]);
  const [activeModalTab, setActiveModalTab] = useState('reorder'); // 'reorder' | 'visibility' | 'reset'
  const [navConfig, setNavConfig] = useState(null); // Server-side nav config
  const [isLoadingNav, setIsLoadingNav] = useState(false);
  
  // View More Modal state
  const [showViewMoreModal, setShowViewMoreModal] = useState(false);
  const [viewMoreTab, setViewMoreTab] = useState('all'); // 'all' | 'apps' | 'items'
  const [viewMoreSearchTerm, setViewMoreSearchTerm] = useState('');
  
  // App Pages state - for navigation integration
  const [appPages, setAppPages] = useState([]);
  const [appPagesLoading, setAppPagesLoading] = useState(false);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Redux dispatch for caching
  const dispatch = useDispatch();

  // ============================================================
  // TAB PERSISTENCE FUNCTIONS (Salesforce-style behavior)
  // Database is source of truth, localStorage is cache for fast load
  // ============================================================
  
  // Ref to track if save is in progress (debounce API calls)
  const saveTimeoutRef = React.useRef(null);
  const isSavingRef = React.useRef(false);
  
  /**
   * Get the localStorage key for storing tabs for a specific user
   */
  const getTabStorageKey = useCallback((userId) => {
    return `crm_console_tabs_${userId}`;
  }, []);
  
  /**
   * Save tabs to localStorage (fast cache)
   */
  const saveTabsToLocalStorage = useCallback((tabs, activeTabId, userId) => {
    if (!userId) return;
    
    try {
      const storageKey = getTabStorageKey(userId);
      const tabData = {
        tabs: tabs,
        activeTabId: activeTabId,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(storageKey, JSON.stringify(tabData));
      console.log('[Tab Persistence] Saved to localStorage:', tabs.length, 'tabs');
    } catch (error) {
      console.error('[Tab Persistence] localStorage save failed:', error);
    }
  }, [getTabStorageKey]);
  
  /**
   * Load tabs from localStorage (fast cache)
   */
  const loadTabsFromLocalStorage = useCallback((userId) => {
    if (!userId) return null;
    
    try {
      const storageKey = getTabStorageKey(userId);
      const stored = localStorage.getItem(storageKey);
      
      if (!stored) return null;
      
      const tabData = JSON.parse(stored);
      console.log('[Tab Persistence] Loaded from localStorage:', tabData.tabs?.length || 0, 'tabs');
      return tabData;
    } catch (error) {
      console.error('[Tab Persistence] localStorage load failed:', error);
      return null;
    }
  }, [getTabStorageKey]);
  
  /**
   * Fetch tabs from database (source of truth)
   */
  const fetchTabsFromDatabase = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      
      const response = await axios.get(`${BACKEND_URL}/api/user/tabs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('[Tab Persistence] Fetched from database:', response.data.tabs?.length || 0, 'tabs');
      return response.data;
    } catch (error) {
      console.error('[Tab Persistence] Database fetch failed:', error);
      return null;
    }
  }, []);
  
  /**
   * Save tabs to database (source of truth)
   * Uses debouncing to avoid excessive API calls
   */
  const saveTabsToDatabase = useCallback(async (tabs, activeTabId) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce: wait 500ms before saving to avoid rapid successive saves
    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      
      try {
        isSavingRef.current = true;
        const token = localStorage.getItem('token');
        if (!token) return;
        
        await axios.put(
          `${BACKEND_URL}/api/user/tabs`,
          { tabs: tabs, active_tab_id: activeTabId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('[Tab Persistence] Saved to database:', tabs.length, 'tabs');
      } catch (error) {
        console.error('[Tab Persistence] Database save failed:', error);
      } finally {
        isSavingRef.current = false;
      }
    }, 500);
  }, []);
  
  /**
   * Clear tabs from both localStorage and database
   */
  const clearAllTabs = useCallback(async (userId) => {
    if (!userId) return;
    
    try {
      // Clear localStorage
      const storageKey = getTabStorageKey(userId);
      localStorage.removeItem(storageKey);
      
      // Clear database
      const token = localStorage.getItem('token');
      if (token) {
        await axios.delete(`${BACKEND_URL}/api/user/tabs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      console.log('[Tab Persistence] Cleared all tabs for user:', userId);
    } catch (error) {
      console.error('[Tab Persistence] Clear failed:', error);
    }
  }, [getTabStorageKey]);

  // ============================================================
  // INITIALIZATION & USER LOADING
  // ============================================================

  useEffect(() => {
    // Get tenant and user from localStorage
    const storedTenant = localStorage.getItem('tenant');
    const storedUser = localStorage.getItem('user');
    
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    
    if (storedTenant) {
      try {
        const tenantData = JSON.parse(storedTenant);
        setTenantId(tenantData.id);
      } catch (error) {
        // Fallback to tenant_id if available
        const storedTenantId = localStorage.getItem('tenant_id');
        if (storedTenantId) {
          setTenantId(storedTenantId);
        }
      }
    } else {
      const storedTenantId = localStorage.getItem('tenant_id');
      if (storedTenantId) {
        setTenantId(storedTenantId);
      }
    }
    
    // Fetch objects metadata on mount - with cache for instant loading
    const initializeObjects = async () => {
      // Step 1: Load from cache immediately (instant UI)
      const cachedData = loadObjectsCacheFromStorage();
      
      if (cachedData && cachedData.objects && cachedData.objects.length > 0) {
        setObjects(cachedData.objects);
        if (cachedData.navConfig) {
          setNavConfig(cachedData.navConfig);
        }
        setObjectsCacheLoaded(true);
        
        // If cache is still fresh, skip API call
        if (!cachedData.expired) {
          return;
        }
      }
      
      // Step 2: Fetch fresh data from API (background if cache was loaded)
      fetchObjects();
    };
    
    initializeObjects();
  }, []);
  
  // ============================================================
  // LOAD PERSISTED TABS ON USER LOGIN
  // Strategy: Load localStorage first (fast), then sync with database (source of truth)
  // ============================================================
  useEffect(() => {
    if (currentUser?.id && !tabsInitialized) {
      const initializeTabs = async () => {
        // Check if URL specifies an object or record (URL takes priority over persisted tabs)
        const isUrlDriven = urlObjectType || urlRecordId;
        
        // Step 1: Load from localStorage first (instant UI)
        const localTabs = loadTabsFromLocalStorage(currentUser.id);
        
        if (localTabs && localTabs.tabs && localTabs.tabs.length > 0) {
          console.log('[Tab Persistence] Quick load from localStorage:', localTabs.tabs.length, 'tabs');
          setPrimaryTabs(localTabs.tabs);
          
          // Only activate persisted tab if URL doesn't specify where to go
          if (localTabs.activeTabId && !isUrlDriven) {
            const activeTabExists = localTabs.tabs.some(t => t.id === localTabs.activeTabId);
            if (activeTabExists) {
              setActivePrimaryTabId(localTabs.activeTabId);
            }
          }
        }
        
        // Step 2: Fetch from database (source of truth)
        const dbTabs = await fetchTabsFromDatabase();
        
        if (dbTabs && dbTabs.tabs && dbTabs.tabs.length > 0) {
          // Database has tabs - use them as source of truth
          console.log('[Tab Persistence] Syncing with database:', dbTabs.tabs.length, 'tabs');
          setPrimaryTabs(dbTabs.tabs);
          
          // Only activate persisted tab if URL doesn't specify where to go
          if (dbTabs.active_tab_id && !isUrlDriven) {
            const activeTabExists = dbTabs.tabs.some(t => t.id === dbTabs.active_tab_id);
            if (activeTabExists) {
              setActivePrimaryTabId(dbTabs.active_tab_id);
            }
          }
          
          // Update localStorage with database version
          saveTabsToLocalStorage(dbTabs.tabs, dbTabs.active_tab_id, currentUser.id);
        } else if (localTabs && localTabs.tabs && localTabs.tabs.length > 0) {
          // Database is empty but localStorage has tabs - sync to database
          console.log('[Tab Persistence] Syncing localStorage to database');
          saveTabsToDatabase(localTabs.tabs, localTabs.activeTabId);
        }
        
        setTabsInitialized(true);
      };
      
      initializeTabs();
    }
  }, [currentUser, tabsInitialized, urlObjectType, urlRecordId, loadTabsFromLocalStorage, fetchTabsFromDatabase, saveTabsToLocalStorage, saveTabsToDatabase]);
  
  // ============================================================
  // SAVE TABS WHENEVER THEY CHANGE (to both localStorage and database)
  // ============================================================
  useEffect(() => {
    // Only save after initialization to prevent overwriting on load
    if (tabsInitialized && currentUser?.id) {
      // Save to localStorage immediately (fast)
      saveTabsToLocalStorage(primaryTabs, activePrimaryTabId, currentUser.id);
      
      // Save to database (debounced)
      saveTabsToDatabase(primaryTabs, activePrimaryTabId);
    }
  }, [primaryTabs, activePrimaryTabId, currentUser, tabsInitialized, saveTabsToLocalStorage, saveTabsToDatabase]);

  // Refetch objects when window gains focus (user returns from Object Manager)
  // Uses cache invalidation to prevent unnecessary API calls
  useEffect(() => {
    const handleFocus = () => {
      // Invalidate cache and refetch - user might have made changes in Object Manager
      objectsCacheRef.current = null;
      fetchObjects();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Fetch App Pages for navigation integration
  useEffect(() => {
    const fetchAppPages = async () => {
      try {
        setAppPagesLoading(true);
        // First, get the list of apps to find the Sales Console app ID
        const appsResponse = await listApps(false);
        const apps = appsResponse.apps || [];
        // Find the Sales Console app (case-insensitive search for "Sales Console")
        const salesConsoleApp = apps.find(app => 
          app.name && app.name.toLowerCase().includes('sales console')
        );
        
        if (!salesConsoleApp) {
          console.warn('[App Pages] Sales Console app not found');
          setAppPages([]);
          return;
        }
        
        // Now fetch pages for the Sales Console app using its actual ID
        const response = await listAppPages(salesConsoleApp.id, true);
        const pages = response.pages || [];
        // Filter only app_page type pages (not home pages)
        const appPagesList = pages.filter(p => p.type === 'app_page');
        setAppPages(appPagesList);
      } catch (err) {
        console.error('[App Pages] Error fetching app pages:', err);
        // Silently fail - app pages are optional
      } finally {
        setAppPagesLoading(false);
      }
    };
    
    fetchAppPages();
  }, []);

  /**
   * URL → Tab Synchronization (URL is source of truth)
   * 
   * When URL changes (via browser back/forward or direct navigation):
   * - Parse objectType and recordId from URL
   * - Create or activate corresponding tab
   * - Update selectedObject state
   * 
   * IMPORTANT: Non-record tabs (Object Manager, Object Config) are NOT URL-driven.
   * They stay active even when URL is /crm-platform.
   */
  useEffect(() => {
    // Debug logging
    console.log('[URL→Tab] Effect triggered', {
      objectsLength: objects.length,
      skipUrlSync: skipUrlSyncRef.current,
      urlObjectType,
      urlRecordId,
      selectedObject,
      activePrimaryTabId
    });
    
    // Skip if objects haven't loaded yet
    if (objects.length === 0) {
      console.log('[URL→Tab] Skipping - objects not loaded yet');
      return;
    }
    
    // Skip URL sync when intentionally navigating to non-record tabs
    if (skipUrlSyncRef.current) {
      console.log('[URL→Tab] Skipping - intentional non-record tab navigation');
      skipUrlSyncRef.current = false;
      return;
    }
    
    const currentPath = location.pathname;
    const navigationState = location.state;
    
    // Check if a non-record tab is currently active
    const activeTab = primaryTabs.find(t => t.id === activePrimaryTabId);
    const isNonRecordTabActive = activeTab && (
      activeTab.type === 'object-manager-list' || 
      activeTab.type === 'object-config'
    );
    
    console.log('[URL→Tab] Processing URL:', currentPath, { 
      urlObjectType, 
      urlRecordId, 
      activePrimaryTabId,
      isNonRecordTabActive,
      navigationState 
    });
    
    // Handle /crm/:objectType/:recordId pattern
    if (urlObjectType && urlRecordId) {
      const normalizedObjectType = urlObjectType.toLowerCase();
      const tabId = `record-${normalizedObjectType}-${urlRecordId}`;
      
      // Find object data
      const objectData = objects.find(obj => obj.object_name === normalizedObjectType);
      if (objectData) {
        // Update selected object if different
        if (selectedObject !== normalizedObjectType) {
          setSelectedObject(normalizedObjectType);
          setSelectedObjectData(objectData);
        }
        
        // Check if tab already exists
        const existingTab = primaryTabs.find(t => t.id === tabId);
        if (existingTab) {
          // Just activate existing tab if not already active
          if (activePrimaryTabId !== tabId) {
            setActivePrimaryTabId(tabId);
          }
        } else {
          // Create new tab - use navigation state if available, otherwise fetch record name
          const objectLabel = objectData.object_label || normalizedObjectType;
          
          // If we have a record name from navigation state, use it immediately
          if (navigationState?.recordName) {
            const newTab = {
              id: tabId,
              title: `${navigationState.recordName} | ${objectLabel}`,
              type: 'record',
              seriesId: urlRecordId,
              objectApiName: normalizedObjectType,
              recordName: navigationState.recordName
            };
            
            setPrimaryTabs(prev => {
              const filtered = prev.filter(t => t.id !== tabId);
              return [...filtered, newTab];
            });
            setActivePrimaryTabId(tabId);
          } else {
            // Fetch record to get name (for direct URL navigation or refresh)
            const createTabWithName = async () => {
              let displayName = urlRecordId; // Fallback to series_id
              
              try {
                const token = localStorage.getItem('token');
                const response = await fetch(
                  `${process.env.REACT_APP_BACKEND_URL}/api/objects/${normalizedObjectType}/records/${urlRecordId}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                
                if (response.ok) {
                  const record = await response.json();
                  const data = record.data || record;
                  
                  // Try different name fields based on object type
                  displayName = data.name || 
                               data.subject || 
                               (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}`.trim() : null) ||
                               data.first_name ||
                               data.last_name ||
                               data.title ||
                               data.email ||
                               urlRecordId; // Final fallback
                }
              } catch (error) {
                console.warn('[URL→Tab] Could not fetch record name:', error);
              }
              
              const newTab = {
                id: tabId,
                title: `${displayName} | ${objectLabel}`,
                type: 'record',
                seriesId: urlRecordId,
                objectApiName: normalizedObjectType,
                recordName: displayName
              };
              
              setPrimaryTabs(prev => {
                const filtered = prev.filter(t => t.id !== tabId);
                return [...filtered, newTab];
              });
              setActivePrimaryTabId(tabId);
            };
            
            createTabWithName();
          }
        }
      }
    }
    // Handle /crm/:objectType (list view)
    else if (urlObjectType && !urlRecordId) {
      const normalizedObjectType = urlObjectType.toLowerCase();
      const objectData = objects.find(obj => obj.object_name === normalizedObjectType);
      
      if (objectData) {
        // Update selected object if different
        if (selectedObject !== normalizedObjectType || selectedObjectData?.object_name !== normalizedObjectType) {
          setSelectedObject(normalizedObjectType);
          setSelectedObjectData(objectData);
        }
        // Clear active tab to show list view
        if (activePrimaryTabId !== null) {
          setActivePrimaryTabId(null);
        }
      }
    }
    // Handle /crm or /crm-platform (home)
    else if (currentPath === '/crm' || currentPath === '/crm-platform') {
      // Only reset if there's no non-record tab active (like Object Manager)
      const hasNonRecordTabActive = activePrimaryTabId && !activePrimaryTabId.startsWith('record-');
      
      if (!hasNonRecordTabActive) {
        if (selectedObject !== null) {
          setSelectedObject(null);
          setSelectedObjectData(null);
        }
        if (activePrimaryTabId !== null) {
          setActivePrimaryTabId(null);
        }
      }
    }
  }, [location.pathname, urlObjectType, urlRecordId, objects, selectedObject, selectedObjectData, activePrimaryTabId, primaryTabs]);

  /**
   * Navigate to URL - Centralized navigation function
   * Updates URL and passes record name via state for tab title
   */
  const navigateToRecord = useCallback((objectType, recordId, recordName = null) => {
    const normalizedObjectType = objectType?.toLowerCase();
    const newUrl = `/crm/${normalizedObjectType}/${recordId}`;
    
    console.log('[Tab→URL] Navigating to:', newUrl, 'recordName:', recordName);
    // Pass record name via navigation state so URL→Tab sync can use it
    navigate(newUrl, { state: { recordName } });
  }, [navigate]);

  /**
   * Navigate to object list view
   */
  const navigateToObjectList = useCallback((objectType) => {
    const normalizedObjectType = objectType?.toLowerCase();
    
    // Special handling for File object - redirect to DMS page instead of CRM list
    if (normalizedObjectType === 'file') {
      console.log('[Tab→URL] Redirecting File to DMS page: /files');
      navigate('/files');
      return;
    }
    
    const newUrl = `/crm/${normalizedObjectType}`;
    
    console.log('[Tab→URL] Navigating to object list:', newUrl);
    navigate(newUrl);
  }, [navigate]);

  /**
   * Navigate to home
   */
  const navigateToHome = useCallback(() => {
    console.log('[Tab→URL] Navigating to home');
    navigate('/crm');
  }, [navigate]);

  const fetchObjects = async () => {
    // Prevent duplicate API calls
    if (objectsCacheRef.current === 'loading') {
      return;
    }
    objectsCacheRef.current = 'loading';
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch nav config first (contains order and visibility)
      const navConfigResponse = await axios.get(`${BACKEND_URL}/api/nav-config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const config = navConfigResponse.data;
      setNavConfig(config);
      
      // Fetch all objects using native fetch (more reliable than axios for this endpoint)
      let allObjects;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const objResponse = await fetch(`${BACKEND_URL}/api/objects`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!objResponse.ok) {
          console.error('[fetchObjects] Objects fetch failed:', objResponse.status);
          objectsCacheRef.current = null;
          return;
        }
        
        allObjects = await objResponse.json();
      } catch (objErr) {
        console.error('[fetchObjects] Objects fetch error:', objErr.name, objErr.message);
        objectsCacheRef.current = null;
        return;
      }
      
      // Fetch user's visible objects based on permissions
      let visibleObjectsSet = null;
      try {
        const visController = new AbortController();
        const visTimeoutId = setTimeout(() => visController.abort(), 5000);
        
        const visibleResponse = await fetch(`${BACKEND_URL}/api/me/visible-objects`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: visController.signal
        });
        
        clearTimeout(visTimeoutId);
        
        if (visibleResponse.ok) {
          const visData = await visibleResponse.json();
          if (visData && visData.visible_objects) {
            // Super admins see everything, so only filter for non-admins
            if (!visData.is_super_admin) {
              visibleObjectsSet = new Set(visData.visible_objects.map(o => o.toLowerCase()));
            }
          }
        }
      } catch (visErr) {
        console.warn('[fetchObjects] Could not fetch visible objects, showing all:', visErr.message || visErr);
        // If permission check fails, show all objects (fallback for backward compatibility)
      }
      
      // Apply nav config (order and visibility) AND permission visibility
      let processedObjects;
      if (config && config.items && config.items.length > 0) {
        // Create a map for quick lookup
        const configMap = {};
        config.items.forEach(item => {
          configMap[item.object_name] = item;
        });
        
        // Sort objects based on nav config order and filter by visibility
        processedObjects = allObjects
          .map(obj => {
            const navItem = configMap[obj.object_name];
            return {
              ...obj,
              navOrder: navItem?.order ?? 999,
              navVisible: navItem?.visible ?? true
            };
          })
          .filter(obj => {
            // Must be nav-visible (admin config)
            if (!obj.navVisible) return false;
            // Must be permission-visible (if we have permission data)
            if (visibleObjectsSet !== null && !visibleObjectsSet.has(obj.object_name?.toLowerCase())) return false;
            return true;
          })
          .sort((a, b) => a.navOrder - b.navOrder);
        
        setObjects(processedObjects);
      } else {
        // No nav config - filter only by permissions
        processedObjects = visibleObjectsSet !== null 
          ? allObjects.filter(obj => visibleObjectsSet.has(obj.object_name?.toLowerCase()))
          : allObjects;
        setObjects(processedObjects);
      }
      
      // Save to cache for instant loading on next page load
      saveObjectsCacheToStorage(processedObjects, config);
      objectsCacheRef.current = 'loaded';
    } catch (error) {
      console.error('[fetchObjects] Error:', error);
      objectsCacheRef.current = null; // Allow retry on error
    }
  };
  
  // Fetch nav config
  const fetchNavConfig = async () => {
    try {
      setIsLoadingNav(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/nav-config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNavConfig(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching nav config:', error);
      toast.error('Failed to load navigation config');
      return null;
    } finally {
      setIsLoadingNav(false);
    }
  };
  
  // Save nav config
  const saveNavConfig = async (config) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${BACKEND_URL}/api/nav-config`, config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Navigation config saved successfully');
      return true;
    } catch (error) {
      console.error('Error saving nav config:', error);
      toast.error('Failed to save navigation config');
      return false;
    }
  };
  
  // Reset nav config to default
  const resetNavConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${BACKEND_URL}/api/nav-config/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Navigation reset to default');
      // Refresh objects
      await fetchObjects();
      return response.data;
    } catch (error) {
      console.error('Error resetting nav config:', error);
      toast.error('Failed to reset navigation');
      return null;
    }
  };
  
  // Handle drag end for reordering objects
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setEditableObjects((items) => {
        const oldIndex = items.findIndex(item => item.object_name === active.id);
        const newIndex = items.findIndex(item => item.object_name === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  
  // Open edit modal
  const handleOpenEditModal = async () => {
    // Fetch fresh nav config
    const config = await fetchNavConfig();
    
    // Get all objects (including hidden ones) for the modal
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/objects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const allObjects = response.data;
      
      // Map objects with their nav config
      if (config && config.items) {
        const configMap = {};
        config.items.forEach(item => {
          configMap[item.object_name] = item;
        });
        
        const objectsWithConfig = allObjects.map(obj => {
          const navItem = configMap[obj.object_name];
          return {
            ...obj,
            navOrder: navItem?.order ?? 999,
            navVisible: navItem?.visible ?? true
          };
        }).sort((a, b) => a.navOrder - b.navOrder);
        
        setEditableObjects(objectsWithConfig);
      } else {
        setEditableObjects(allObjects);
      }
    } catch (error) {
      console.error('Error fetching objects for modal:', error);
      setEditableObjects([...objects]);
    }
    
    setActiveModalTab('reorder');
    setShowEditObjectsModal(true);
  };
  
  // Save object order and visibility
  const handleSaveObjectOrder = async () => {
    // Build items array from editableObjects
    const items = editableObjects.map((obj, index) => ({
      object_name: obj.object_name,
      visible: obj.navVisible !== undefined ? obj.navVisible : true,
      order: index
    }));
    
    // Save to backend
    const success = await saveNavConfig({ items });
    
    if (success) {
      setShowEditObjectsModal(false);
      // Refresh objects from server
      await fetchObjects();
    }
  };
  
  // Toggle object visibility
  const toggleObjectVisibility = (objectName) => {
    setEditableObjects(prev => 
      prev.map(obj => 
        obj.object_name === objectName
          ? { ...obj, navVisible: !obj.navVisible }
          : obj
      )
    );
  };
  
  // Handle reset in modal
  const handleResetNavigation = async () => {
    const result = await resetNavConfig();
    if (result) {
      setShowEditObjectsModal(false);
    }
  };

  // Helper function to get icon based on object name
  const getObjectIcon = (objectName) => {
    const name = objectName.toLowerCase();
    if (name.includes('lead') || name.includes('contact') || name.includes('client') || name.includes('patient')) {
      return Users;
    } else if (name.includes('account') || name.includes('property') || name.includes('company')) {
      return Building2;
    } else if (name.includes('opportunity') || name.includes('deal')) {
      return Briefcase;
    } else if (name.includes('task')) {
      return CheckSquare;
    } else if (name.includes('event') || name.includes('calendar') || name.includes('meeting')) {
      return CalendarIcon;
    } else {
      return Grid; // Default icon for custom objects
    }
  };

  // Build dynamic object types from API data
  const objectTypes = [
    { id: 'home', label: 'Home', icon: Home, apiName: null },
    ...objects.map(obj => ({
      id: obj.object_name,
      label: obj.object_plural || obj.object_label || obj.object_name,
      icon: getObjectIcon(obj.object_name),
      apiName: obj.object_name
    }))
  ];

  // Available apps for the app launcher
  const availableApps = [
    { 
      id: 'sales-console', 
      label: 'Sales Console', 
      description: 'Manage leads, accounts, and opportunities',
      icon: Grid
    }
  ];

  // Sales Console dropdown options
  const salesConsoleOptions = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'object-manager', label: 'Object Manager', icon: Grid }
  ];

  // Filter apps based on search
  const filteredApps = availableApps.filter(app =>
    app.label.toLowerCase().includes(appSearchTerm.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(appSearchTerm.toLowerCase()))
  );

  // Search for object types (not records) - use dynamic objects from API
  const searchableObjects = objects.map(obj => ({
    id: obj.object_name,
    label: obj.object_plural || obj.object_label || obj.object_name,
    icon: getObjectIcon(obj.object_name),
    apiName: obj.object_name
  }));

  // Filter objects based on search
  const filteredObjects = searchableObjects.filter(obj =>
    obj.label.toLowerCase().includes(appSearchTerm.toLowerCase())
  );

  const openObjectFromSearch = (objectItem) => {
    // Use the existing handleSelectObject function
    handleSelectObject(objectItem.id);
    setShowAppLauncher(false);
    setAppSearchTerm('');
  };

  const handleSelectObject = (objectId) => {
    if (objectId === 'home') {
      navigateToHome();
    } else {
      // Navigate to object list view
      navigateToObjectList(objectId);
    }
  };

  const openRecordInTab = (record) => {
    // Use centralized navigation - URL→Tab sync will handle tab creation
    navigateToRecord(selectedObject, record.series_id, record.data?.name || record.data?.first_name);
  };

  // New function for opening related records in tabs (can open any object type)
  const openRelatedRecordInTab = (objectType, seriesId, recordName = null) => {
    // Use centralized navigation - URL→Tab sync will handle tab creation
    navigateToRecord(objectType, seriesId, recordName);
  };

  /**
   * Handle tab click - navigates to the correct URL
   * This ensures URL is always updated when switching tabs
   */
  const handleTabClick = useCallback((tab) => {
    // For record tabs, navigate to the record URL
    if (tab.type === 'record' && tab.objectApiName && tab.seriesId) {
      navigateToRecord(tab.objectApiName, tab.seriesId);
    } 
    // For object manager tabs, navigate to home URL and set state
    else if (tab.type === 'object-manager-list' || tab.type === 'object-config') {
      skipUrlSyncRef.current = true;
      navigate('/crm-platform', { replace: true });
      setActivePrimaryTabId(tab.id);
    }
    // Fallback - just set the active tab
    else {
      setActivePrimaryTabId(tab.id);
    }
  }, [navigateToRecord, navigate]);

  // Open Object Manager in a tab
  const openObjectManagerTab = useCallback(() => {
    const tabId = 'object-manager-list';
    
    // Set flag to skip URL sync
    skipUrlSyncRef.current = true;
    
    // Check if tab already exists
    const existingTab = primaryTabs.find(t => t.id === tabId);
    if (existingTab) {
      // Navigate to home URL to prevent URL sync from overriding
      navigate('/crm-platform', { replace: true });
      setActivePrimaryTabId(tabId);
      return;
    }
    
    // Create Object Manager tab
    const newTab = {
      id: tabId,
      title: 'Object Manager',
      type: 'object-manager-list'
    };
    
    // Navigate to home URL first, then set tab state
    navigate('/crm-platform', { replace: true });
    setPrimaryTabs(prev => [...prev, newTab]);
    setActivePrimaryTabId(tabId);
  }, [primaryTabs, navigate]);

  // Open specific object configuration in a tab
  const openObjectConfigTab = useCallback((objectName) => {
    const tabId = `object-config-${objectName}`;
    
    // Set flag to skip URL sync
    skipUrlSyncRef.current = true;
    
    // Check if tab already exists
    const existingTab = primaryTabs.find(t => t.id === tabId);
    if (existingTab) {
      navigate('/crm-platform', { replace: true });
      setActivePrimaryTabId(tabId);
      return;
    }
    
    // Get object data
    const objectData = objects.find(o => o.object_name === objectName);
    const objectLabel = objectData?.object_label || objectName;
    
    // Create Object Config tab
    const newTab = {
      id: tabId,
      title: `${objectLabel} Configuration`,
      type: 'object-config',
      objectApiName: objectName
    };
    
    navigate('/crm-platform', { replace: true });
    setPrimaryTabs(prev => [...prev, newTab]);
    setActivePrimaryTabId(tabId);
  }, [primaryTabs, objects, navigate]);

  // Open an App Page in a new tab
  const openAppPageTab = useCallback((pageId, pageName) => {
    const tabId = `app-page-${pageId}`;
    
    // Set flag to skip URL sync
    skipUrlSyncRef.current = true;
    
    // Check if tab already exists
    const existingTab = primaryTabs.find(t => t.id === tabId);
    if (existingTab) {
      navigate('/crm-platform', { replace: true });
      setActivePrimaryTabId(tabId);
      return;
    }
    
    // Create App Page tab
    const newTab = {
      id: tabId,
      title: pageName || 'App Page',
      type: 'app_page',
      pageId: pageId,
      pageName: pageName
    };
    
    navigate('/crm-platform', { replace: true });
    setPrimaryTabs(prev => [...prev, newTab]);
    setActivePrimaryTabId(tabId);
    toast.success(`Opened ${pageName || 'page'}`);
  }, [primaryTabs, navigate]);

  const closeTab = useCallback((tabId) => {
    const tabIndex = primaryTabs.findIndex(t => t.id === tabId);
    const newTabs = primaryTabs.filter(t => t.id !== tabId);
    
    // Update tabs state
    setPrimaryTabs(newTabs);
    
    // If closing the active tab, need to switch to another tab or go home
    if (activePrimaryTabId === tabId) {
      if (newTabs.length > 0) {
        // Try to activate the tab that was before this one, or the last one
        const nextTabIndex = Math.min(tabIndex, newTabs.length - 1);
        const nextTab = newTabs[nextTabIndex];
        
        // Navigate based on tab type
        if (nextTab.type === 'record' && nextTab.objectApiName && nextTab.seriesId) {
          navigateToRecord(nextTab.objectApiName, nextTab.seriesId);
        } else if (nextTab.type === 'object-manager-list' || nextTab.type === 'object-config') {
          skipUrlSyncRef.current = true;
          navigate('/crm-platform', { replace: true });
          setActivePrimaryTabId(nextTab.id);
        } else {
          setActivePrimaryTabId(nextTab.id);
        }
      } else {
        // No tabs left, navigate home
        setActivePrimaryTabId(null);
        navigateToHome();
      }
    }
  }, [primaryTabs, activePrimaryTabId, navigateToRecord, navigateToHome, navigate]);

  const activePrimaryTab = primaryTabs.find(t => t.id === activePrimaryTabId);
  const isRecordView = activePrimaryTab?.type === 'record';

  const handleEditPage = () => {
    if (activePrimaryTab && activePrimaryTab.type === 'record') {
      // Navigate to Lightning Page Builder with object name as query parameter
      navigate(`/crm-platform/lightning-builder?object=${activePrimaryTab.objectApiName}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Sales Console Header (replaces CRM header) */}
      <SalesConsoleHeader 
        currentView={currentView}
        onViewChange={setCurrentView}
        isRecordView={isRecordView}
        onEditPage={handleEditPage}
        onOpenRecordTab={openRelatedRecordInTab}
      />

      {/* Console Navigation Bar - COMPACT */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-4 py-1.5 flex items-center space-x-3">
          {/* App Launcher - Salesforce-style waffle icon */}
          <button
            onClick={() => setShowAppLauncher(!showAppLauncher)}
            className="p-1.5 hover:bg-slate-100 rounded-md transition-colors group"
            title="App Launcher"
          >
            {/* Salesforce-style 3x3 grid icon */}
            <div className="w-5 h-5 grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-1.5 h-1.5 bg-slate-600 rounded-sm group-hover:bg-blue-600 transition-colors"
                />
              ))}
            </div>
          </button>

          {/* Console Title - Clean label without dropdown arrow */}
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm text-slate-900">Sales Console</span>
          </div>

          <div className="border-l border-slate-300 h-5"></div>

          {/* Object Navigation Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-sm text-slate-700">
                {selectedObject ? 
                  objectTypes.find(o => o.id === selectedObject)?.label || 'Select Object' 
                  : 'Home'}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
              {objectTypes.map(obj => {
                const Icon = obj.icon;
                return (
                  <DropdownMenuItem 
                    key={obj.id}
                    onClick={() => handleSelectObject(obj.id)}
                    className="text-sm"
                  >
                    <Icon className="mr-2 h-3.5 w-3.5" />
                    <span>{obj.label}</span>
                  </DropdownMenuItem>
                );
              })}
              
              {objects.length > 0 && (
                <>
                  <div className="border-t my-1"></div>
                  <div className="flex items-center justify-end px-2 py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal();
                      }}
                      className="p-1.5 hover:bg-slate-100 rounded transition-colors flex items-center gap-1 text-xs text-slate-600"
                      title="Customize Navigation"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* App Pages - Rendered as separate navigation buttons in the top bar */}
          {appPages.length > 0 && (
            <>
              <div className="border-l border-slate-300 h-5"></div>
              {appPages.map(page => (
                <Button
                  key={page.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => openAppPageTab(page.id, page.name)}
                  className={`h-7 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 ${
                    page.is_default ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : ''
                  }`}
                  title={page.is_default ? `${page.name} (Default)` : page.name}
                >
                  <Layout className="w-3.5 h-3.5 mr-1" />
                  {page.name}
                  {page.is_default && (
                    <span className="ml-1 text-[9px] bg-indigo-200 text-indigo-700 px-1 py-0.5 rounded">Default</span>
                  )}
                </Button>
              ))}
            </>
          )}
          
          <div className="border-l border-slate-300 h-5"></div>
          
          {/* Object Manager Button - Compact */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openObjectManagerTab()}
            className="h-7 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Grid className="w-3.5 h-3.5 mr-1" />
            Object Manager
          </Button>
        </div>

        {/* Primary Tabs Bar - COMPACT */}
        {primaryTabs.length > 0 && (
          <div className="bg-slate-100 border-t border-slate-200 flex items-center overflow-x-auto">
            {primaryTabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center px-3 py-1.5 cursor-pointer border-r border-slate-300 whitespace-nowrap ${
                  activePrimaryTabId === tab.id ? 'bg-white' : 'hover:bg-slate-200'
                }`}
                onClick={() => handleTabClick(tab)}
              >
                <span className="text-xs font-medium truncate max-w-xs">
                  {tab.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-2 text-slate-500 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content Area - ONLY CONTENT, NO CRM LAYOUT */}
      <div className="flex-1 overflow-y-auto pb-10">
        {/* 
          PERFORMANCE OPTIMIZATION: Persistent Tab Rendering
          - Record tabs use PersistentTabPanel to stay mounted when switching
          - This prevents re-renders and API calls when returning to a tab
          - Non-record tabs (object manager, config) render conditionally
        */}
        
        {/* Persistent Record Tab Panels - Keep mounted for instant switching */}
        {primaryTabs.filter(tab => tab.type === 'record').map(tab => (
          <PersistentTabPanel
            key={tab.id}
            tabId={tab.id}
            isActive={activePrimaryTabId === tab.id}
            preserveMount={true}
          >
            <CachedRecordTab
              objectApiName={tab.objectApiName}
              recordSeriesId={tab.seriesId}
              tenantId={tenantId}
              isActive={activePrimaryTabId === tab.id}
              onOpenRelated={(objectType, seriesId, recordName) => {
                openRelatedRecordInTab(objectType, seriesId, recordName);
              }}
            />
          </PersistentTabPanel>
        ))}
        
        {/* Non-record tabs render conditionally (no persistence needed) */}
        {activePrimaryTab?.type === 'object-manager-list' ? (
          <div className="p-8 bg-white min-h-full">
            <ObjectManagerListPage 
              onObjectClick={openObjectConfigTab}
            />
          </div>
        ) : activePrimaryTab?.type === 'object-config' ? (
          <ObjectManagerDetailPage 
            objectName={activePrimaryTab.objectApiName}
            inTab={true}
          />
        ) : activePrimaryTab?.type === 'app_page' ? (
          <AppPageTabContent 
            pageId={activePrimaryTab.pageId}
            pageName={activePrimaryTab.pageName}
          />
        ) : !activePrimaryTab && selectedObject && selectedObjectData ? (
          <EnhancedObjectListView
            object={selectedObjectData}
            onRecordClick={openRecordInTab}
            openRecordInTab={openRecordInTab}
            openRelatedRecordInTab={openRelatedRecordInTab}
          />
        ) : !activePrimaryTab && selectedObject && !selectedObjectData ? (
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-center">
              <Loader className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-slate-600">Loading {selectedObject}...</p>
              <p className="text-xs text-slate-400 mt-2">
                If this takes too long, the object might not exist in the database.
              </p>
            </div>
          </div>
        ) : !activePrimaryTab && !selectedObject ? (
          <CRMDashboardHome 
            currentUser={currentUser}
            objects={objects}
            onSelectObject={() => handleSelectObject('home')}
            onOpenObjectManager={openObjectManagerTab}
            onOpenActivities={() => {
              const bellButton = document.querySelector('[title="Activities"]');
              if (bellButton) bellButton.click();
            }}
            onRefresh={fetchObjects}
          />
        ) : null}
      </div>

      {/* App Launcher Overlay */}
      {showAppLauncher && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => {
              setShowAppLauncher(false);
              setAppSearchTerm('');
            }}
          />
          <div className="fixed top-0 left-0 w-96 h-full bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900">App Launcher</h2>
              <button
                onClick={() => {
                  setShowAppLauncher(false);
                  setAppSearchTerm('');
                }}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-4 border-b bg-slate-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search apps and records..."
                  value={appSearchTerm}
                  onChange={(e) => setAppSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Apps Section - Always visible at top */}
              <div className="p-4 border-b">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Apps
                </h3>
                {filteredApps.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No apps found</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredApps.map(app => {
                      const AppIcon = app.icon;
                      const isActive = true; // Sales Console is always active
                      return (
                        <button
                          key={app.id}
                          onClick={() => {
                            setShowAppLauncher(false);
                            setAppSearchTerm('');
                          }}
                          className={`relative flex flex-col items-center p-4 rounded-xl transition-all duration-200 ${
                            isActive 
                              ? 'bg-blue-50 border-2 border-blue-500 shadow-md ring-2 ring-blue-100' 
                              : 'hover:bg-slate-50 border-2 border-transparent hover:border-slate-200'
                          }`}
                        >
                          {/* Active indicator badge */}
                          {isActive && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-3 shadow-lg ${
                            isActive 
                              ? 'bg-gradient-to-br from-blue-500 to-blue-700' 
                              : 'bg-gradient-to-br from-slate-500 to-slate-600'
                          }`}>
                            <AppIcon className="w-7 h-7 text-white" />
                          </div>
                          <span className="text-sm font-semibold text-slate-900 text-center">{app.label}</span>
                          {isActive && (
                            <span className="mt-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Records/Items Section - Show only 4 items with View More */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {appSearchTerm.trim() ? 'Search Results' : 'All Items'}
                  </h3>
                  <span className="text-xs text-slate-400">{filteredObjects.length} items</span>
                </div>
                {filteredObjects.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No items found</p>
                ) : (
                  <div className="space-y-1">
                    {/* Show only first 4 items in sidebar */}
                    {filteredObjects.slice(0, 5).map((obj) => {
                      const ObjectIcon = obj.icon;
                      return (
                        <button
                          key={obj.id}
                          onClick={() => openObjectFromSearch(obj)}
                          className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-slate-100 transition-colors group border border-transparent hover:border-slate-200"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg flex items-center justify-center shadow-sm">
                              <ObjectIcon className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-900">
                              {obj.label}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            View All →
                          </span>
                        </button>
                      );
                    })}
                    
                    {/* View More Link - Show only if there are more than 4 items */}
                    {filteredObjects.length > 5 && !appSearchTerm.trim() && (
                      <button
                        onClick={() => setShowViewMoreModal(true)}
                        className="w-full flex items-center justify-center px-3 py-3 mt-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors font-medium text-sm border border-blue-200 hover:border-blue-400"
                      >
                        View More ({filteredObjects.length - 5} more items)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Fixed Footer - Salesforce Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-100 border-t border-slate-300 px-6 py-2 z-30">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center space-x-4">
            <a href="#" className="hover:text-blue-600 hover:underline">About</a>
            <a href="#" className="hover:text-blue-600 hover:underline">Help</a>
            <a href="#" className="hover:text-blue-600 hover:underline">Privacy</a>
            <a href="#" className="hover:text-blue-600 hover:underline">Terms</a>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-slate-500">© 2026 CRM Console</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-500">Version 1.0</span>
          </div>
        </div>
      </div>

      {/* Edit Objects Modal */}
      <Dialog open={showEditObjectsModal} onOpenChange={setShowEditObjectsModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-600" />
              Customize Navigation
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeModalTab} onValueChange={setActiveModalTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="reorder">Reorder</TabsTrigger>
              <TabsTrigger value="visibility">Add / Remove</TabsTrigger>
            </TabsList>
            
            {/* Reorder Tab */}
            <TabsContent value="reorder" className="mt-4">
              <p className="text-sm text-gray-500 mb-4">
                Drag and drop to reorder objects in the dropdown menu.
              </p>
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={editableObjects.map(obj => obj.object_name)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {editableObjects.filter(obj => obj.navVisible !== false).map((obj) => (
                      <SortableObjectItem
                        key={obj.object_name}
                        obj={obj}
                        getObjectIcon={getObjectIcon}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </TabsContent>
            
            {/* Add/Remove Tab */}
            <TabsContent value="visibility" className="mt-4">
              <p className="text-sm text-gray-500 mb-4">
                Show or hide objects from the navigation dropdown.
              </p>
              
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {editableObjects.map((obj) => {
                  const Icon = getObjectIcon(obj.object_name);
                  const isVisible = obj.navVisible !== false;
                  
                  return (
                    <div
                      key={obj.object_name}
                      className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                        isVisible ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isVisible ? 'text-gray-600' : 'text-gray-400'}`} />
                      <span className={`flex-1 font-medium ${isVisible ? 'text-gray-900' : 'text-gray-500'}`}>
                        {obj.object_label || obj.object_name}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isVisible}
                          onCheckedChange={() => toggleObjectVisibility(obj.object_name)}
                        />
                        <span className="text-sm w-16">
                          {isVisible ? (
                            <span className="text-green-600 flex items-center">
                              <Eye className="w-3 h-3 mr-1" />
                              Visible
                            </span>
                          ) : (
                            <span className="text-gray-400 flex items-center">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Hidden
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <p className="font-medium mb-1">💡 Tip:</p>
                <p>Hidden objects won't appear in the dropdown but can be shown again anytime using this panel.</p>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowEditObjectsModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveObjectOrder} className="bg-blue-600 hover:bg-blue-700">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* View More Modal - Shows all apps and items like Salesforce */}
      <Dialog open={showViewMoreModal} onOpenChange={(open) => {
        setShowViewMoreModal(open);
        if (!open) {
          setViewMoreSearchTerm('');
          setViewMoreTab('all');
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[1000px] max-h-[85vh] p-0 overflow-hidden rounded-2xl shadow-2xl border-0">
          {/* Fixed Header */}
          <div className="sticky top-0 z-10 bg-white px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-slate-900">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Grid className="w-5 h-5 text-white" />
                </div>
                App Launcher
              </DialogTitle>
            </DialogHeader>
            
            {/* Search in modal - Sticky */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search apps and items..."
                value={viewMoreSearchTerm}
                onChange={(e) => setViewMoreSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                data-testid="app-launcher-search"
              />
            </div>
          </div>
          
          {/* Scrollable Content */}
          <div className="px-6 pb-6 overflow-y-auto overflow-x-hidden" style={{ maxHeight: 'calc(85vh - 180px)' }}>
            {/* Tabs */}
            <Tabs value={viewMoreTab} onValueChange={setViewMoreTab} className="mt-4">
              <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  All
                </TabsTrigger>
                <TabsTrigger value="apps" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  Apps
                </TabsTrigger>
                <TabsTrigger value="items" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  Items
                </TabsTrigger>
              </TabsList>
              
              {/* All Tab */}
              <TabsContent value="all" className="mt-6">
                {/* Apps Section */}
                <div className="mb-8">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Apps</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {availableApps.filter(app => 
                      !viewMoreSearchTerm || app.label.toLowerCase().includes(viewMoreSearchTerm.toLowerCase())
                    ).map(app => {
                      const AppIcon = app.icon;
                      return (
                        <button
                          key={app.id}
                          onClick={() => {
                            setShowViewMoreModal(false);
                            setShowAppLauncher(false);
                          }}
                          className="flex flex-col items-center p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-150 group"
                          data-testid={`app-tile-${app.id}`}
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-150">
                            <AppIcon className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-sm font-medium text-slate-700 text-center leading-tight group-hover:text-slate-900 transition-colors">
                            {app.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Items Section */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Items</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {objectTypes.filter(obj => 
                      !viewMoreSearchTerm || obj.label.toLowerCase().includes(viewMoreSearchTerm.toLowerCase())
                    ).map((obj) => {
                      const ObjectIcon = obj.icon;
                      return (
                        <button
                          key={obj.id}
                          onClick={() => {
                            handleSelectObject(obj.id);
                            setShowViewMoreModal(false);
                            setShowAppLauncher(false);
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-150 text-left group"
                          data-testid={`item-tile-${obj.id}`}
                        >
                          <div className="w-9 h-9 bg-gradient-to-br from-slate-500 to-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:shadow-sm transition-all">
                            <ObjectIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-sm font-medium text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                            {obj.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
              
              {/* Apps Tab */}
              <TabsContent value="apps" className="mt-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {availableApps.filter(app => 
                    !viewMoreSearchTerm || app.label.toLowerCase().includes(viewMoreSearchTerm.toLowerCase())
                  ).map(app => {
                    const AppIcon = app.icon;
                    return (
                      <button
                        key={app.id}
                        onClick={() => {
                          setShowViewMoreModal(false);
                          setShowAppLauncher(false);
                        }}
                        className="flex flex-col items-center p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-150 group"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-150">
                          <AppIcon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 text-center leading-tight group-hover:text-slate-900 transition-colors">
                          {app.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
              
              {/* Items Tab */}
              <TabsContent value="items" className="mt-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {objectTypes.filter(obj => 
                    !viewMoreSearchTerm || obj.label.toLowerCase().includes(viewMoreSearchTerm.toLowerCase())
                  ).map((obj) => {
                    const ObjectIcon = obj.icon;
                    return (
                      <button
                        key={obj.id}
                        onClick={() => {
                          handleSelectObject(obj.id);
                          setShowViewMoreModal(false);
                          setShowAppLauncher(false);
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-150 text-left group"
                      >
                        <div className="w-9 h-9 bg-gradient-to-br from-slate-500 to-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:shadow-sm transition-all">
                          <ObjectIcon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                          {obj.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* CLU-BOT AI Assistant */}
      <CluBotButton 
        context={{
          current_object: activePrimaryTabId?.split('-')[0] || null,
          current_record: activePrimaryTabId?.includes('-') ? {
            object_type: activePrimaryTabId.split('-')[0],
            id: activePrimaryTabId.split('-').slice(1).join('-')
          } : null
        }}
      />
    </div>
  );
};

export default SalesConsolePageNew;
