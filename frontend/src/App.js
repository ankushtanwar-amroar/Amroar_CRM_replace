import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Import custom components
import RecordTypeManager from './components/RecordTypeManager';

// Form Builder Components
import FormBuilderPage from './modules/form-builder/pages/FormBuilderPage';
import FormEditorPro from './modules/form-builder/pages/FormEditorPro';
import FormSubmissions from './modules/form-builder/pages/FormSubmissions';
import PublicFormViewPro from './modules/form-builder/pages/PublicFormViewPro';
import WebToLeadGenerator from './modules/form-builder/pages/WebToLeadGenerator';

// Flow Builder Components
import FlowListPage from './pages/FlowBuilder/FlowListPage';
import FlowEditorPage from './pages/FlowBuilder/FlowEditorPage';
import FlowDetailsPage from './pages/FlowBuilder/FlowDetailsPage';
import FlowInfoPage from './pages/FlowBuilder/FlowInfoPage';
import WebhookLogsPage from './pages/FlowBuilder/WebhookLogsPage';
import ChooseAutomationType from './pages/FlowBuilder/ChooseAutomationType';
import ChooseScreenFlowMode from './pages/FlowBuilder/ChooseScreenFlowMode';
import ScreenFlowRunner from './pages/FlowBuilder/ScreenFlowRunner';

// Chatbot Manager
import ChatbotDashboard from './chatbot-manager/pages/ChatbotDashboard';
import BotWizard from './chatbot-manager/pages/BotWizardNew';
import AnalyticsDashboard from './chatbot-manager/pages/AnalyticsDashboard';
import DocFlowDashboard from './docflow/pages/DocFlowDashboard';
import TemplateEditor from './docflow/pages/TemplateEditor';
import PublicDocumentView from './docflow/pages/PublicDocumentViewEnhanced';
import GenerateDocumentWizard from './docflow/pages/GenerateDocumentWizard';

// Booking Module
import ServicesPage from './booking/pages/ServicesPage';
import StaffPage from './booking/pages/StaffPage';
import CalendarPage from './booking/pages/CalendarPage';
import DashboardPage from './booking/pages/DashboardPage';
import BookingsPage from './booking/pages/BookingsPage';
import PublicBooking from './booking/pages/PublicBooking';
import WidgetGenerator from './booking/pages/WidgetGenerator';
import ManageBooking from './booking/pages/ManageBooking';

// Survey Builder V2
import SurveyList from './survey-builder-v2/pages/SurveyList';
import SurveyBuilder from './survey-builder-v2/pages/SurveyBuilder';
import SurveyResponses from './survey-builder-v2/pages/SurveyResponses';
import ResponseViewer from './survey-builder-v2/pages/ResponseViewer';
import SurveyAnalytics from './survey-builder-v2/pages/SurveyAnalytics';
import PublicSurveyView from './survey-builder-v2/pages/PublicSurveyView';

// CRM Platform
import CRMPlatformPage from './crm_platform/pages/CRMPlatformPage';
import ObjectManagerPage from './crm_platform/pages/ObjectManagerPage';
import ObjectManagerListPage from './crm_platform/pages/ObjectManagerListPage';
import ObjectManagerDetailPage from './crm_platform/pages/ObjectManagerDetailPage';
import LightningPageBuilderPage from './crm_platform/lightning_builder/pages/LightningPageBuilderPage';

// Email Templates Module
import EmailTemplatesPage from './modules/email_templates/EmailTemplatesPage';

// Field Management Module
import { AdvancedFieldManager } from './crm_platform/field_management';

// Phase 1: User Management Pages
import AcceptInvitePage from './auth-pages/AcceptInvitePage';
import ForgotPasswordPage from './auth-pages/ForgotPasswordPage';
import ResetPasswordPage from './auth-pages/ResetPasswordPage';
import UsersPage from './setup/pages/UsersPage';

// Step 5: Security Center Module
import SecurityCenterPage from './modules/security-center/pages/SecurityCenterPage';

// Phase 7: Roles Module
import { RolesHierarchyPage } from './modules/roles';

// Phase 8: Sharing Module
import { SharingSettingsPage } from './modules/sharing';

// Phase 9: Field Security Module
import { FieldPermissionsPage } from './modules/field-security';

// Dependent Picklists Module
import { useDependentPicklistRuntime } from './modules/dependent-picklists';

// Routes - extracted from App.js
import AppRoutes from './routes/AppRoutes';

// Record Dialog Components - extracted from App.js
import CreateRecordDialog from './components/records/CreateRecordDialog';
import EditRecordDialog from './components/records/EditRecordDialog';

// CreateRecord Service - Centralized record creation
import { CreateRecordProvider } from './services/createRecord';

// Object Management Components - extracted from App.js
import { ManageObjectsTab, CreateObjectDialog } from './components/objects/ManageObjectsTab';
import { CustomFieldManager, AddCustomFieldDialog, EditCustomFieldDialog } from './components/objects/CustomFieldManager';

// List View Components - extracted from App.js
import { EnhancedObjectListView } from './components/list-view';

// Import shadcn components
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './components/ui/dialog';
import { Separator } from './components/ui/separator';
import { Switch } from './components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './components/ui/sheet';
// import { toast } from 'sonner';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import {
  Users,
  Building2,
  UserPlus,
  Plus,
  Edit,
  Trash2,
  Search,
  LogOut,
  BarChart3,
  ArrowUpDown,
  Filter,
  Calendar as CalendarIcon,
  Clock,
  CheckSquare,
  ArrowLeft,
  Eye,
  Pin,
  PinOff,
  Save,
  X,
  Activity,
  FileText,
  Star,
  Shield,
  TableIcon,
  Network,
  Share2,
  LayoutGrid,
  Kanban,
  Mail,
  Phone,
  Building,
  Settings,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Wrench,
  Zap,
  MessageSquare,
  ClipboardList,
  Info,
  Layout,
  Database,
  MousePointer2,
  Layers,
  FolderOpen,
  Loader,
  AlertCircle,
  CheckCircle,
  Columns2,
  Check,
  List,
  Pencil,
  RotateCcw,
  Globe,
  Copy,
  User,
  Bell,
  ListTodo,
  CalendarDays,
  Type,
  LayoutList,
  RefreshCw
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { RelatedRecordDisplay, RelatedRecordWithPreview, isRelatedField } from './components/RelatedRecordDisplay';
import { useBatchRelatedRecords } from './utils/useRelatedRecords';

// Import dnd-kit for drag and drop
import {
  DndContext,
  DragOverlay,
  closestCorners,
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth context
const AuthContext = React.createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserInfo();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get(`${API}/me`);
      setUser(response.data);
      const tenantData = JSON.parse(localStorage.getItem('tenant'));
      setTenant(tenantData);
    } catch (error) {
      console.error('Error fetching user info:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = (token, userData, tenantData) => {
    // Clear stale module cache — new user means new module entitlements
    localStorage.removeItem('module_states_cache');
    localStorage.setItem('token', token);
    localStorage.setItem('tenant', JSON.stringify(tenantData));
    localStorage.setItem('user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    setTenant(tenantData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tenant');
    localStorage.removeItem('user');
    localStorage.removeItem('module_states_cache');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setTenant(null);
  };

  return (
    <AuthContext.Provider value={{ user, tenant, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Components
const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [industries, setIndustries] = useState({});
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const moduleCtx = React.useContext(ModuleContext);
  const isSubmitting = React.useRef(false);

  // Redirect if already authenticated (e.g., direct visit to /auth while logged in)
  // Skip during active login submission to avoid racing with refreshModuleStates
  useEffect(() => {
    if (user && !isSubmitting.current) {
      navigate('/');
    }
  }, [user, navigate]);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    company_name: '',
    industry: ''
  });

  useEffect(() => {
    fetchIndustries();
  }, []);

  const fetchIndustries = async () => {
    try {
      const response = await axios.get(`${API}/industries`);
      setIndustries(response.data);
    } catch (error) {
      console.error('Error fetching industries:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    isSubmitting.current = true;

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : formData;

      const response = await axios.post(`${API}${endpoint}`, payload);
      const { access_token, user, tenant } = response.data;

      login(access_token, user, tenant);
      toast.success(`${isLogin ? 'Logged in' : 'Account created'} successfully!`);

      // Use landing page from login response (computed server-side)
      const landingPage = response.data.default_landing_page || '/crm-platform';

      // Trigger background module context refresh for subsequent use
      if (moduleCtx?.refreshModuleStates) {
        moduleCtx.refreshModuleStates();
      }

      navigate(landingPage);
    } catch (error) {
      const message = error.response?.data?.detail || `${isLogin ? 'Login' : 'Registration'} failed`;
      toast.error(message);
      isSubmitting.current = false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" data-testid="login-page">

      {/* ─── Left: Login Form ─── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:px-16 lg:py-12 bg-white relative">
        {/* Subtle noise texture */}
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E")' }} />

        <div className="w-full max-w-[380px] relative z-10">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-[22px] font-bold tracking-tight text-slate-900" data-testid="login-brand-name">Cluvik</span>
          </div>

          {/* Heading */}
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight" data-testid="login-heading">
              Welcome Back
            </h1>
            <p className="text-[15px] text-slate-500 mt-2 leading-relaxed" data-testid="login-subtext">
              Manage your business, workflows, and growth in one place
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-slate-600">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                data-testid="email-input"
                className="h-12 rounded-xl border-slate-200 bg-slate-50/50 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-slate-600">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                data-testid="password-input"
                className="h-12 rounded-xl border-slate-200 bg-slate-50/50 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white transition-colors"
              />
            </div>

            {isLogin && (
              <div className="flex items-center justify-between text-sm pt-1">
                <label className="flex items-center gap-2 cursor-pointer" data-testid="remember-me">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0" />
                  <span className="text-slate-500">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                  data-testid="forgot-password-link"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-white font-semibold text-[15px] tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                disabled={loading}
                data-testid="auth-submit-button"
              >
                {loading ? 'Signing in...' : (
                  <>
                    Sign In
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* ─── Right: Futuristic CRM Visual ─── */}
      <div className="hidden lg:block lg:w-[55%] relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #1e1145 0%, #1a0a3e 25%, #0f0628 50%, #130a30 75%, #1e1145 100%)' }}>
        {/* Ambient glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 left-1/4 w-[200px] h-[200px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }} />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {/* Full-bleed visual */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="https://static.prod-images.emergentagent.com/jobs/a1ff4e9a-1135-440e-8b35-02b457152a75/images/d3252917ca41c2bc806f75936c2de04ea44e8f48d3511fc2fb5b7cd2e63e6dca.png"
            alt="CRM analytics dashboard"
            className="h-full w-full object-contain object-center p-8"
            style={{ filter: 'brightness(1.05) contrast(1.05)' }}
          />
        </div>

        {/* Bottom text overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-10 z-10" style={{ background: 'linear-gradient(to top, rgba(15,6,40,0.95) 0%, transparent 100%)' }}>
          <h2 className="text-2xl font-bold text-white tracking-tight">Data-Driven Decisions</h2>
          <p className="text-sm text-white/60 mt-1.5">Real-time analytics, pipelines, and insights — all in one view</p>
        </div>
      </div>
    </div>
  );
};

// Root Route Handler - Redirects to /crm-platform unless calendar view is requested
const RootRouteHandler = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const view = searchParams.get('view');
  const objectName = searchParams.get('object');
  
  // If calendar view is requested, show the Dashboard (which has calendar support)
  if (view === 'calendar' && objectName) {
    return <Dashboard />;
  }
  
  const moduleCtx = React.useContext(ModuleContext);
  
  // If module context has data, use it immediately
  if (moduleCtx && !moduleCtx.loading && moduleCtx.tenantPlan) {
    const landingPage = moduleCtx.defaultLandingPage || '/crm-platform';
    return <Navigate to={landingPage} replace />;
  }

  // If still loading, show a brief spinner with timeout
  if (moduleCtx?.loading) {
    return <RootLoadingFallback moduleCtx={moduleCtx} />;
  }
  
  // Default fallback
  const landingPage = moduleCtx?.defaultLandingPage || '/crm-platform';
  return <Navigate to={landingPage} replace />;
};

/**
 * RootLoadingFallback - Brief wait for module context, then redirect
 */
const RootLoadingFallback = ({ moduleCtx }) => {
  const [timedOut, setTimedOut] = React.useState(false);
  
  React.useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Check if resolved while waiting
  if (moduleCtx && !moduleCtx.loading && moduleCtx.tenantPlan) {
    return <Navigate to={moduleCtx.defaultLandingPage || '/crm-platform'} replace />;
  }
  
  if (timedOut) {
    return <Navigate to={moduleCtx?.defaultLandingPage || '/crm-platform'} replace />;
  }
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );
};

// Main Dashboard with Lightning-style navigation
const Dashboard = () => {
  const { user, tenant, logout } = useAuth();
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [currentView, setCurrentView] = useState('list');
  const [showActivitiesCenter, setShowActivitiesCenter] = useState(false);
  const navigate = useNavigate();
  const location = window.location;

  const fetchObjects = async () => {
    try {
      const response = await axios.get(`${API}/objects`);
      setObjects(response.data);

      // Check URL for selected object, otherwise select first
      const params = new URLSearchParams(location.search);
      const objectName = params.get('object');

      if (objectName) {
        const obj = response.data.find(o => o.object_name === objectName);
        if (obj) {
          setSelectedObject(obj);
          return;
        }
      }

      if (response.data.length > 0 && !selectedObject) {
        setSelectedObject(response.data[0]);
        // Update URL with selected object
        navigate(`/?object=${response.data[0].object_name}&view=${currentView}`, { replace: true });
      }
    } catch (error) {
      console.error('Error fetching objects:', error);
      toast.error('Failed to load objects');
    }
  };

  // Refetch objects when returning to dashboard (e.g., from Setup)
  useEffect(() => {
    fetchObjects();
  }, [location.pathname]);

  // Parse URL parameters for state restoration
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const objectName = params.get('object');
    const view = params.get('view');

    if (view) {
      setCurrentView(view);
    }

    // Set selected object from URL if available
    if (objectName && objects.length > 0) {
      const obj = objects.find(o => o.object_name === objectName);
      if (obj) {
        setSelectedObject(obj);
      }
    }
  }, [location.search, objects]);

  // Update URL when object or view changes
  const handleObjectSelect = (object) => {
    setSelectedObject(object);
    setCurrentView('list'); // Reset to table view when switching modules
    navigate(`/?object=${object.object_name}&view=list`, { replace: true });
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    if (selectedObject) {
      navigate(`/?object=${selectedObject.object_name}&view=${view}`, { replace: true });
    }
  };

  const getObjectIcon = (objectName) => {
    switch (objectName) {
      case 'lead': case 'contact': case 'client': case 'patient':
        return <Users className="h-4 w-4" />;
      case 'account': case 'property':
        return <Building2 className="h-4 w-4" />;
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
      case 'event':
        return <CalendarIcon className="h-4 w-4" />;
      default:
        return <BarChart3 className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Lightning-style Header - COMPACT */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded flex items-center justify-center">
                  <BarChart3 className="h-3.5 w-3.5 text-white" />
                </div>
                <h1 className="text-sm font-semibold text-slate-800">
                  {tenant?.company_name}
                </h1>
              </div>

              {/* View Tabs - Compact */}
              <div className="flex ml-6">
                <div className="flex bg-slate-100 rounded p-0.5">
                  <Button
                    variant={currentView === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewChange('list')}
                    className={`h-7 px-2.5 text-xs ${currentView === 'list' ? 'bg-white shadow-sm' : ''}`}
                    data-testid="list-view-tab"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    List View
                  </Button>
                  <Button
                    variant={currentView === 'calendar' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewChange('calendar')}
                    className={`h-7 px-2.5 text-xs ${currentView === 'calendar' ? 'bg-white shadow-sm' : ''}`}
                    data-testid="calendar-view-tab"
                  >
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    Calendar
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Logged-in user display */}
              <div className="hidden sm:flex items-center space-x-2 text-sm text-slate-600 border-r border-slate-200 pr-3 mr-1">
                <span>Hi, {user?.first_name || 'User'}</span>
              </div>
              
              {/* Activities Center Button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-600"
                title="Activities"
                onClick={() => setShowActivitiesCenter(true)}
              >
                <Bell className="h-4 w-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-600"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate('/setup')}>
                    <Wrench className="h-4 w-4 mr-2" />
                    Setup
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-button" className="h-7 px-2 text-slate-600">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Activities Center Slide-out */}
      <ActivitiesCenter 
        isOpen={showActivitiesCenter} 
        onClose={() => setShowActivitiesCenter(false)} 
      />

      <div className="flex">
        {/* Lightning-style Sidebar - COMPACT */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-200 h-[calc(100vh-42px)] overflow-y-auto">
          <div className="p-3">
            <div className="space-y-0.5">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Objects
              </h3>
              {objects.map((object) => (
                <Button
                  key={object.id}
                  variant={selectedObject?.id === object.id ? "secondary" : "ghost"}
                  className={`w-full justify-start h-8 text-sm ${selectedObject?.id === object.id
                    ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                    : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  onClick={() => handleObjectSelect(object)}
                  data-testid={`object-${object.object_name}`}
                >
                  <div className="flex items-center space-x-2">
                    {getObjectIcon(object.object_name)}
                    <span className="font-medium text-sm">{object.object_plural}</span>
                  </div>
                </Button>
              ))}
            </div>
            
            {/* CRM Platform Section */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Platform
              </h3>
              <Button
                variant="ghost"
                className="w-full justify-start h-8 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => navigate('/crm-platform')}
              >
                <div className="flex items-center space-x-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="font-medium">CRM Console</span>
                </div>
              </Button>
              
              {/* Flow Builder Link - Goes to flows list */}
              <Button
                variant="ghost"
                className="w-full justify-start h-9 text-slate-700 hover:bg-slate-50 mt-1"
                onClick={() => navigate('/flows')}
              >
                <div className="flex items-center space-x-3">
                  <Zap className="h-4 w-4" />
                  <span className="font-medium">Flow Builder</span>
                </div>
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-slate-50">
          {currentView === 'list' && selectedObject && (
            <EnhancedObjectListView object={selectedObject} />
          )}
          {currentView === 'calendar' && (
            <CalendarView />
          )}
        </main>
      </div>
    </div>
  );
};

// Lightning-style Record Detail Page with Advanced Layouts

// Lazy load Calendar component to prevent initialization errors
const CalendarViewComponent = lazy(() => import('./components/CalendarViewComponent'));

// Calendar View Component with lazy loading
const CalendarView = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
            <p className="text-slate-500 mb-2">Loading calendar...</p>
            <p className="text-sm text-slate-400">Please wait...</p>
          </div>
        </div>
      }
    >
      <CalendarViewComponent />
    </Suspense>
  );
};

// Global Activities Center Component (Salesforce-style)
const ActivitiesCenter = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState('open');
  const [eventFilter, setEventFilter] = useState('upcoming');
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchActivities();
    }
  }, [isOpen, activeTab]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const [tasksRes, eventsRes] = await Promise.all([
        axios.get(`${API}/objects/task/records`),
        axios.get(`${API}/objects/event/records`)
      ]);
      
      const tasksData = tasksRes.data.records || [];
      const eventsData = eventsRes.data.records || [];
      
      setTasks(tasksData);
      setEvents(eventsData);
      
      // Create timeline from both
      const allActivities = [
        ...tasksData.map(t => ({ ...t, activity_type: 'task' })),
        ...eventsData.map(e => ({ ...e, activity_type: 'event' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setTimeline(allActivities.slice(0, 20));
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'completed' || statusLower === 'closed') return 'bg-green-100 text-green-700';
    if (statusLower === 'in progress' || statusLower === 'started') return 'bg-blue-100 text-blue-700';
    if (statusLower === 'overdue') return 'bg-red-100 text-red-700';
    if (statusLower === 'high' || statusLower === 'urgent') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getPriorityColor = (priority) => {
    const p = priority?.toLowerCase() || '';
    if (p === 'high') return 'bg-red-100 text-red-700';
    if (p === 'medium') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const filteredTasks = tasks.filter(task => {
    const status = task.data?.status?.toLowerCase() || '';
    if (taskFilter === 'open') return status !== 'completed' && status !== 'closed';
    if (taskFilter === 'completed') return status === 'completed' || status === 'closed';
    if (taskFilter === 'overdue') return isOverdue(task.data?.due_date) && status !== 'completed';
    return true;
  });

  const filteredEvents = events.filter(event => {
    const startDate = new Date(event.data?.start_date || event.created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventFilter === 'upcoming') return startDate >= today;
    if (eventFilter === 'past') return startDate < today;
    return true;
  });

  const handleTaskClick = (task) => {
    navigate(`/crm/task/${task.series_id}`);
    onClose();
  };

  const handleEventClick = (event) => {
    navigate(`/crm/event/${event.series_id}`);
    onClose();
  };

  const openTasksCount = tasks.filter(t => {
    const status = t.data?.status?.toLowerCase() || '';
    return status !== 'completed' && status !== 'closed';
  }).length;

  const upcomingEventsCount = events.filter(e => {
    const startDate = new Date(e.data?.start_date || e.created_at);
    return startDate >= new Date();
  }).length;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b bg-gradient-to-r from-indigo-500 to-indigo-600">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 rounded-lg p-2">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Activities</h2>
                <p className="text-sm text-indigo-100">
                  {openTasksCount} open tasks • {upcomingEventsCount} upcoming events
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 p-1 m-2 bg-slate-100 rounded-lg">
              <TabsTrigger value="tasks" className="flex items-center gap-1.5 text-sm">
                <ListTodo className="h-4 w-4" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-1.5 text-sm">
                <CalendarDays className="h-4 w-4" />
                Events
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4" />
                Timeline
              </TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="flex-1 flex flex-col m-0 px-2">
              {/* Filter */}
              <div className="flex items-center gap-2 py-2 px-2">
                <Select value={taskFilter} onValueChange={setTaskFilter}>
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open Tasks</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="all">All Tasks</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-slate-500">{filteredTasks.length} tasks</span>
              </div>

              {/* Task List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CheckSquare className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No {taskFilter} tasks</p>
                  </div>
                ) : (
                  <div className="space-y-2 px-2 pb-4">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {task.data?.subject || task.data?.name || 'Untitled Task'}
                            </p>
                            {task.data?.description && (
                              <p className="text-sm text-slate-500 truncate mt-0.5">
                                {task.data.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {task.data?.due_date && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  isOverdue(task.data.due_date) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {formatDate(task.data.due_date)}
                                </span>
                              )}
                              {task.data?.priority && (
                                <Badge className={`text-xs ${getPriorityColor(task.data.priority)}`}>
                                  {task.data.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Badge className={`text-xs ${getStatusColor(task.data?.status)}`}>
                            {task.data?.status || 'Open'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="flex-1 flex flex-col m-0 px-2">
              {/* Filter */}
              <div className="flex items-center gap-2 py-2 px-2">
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                    <SelectItem value="all">All Events</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-slate-500">{filteredEvents.length} events</span>
              </div>

              {/* Events List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CalendarDays className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No {eventFilter} events</p>
                  </div>
                ) : (
                  <div className="space-y-2 px-2 pb-4">
                    {filteredEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-12 text-center">
                            <div className="text-xs font-medium text-indigo-600 uppercase">
                              {new Date(event.data?.start_date || event.created_at).toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                            <div className="text-xl font-bold text-slate-900">
                              {new Date(event.data?.start_date || event.created_at).getDate()}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {event.data?.subject || event.data?.name || 'Untitled Event'}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                {formatTime(event.data?.start_date)}
                                {event.data?.end_date && ` - ${formatTime(event.data.end_date)}`}
                              </span>
                            </div>
                            {event.data?.location && (
                              <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                <Building className="h-3.5 w-3.5" />
                                <span className="truncate">{event.data.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="flex-1 flex flex-col m-0 px-2">
              <div className="py-2 px-2">
                <p className="text-sm text-slate-500">Recent activity</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Activity className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  <div className="relative px-2 pb-4">
                    {/* Timeline line */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200"></div>
                    
                    <div className="space-y-4">
                      {timeline.map((item, idx) => (
                        <div key={item.id} className="relative flex items-start gap-4">
                          {/* Timeline dot */}
                          <div className={`relative z-10 w-3 h-3 rounded-full mt-1.5 ${
                            item.activity_type === 'task' ? 'bg-blue-500' : 'bg-green-500'
                          }`}></div>
                          
                          {/* Content */}
                          <div
                            onClick={() => item.activity_type === 'task' ? handleTaskClick(item) : handleEventClick(item)}
                            className="flex-1 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 transition-all"
                          >
                            <div className="flex items-center gap-2">
                              {item.activity_type === 'task' ? (
                                <ListTodo className="h-4 w-4 text-blue-500" />
                              ) : (
                                <CalendarDays className="h-4 w-4 text-green-500" />
                              )}
                              <span className="text-xs text-slate-500 capitalize">{item.activity_type}</span>
                              <span className="text-xs text-slate-400">•</span>
                              <span className="text-xs text-slate-500">
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="font-medium text-slate-900 mt-1 truncate">
                              {item.data?.subject || item.data?.name || 'Untitled'}
                            </p>
                            {item.data?.status && (
                              <Badge className={`text-xs mt-2 ${getStatusColor(item.data.status)}`}>
                                {item.data.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="p-3 border-t bg-slate-50">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate('/task/new');
                  onClose();
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Task
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate('/event/new');
                  onClose();
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Event
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-600">Loading your CRM...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/auth" replace />;
};

// Main App Component
import { Provider as ReduxProvider } from 'react-redux';
import store from './store';

// Field-Level Security Provider
import { FieldSecurityProvider } from './contexts/FieldSecurityContext';

// Module Entitlements Provider
import { ModuleProvider } from './context/ModuleContext';
import ModuleContext from './context/ModuleContext';

function App() {
  return (
    <div className="App">
      <ReduxProvider store={store}>
        <AuthProvider>
          <ModuleProvider>
            <FieldSecurityProvider>
              <CreateRecordProvider>
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </CreateRecordProvider>
            </FieldSecurityProvider>
          </ModuleProvider>
          <Toaster />
          <SonnerToaster richColors position="top-right" />
        </AuthProvider>
      </ReduxProvider>
    </div>
  );
}

// Export components for use in AppRoutes
export {
  ProtectedRoute,
  RootRouteHandler,
  AuthForm,
  useAuth,
  ManageObjectsTab,
  AddCustomFieldDialog,
  EditCustomFieldDialog,
  EnhancedObjectListView,
};

export default App;