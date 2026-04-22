import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, FileText, Edit, Trash2, Send, Clock, CheckCircle, LayoutGrid, List, Filter,
  ArrowUpDown, ChevronDown, Sparkles, Eye, Mail, MoreVertical, Download, GitBranch, History,
  Layers, Package, XCircle, AlertTriangle, Ban, Users, Loader2, Code, MessageSquare
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import TemplateAnalytics from '../components/TemplateAnalytics';
import EmailHistoryTable from '../components/EmailHistoryTable';
import DeveloperSettingsPage from './DeveloperSettingsPage';
import EmailTemplatesPage from './EmailTemplatesPage';

const TEMPLATE_TYPE_COLORS = {
  quotation: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  nda: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  invoice: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  contract: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  proposal: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  custom: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-500' }
};

const DocFlowDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [templates, setTemplates] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [emailHistory, setEmailHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'templates');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [showDeleteMenu, setShowDeleteMenu] = useState(null);
  // Version control
  const [versionMenuOpen, setVersionMenuOpen] = useState(null); // template id whose version menu is open
  const [versionCache, setVersionCache] = useState({}); // { templateId: [versions] }

  // Pagination
  const [templatePagination, setTemplatePagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    pages: 1
  });
  const [tplPageSize, setTplPageSize] = useState(12);
  const [tplPage, setTplPage] = useState(1);
  const [emailPagination, setEmailPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1
  });

  // Document listing controls
  const [docStatusFilter, setDocStatusFilter] = useState('all');
  const [docSortOrder, setDocSortOrder] = useState('newest');
  const [docPageSize, setDocPageSize] = useState(10);
  const [docPage, setDocPage] = useState(1);

  // Package listing
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [pkgSearch, setPkgSearch] = useState('');
  const [pkgViewMode, setPkgViewMode] = useState('grid');
  const [deletingPkgId, setDeletingPkgId] = useState(null);
  const [showPkgDeleteModal, setShowPkgDeleteModal] = useState(false);
  const [pkgDeleting, setPkgDeleting] = useState(false);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgPageSize] = useState(12);
  const [pkgStatusFilter, setPkgStatusFilter] = useState('all');
  const [selectedRejectDoc, setSelectedRejectDoc] = useState(null);
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const loadTemplates = async (page = 1) => {
    try {
      const templateData = await docflowService.getTemplates(searchQuery, '', page, templatePagination.limit);
      setTemplates(templateData.templates || templateData || []);
      setTemplatePagination(prev => ({
        ...prev,
        page: templateData.page || page,
        total: templateData.total || 0,
        pages: templateData.pages || 1
      }));
    } catch (e) {
      console.error('Error loading templates:', e);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      await loadTemplates(1);

      try {
        await loadDocuments(1);
      } catch (e) { /* optional */ }

      try {
        await loadEmails(1);
      } catch (e) { /* optional */ }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadEmails = async (page = 1) => {
    try {
      const emailData = await docflowService.getEmailHistory({ page, limit: emailPagination.limit });
      setEmailHistory(emailData.history || []);
      setEmailPagination(prev => ({
        ...prev,
        page: emailData.page || page,
        total: emailData.total || 0,
        pages: emailData.pages || 1
      }));
    } catch (e) {
      console.error('Error loading emails:', e);
    }
  };

  const loadDocuments = async (page = 1, status = docStatusFilter, search = searchQuery, sort = docSortOrder) => {
    try {
      const params = {
        page,
        limit: docPageSize,
        status: status === 'all' ? undefined : status,
        search: search || undefined,
        sort_order: sort
      };
      const docData = await docflowService.getDocuments(params);
      setDocuments(docData.documents || []);
      setDocTotal(docData.total || 0);
    } catch (e) {
      console.error('Error loading documents:', e);
    }
  };

  const loadPackages = async () => {
    try {
      setPackagesLoading(true);
      const res = await docflowService.getPackages();
      const data = res.data || res;
      setPackages(data.packages || []);
    } catch (e) {
      console.error('Error loading packages:', e);
    } finally {
      setPackagesLoading(false);
    }
  };

  const handleDeletePackage = async () => {
    if (!deletingPkgId) return;
    try {
      setPkgDeleting(true);
      await docflowService.deletePackage(deletingPkgId);
      toast.success('Package deleted');
      setPackages(prev => prev.filter(p => p.id !== deletingPkgId));
    } catch (e) {
      toast.error('Failed to delete package');
    } finally {
      setPkgDeleting(false);
      setShowPkgDeleteModal(false);
      setDeletingPkgId(null);
    }
  };



  const loadVersions = useCallback(async (templateId) => {
    if (versionCache[templateId]) return versionCache[templateId];
    try {
      const data = await docflowService.getTemplateVersions(templateId);
      const versions = data.versions || [];
      setVersionCache(prev => ({ ...prev, [templateId]: versions }));
      return versions;
    } catch (e) {
      console.warn('Could not load versions for', templateId, e);
      return [];
    }
  }, [versionCache]);

  const handleVersionToggle = async (templateId) => {
    if (versionMenuOpen === templateId) {
      setVersionMenuOpen(null);
      return;
    }
    setVersionMenuOpen(templateId);
    await loadVersions(templateId);
  };

  const handleEditVersion = async (sourceTemplateId) => {
    try {
      const result = await docflowService.createNewVersion(sourceTemplateId);
      if (result.success && result.template) {
        toast.success(`New v${result.template.version} created! Opening editor...`);
        navigate(`/setup/docflow/templates/${result.template.id}`);
      }
    } catch (err) {
      toast.error('Failed to create new version');
    }
  };

  useEffect(() => {
    if (activeTab === 'emails') {
      loadEmails(emailPagination.page);
    }
  }, [activeTab, emailPagination.page]);

  useEffect(() => {
    if (activeTab === 'packages') {
      loadPackages();
    }
  }, [activeTab]);


  useEffect(() => {
    if (activeTab === 'templates') {
      loadTemplates(templatePagination.page);
    }
  }, [activeTab, templatePagination.page, searchQuery]);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadDocuments(docPage, docStatusFilter, searchQuery, docSortOrder);
    }
  }, [activeTab, docPage, docStatusFilter, searchQuery, docSortOrder]);

  // Real-time status updates for Documents tab
  useEffect(() => {
    let interval = null;
    if (activeTab === 'documents') {
      interval = setInterval(() => {
        loadDocuments(docPage, docStatusFilter, searchQuery, docSortOrder);
      }, 10000); // Poll every 10 seconds
    }
    return () => { if (interval) clearInterval(interval); };
  }, [activeTab, docPage, docStatusFilter, searchQuery, docSortOrder]);

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await docflowService.deleteTemplate(templateId);
      toast.success('Template deleted');
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      setShowDeleteMenu(null);
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const filteredTemplates = useMemo(() => {
    let filtered = [...templates];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => (t.template_type || t.type) === typeFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => {
        const s = (t.status || 'draft').toLowerCase();
        return statusFilter === 'active' ? s === 'active' : s !== 'active';
      });
    }
    if (sortBy === 'name') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else {
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    return filtered;
  }, [templates, searchQuery, typeFilter, statusFilter, sortBy]);

  const tplTotalPages = Math.max(1, Math.ceil(filteredTemplates.length / tplPageSize));
  const paginatedTemplates = useMemo(() => {
    const start = (tplPage - 1) * tplPageSize;
    return filteredTemplates.slice(start, start + tplPageSize);
  }, [filteredTemplates, tplPage, tplPageSize]);

  const filteredDocuments = useMemo(() => {
    // With server-side filtering, we just return the documents
    // But we might still want to filter out generator parents if the backend didn't
    return documents.filter(d => !d.is_public_generator);
  }, [documents]);

  const paginatedDocuments = useMemo(() => {
    // With server-side pagination, documents is already the current page
    return filteredDocuments;
  }, [filteredDocuments]);

  // Since we are doing server-side pagination, we need the total count from backend
  const [docTotal, setDocTotal] = useState(0);
  const docTotalPages = Math.max(1, Math.ceil(docTotal / docPageSize));

  // Package filtering + pagination
  const filteredPackages = useMemo(() => {
    let filtered = [...packages];
    if (pkgSearch.trim()) {
      const q = pkgSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q) ||
        (p.recipients || []).some(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q))
      );
    }
    if (pkgStatusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === pkgStatusFilter);
    }
    return filtered;
  }, [packages, pkgSearch, pkgStatusFilter]);

  const pkgTotalPages = Math.max(1, Math.ceil(filteredPackages.length / pkgPageSize));
  const paginatedPackages = useMemo(() => {
    const start = (pkgPage - 1) * pkgPageSize;
    return filteredPackages.slice(start, start + pkgPageSize);
  }, [filteredPackages, pkgPage, pkgPageSize]);

  // Reset page on filter/search change
  useEffect(() => { setPkgPage(1); }, [pkgSearch, pkgStatusFilter]);


  const filteredEmailHistory = useMemo(() => {
    let filtered = [...emailHistory];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        (e.template_name || '').toLowerCase().includes(q) ||
        (e.recipient_email || '').toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => new Date(b.sent_at || b.created_at || 0) - new Date(a.sent_at || a.created_at || 0));
    return filtered;
  }, [emailHistory, searchQuery]);

  const handleDownload = (documentId, version) => {
    // Generate the correct URL to hit the API download endpoint safely
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    const url = `${backendUrl}/api/docflow/documents/${documentId}/download/${version}`;

    const token = localStorage.getItem('token');

    // We create a temporary anchor element fetching via the browser natively
    // We attach token via query param if the endpoint supported it, but since it's an authenticated endpoint, 
    // fetch request is safer, convert to blob, then download.
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
      })
      .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `document_${version}.pdf`; // The backend actually sets Content-Disposition
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      })
      .catch(err => {
        console.error(err);
        toast.error(`Failed to download ${version} document`);
      });
  };

  const handleViewDocument = (documentId) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    const version = 'unsigned';
    const url = `${backendUrl}/api/docflow/documents/${documentId}/download/${version}`;
    const token = localStorage.getItem('token');

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(response => {
        if (!response.ok) throw new Error('View failed');
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      })
      .catch(err => {
        console.error(err);
        toast.error('Failed to view document');
      });
  };

  const stats = {
    total: templates.length,
    active: templates.filter(t => t.status === 'active').length,
    drafts: templates.filter(t => t.status !== 'active').length,
    documents: documents.length,
    emailsSent: emailHistory.length
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  const getTypeConfig = (type) => TEMPLATE_TYPE_COLORS[type] || TEMPLATE_TYPE_COLORS.custom;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading DocFlow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <FileText className="h-8 w-8 text-indigo-200" />
                Cluvik DocFlow
              </h1>
              <p className="text-indigo-200 mt-1 text-sm">AI-Powered Document Operating System</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/setup')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white border border-white/25 rounded-lg hover:bg-white/15 font-semibold transition-all"
                data-testid="header-back-setup-btn"
              >
                {/* <ArrowLeft className="h-4 w-4" /> */}
                Back to Main
              </button>
              {activeTab === 'packages' ? (
                <button
                  onClick={() => navigate('/setup/docflow/packages/create')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 font-semibold shadow-lg shadow-indigo-900/20 transition-all"
                  data-testid="header-new-package-btn"
                >
                  <Plus className="h-5 w-5" />
                  New Package
                </button>
              ) : (
                <button
                  onClick={() => navigate('/setup/docflow/templates/new')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 font-semibold shadow-lg shadow-indigo-900/20 transition-all"
                  data-testid="header-new-template-btn"
                >
                  <Plus className="h-5 w-5" />
                  New Template
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    

      {/* Navbar — Clean tabs only */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 py-3" data-testid="main-nav">
            {[
              { id: 'templates', label: 'Templates', icon: FileText },
              { id: 'packages', label: 'Packages', icon: Layers },
              { id: 'documents', label: 'Documents', icon: Send },
              { id: 'analytics', label: 'Analytics', icon: Eye },
              { id: 'emails', label: 'Email History', icon: Mail },
              { id: 'email_templates', label: 'Email Templates', icon: Mail },
              { id: 'developer', label: 'Developer', icon: Code },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchParams({ tab: tab.id }); }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                data-testid={`nav-tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Template Filter Bar — shown only on Templates tab */}
      {activeTab === 'templates' && (
        <div className="bg-white border-b border-gray-100 shadow-sm" data-testid="tpl-filter-bar">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setTplPage(1); }}
                  placeholder="Search templates..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                  data-testid="tpl-search-input"
                />
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-gray-200" />

              {/* Type Filter */}
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setTplPage(1); }}
                  className="appearance-none pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white cursor-pointer"
                  data-testid="tpl-type-filter"
                >
                  <option value="all">All Types</option>
                  <option value="contract">Contract</option>
                  <option value="quotation">Quotation</option>
                  <option value="invoice">Invoice</option>
                  <option value="nda">NDA</option>
                  <option value="proposal">Proposal</option>
                  <option value="custom">Custom</option>
                </select>
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Status Filter */}
              <div className="flex bg-gray-100 rounded-lg p-0.5" data-testid="tpl-status-filter">
                {['all', 'active', 'draft'].map(s => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setTplPage(1); }}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md capitalize transition-all ${
                      statusFilter === s
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    data-testid={`tpl-status-${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-gray-200" />

              {/* Sort */}
              <div className="relative">
                <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setTplPage(1); }}
                  className="appearance-none pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
                  data-testid="tpl-sort-toggle"
                >
                  <option value="created_at">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Page Size */}
              <select
                value={tplPageSize}
                onChange={(e) => { setTplPageSize(Number(e.target.value)); setTplPage(1); }}
                className="px-2 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                data-testid="tpl-page-size"
              >
                <option value={12}>12 / page</option>
                <option value={24}>24 / page</option>
                <option value={48}>48 / page</option>
              </select>

              {/* View Toggle */}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50'}`}
                  data-testid="tpl-view-grid"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50'}`}
                  data-testid="tpl-view-list"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'templates' && (
          filteredTemplates.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {searchQuery ? 'No templates found' : 'No templates yet'}
              </h3>
              <p className="text-gray-500 mb-6">
                {searchQuery ? 'Try a different search term' : 'Create your first template to get started'}
              </p>
              {!searchQuery && (
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => navigate('/setup/docflow/templates/new')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                  >
                    <Plus className="h-5 w-5" />
                    Upload Template
                  </button>
                  <button
                    onClick={() => navigate('/setup/docflow/templates/new')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 font-medium"
                  >
                    <Sparkles className="h-5 w-5" />
                    AI Generate
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedTemplates.map(template => {
                const type = template.template_type || template.type || 'custom';
                const typeConfig = getTypeConfig(type);
                return (
                  <div
                    key={template.id}
                    className="bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-indigo-200 transition-all duration-200 overflow-hidden group"
                  >
                    {/* Card Header */}
                    <div className="p-5 pb-3">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${typeConfig.bg} ${typeConfig.text} capitalize`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${typeConfig.dot}`} />
                            {type}
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase border ${
                            template.status === 'active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-50 text-gray-400 border-gray-100'
                          }`}>
                            {template.status || 'draft'}
                          </span>
                          {/* Version Badge — next to status */}
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVersionToggle(template.id); }}
                              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                              data-testid={`version-toggle-${template.id}`}
                            >
                              <GitBranch className="h-2.5 w-2.5" />
                              v{template.version || 1}
                              {template.is_latest !== false && <span className="ml-0.5 text-green-600">Latest</span>}
                              <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                            {versionMenuOpen === template.id && (
                              <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-30" data-testid={`version-menu-${template.id}`}>
                                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><History className="h-3 w-3" /> Version History</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {(versionCache[template.id] || []).map(v => (
                                    <div key={v.id} className="px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-semibold text-gray-800">v{v.version}</span>
                                          {v.is_latest && <span className="text-[8px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-bold">LATEST</span>}
                                          {v.created_from_version && <span className="text-[9px] text-gray-400">from v{v.created_from_version}</span>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setVersionMenuOpen(null); navigate(`/setup/docflow/templates/${v.id}`); }}
                                            className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                                            title="View"
                                          >
                                            <Eye className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setVersionMenuOpen(null); handleEditVersion(v.id); }}
                                            className="p-1 text-gray-400 hover:text-emerald-600 rounded transition-colors"
                                            title="Edit (creates new version)"
                                          >
                                            <Edit className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {(!versionCache[template.id] || versionCache[template.id].length === 0) && (
                                    <div className="px-3 py-3 text-center text-xs text-gray-400">Loading...</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowDeleteMenu(showDeleteMenu === template.id ? null : template.id); }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {showDeleteMenu === template.id && (
                            <div className="absolute right-0 top-8 w-40 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-20">
                              <button
                                onClick={() => { navigate(`/setup/docflow/templates/${template.id}`); setShowDeleteMenu(null); }}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Edit className="h-4 w-4" /> Edit
                              </button>
                              <button
                                onClick={() => { navigate(`/setup/docflow/documents/generate?template=${template.id}`); setShowDeleteMenu(null); }}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Send className="h-4 w-4" /> Generate
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(template.id)}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <h3
                        className="text-base font-semibold text-gray-900 mb-1 cursor-pointer hover:text-indigo-600 transition-colors"
                        onClick={() => navigate(`/setup/docflow/templates/${template.id}`)}
                      >
                        {template.name || 'Untitled Template'}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3 min-h-[40px]">
                        {template.description || 'No description'}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(template.updated_at || template.created_at)}
                        </span>
                        {template.source === 'ai_generated' && (
                          <span className="flex items-center gap-1 text-purple-500">
                            <Sparkles className="h-3.5 w-3.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => navigate(`/setup/docflow/templates/${template.id}`)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/setup/docflow/documents/generate?template=${template.id}`)}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Generate Document"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Template</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Version</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Updated</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTemplates.map(template => {
                    const type = template.template_type || template.type || 'custom';
                    const typeConfig = getTypeConfig(type);
                    return (
                      <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div
                            onClick={() => navigate(`/setup/docflow/templates/${template.id}`)}
                            className="cursor-pointer"
                          >
                            <p className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">{template.name}</p>
                            <p className="text-sm text-gray-500 truncate max-w-md">{template.description || 'No description'}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${typeConfig.bg} ${typeConfig.text} capitalize`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${typeConfig.dot}`} />
                            {type}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVersionToggle(template.id); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                              data-testid={`list-version-toggle-${template.id}`}
                            >
                              <GitBranch className="h-3 w-3" />
                              v{template.version || 1}
                              {template.is_latest !== false && <span className="ml-0.5 text-[9px] text-green-600">Latest</span>}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {versionMenuOpen === template.id && (
                              <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-30" data-testid={`list-version-menu-${template.id}`}>
                                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1"><History className="h-3 w-3" /> Versions</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {(versionCache[template.id] || []).map(v => (
                                    <div key={v.id} className="px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-gray-800">v{v.version}</span>
                                        {v.is_latest && <span className="text-[8px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-bold">LATEST</span>}
                                        {v.created_from_version && <span className="text-[9px] text-gray-400">from v{v.created_from_version}</span>}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); setVersionMenuOpen(null); navigate(`/setup/docflow/templates/${v.id}`); }} className="p-1 text-gray-400 hover:text-indigo-600 rounded" title="View"><Eye className="h-3 w-3" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); setVersionMenuOpen(null); handleEditVersion(v.id); }} className="p-1 text-gray-400 hover:text-emerald-600 rounded" title="Edit (new version)"><Edit className="h-3 w-3" /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${template.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                            } capitalize`}>
                            {template.status || 'draft'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {formatDate(template.updated_at || template.created_at)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/setup/docflow/templates/${template.id}`)}
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => navigate(`/setup/docflow/documents/generate?template=${template.id}`)}
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Generate"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Template Pagination */}
        {activeTab === 'templates' && filteredTemplates.length > 0 && (
          <div className="mt-6 flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm" data-testid="tpl-pagination">
            <div className="text-xs text-gray-500">
              Showing <span className="font-semibold">{Math.min(filteredTemplates.length, (tplPage - 1) * tplPageSize + 1)}</span> to{' '}
              <span className="font-semibold">{Math.min(tplPage * tplPageSize, filteredTemplates.length)}</span> of{' '}
              <span className="font-semibold">{filteredTemplates.length}</span> templates
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTplPage(p => Math.max(1, p - 1))}
                disabled={tplPage === 1}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
                data-testid="tpl-prev-page"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 px-2">
                Page {tplPage} of {tplTotalPages}
              </span>
              <button
                onClick={() => setTplPage(p => Math.min(tplTotalPages, p + 1))}
                disabled={tplPage === tplTotalPages}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
                data-testid="tpl-next-page"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div>
            {/* Document Filters Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 bg-white px-5 py-3 rounded-xl border border-gray-200" data-testid="doc-filters-bar">
              <div className="flex flex-wrap items-center gap-2">
                {['all', 'generated', 'sent', 'viewed', 'signed', 'completed'].map(status => (
                  <button
                    key={status}
                    onClick={() => { setDocStatusFilter(status); setDocPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full capitalize transition-colors ${
                      docStatusFilter === status
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                    data-testid={`doc-filter-${status}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {/* Documents Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setDocPage(1); }}
                    placeholder="Search documents..."
                    className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-48 md:w-64"
                    data-testid="doc-search-input"
                  />
                </div>

                <button
                  onClick={() => setDocSortOrder(docSortOrder === 'newest' ? 'oldest' : 'newest')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  data-testid="doc-sort-toggle"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {docSortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
                </button>
                <select
                  value={docPageSize}
                  onChange={(e) => { setDocPageSize(Number(e.target.value)); setDocPage(1); }}
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                  data-testid="doc-page-size"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {paginatedDocuments.length === 0 ? (
              <div className="text-center py-16">
                <Send className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {docStatusFilter !== 'all' ? `No ${docStatusFilter} documents` : 'No Documents Yet'}
                </h3>
                <p className="text-gray-500">
                  {docStatusFilter !== 'all' ? 'Try a different filter' : 'Generate a document from a template to get started'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Document</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Recipient</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Created</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedDocuments.map(doc => {
                    // Extract recipient info for display
                    const recipients = doc.recipients || [];
                    const firstRecipient = recipients[0] || {};
                    let recipientDisplay = doc.recipient_name || firstRecipient.name || firstRecipient.email || '';
                    const recipientEmail = doc.recipient_email || firstRecipient.email || '';
                    
                    // Handle placeholder / empty names
                    if (!recipientDisplay || recipientDisplay === 'Public Viewer') {
                      recipientDisplay = recipientEmail || 'Pending Verification';
                    }
                    
                    // Get a valid public token for view link
                    const viewToken = doc.public_token || firstRecipient.public_token || '';
                    
                    return (
                    <tr key={doc.id} className="hover:bg-gray-50" data-testid={`document-row-${doc.id}`}>
                      <td className="px-5 py-4 font-medium text-gray-900">{doc.template_name || 'Document'}</td>
                      <td className="px-5 py-4 text-sm text-gray-600" data-testid={`doc-recipient-${doc.id}`}>
                        <div>{recipientDisplay}</div>
                        {recipientEmail && recipientDisplay !== recipientEmail && (
                          <div className="text-xs text-gray-400">{recipientEmail}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full capitalize ${doc.status === 'signed' || doc.status === 'completed' ? 'bg-green-100 text-green-700' :
                              doc.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                                doc.status === 'viewed' ? 'bg-yellow-100 text-yellow-700' :
                                  doc.status === 'declined' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                            }`} data-testid={`doc-status-${doc.id}`}>
                            {doc.status || 'draft'}
                          </span>
                          {doc.status === 'declined' && doc.reject_reason && (
                            <button
                              onClick={() => { setSelectedRejectDoc(doc); setShowRejectReasonModal(true); }}
                              className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              title="View rejection reason"
                              data-testid={`doc-reject-reason-${doc.id}`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500" title={doc.created_at ? new Date(doc.created_at).toLocaleString() : ''} data-testid={`doc-created-${doc.id}`}>
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownload(doc.id, 'unsigned')}
                            className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                            title="Download Original"
                            data-testid={`doc-download-${doc.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {(doc.status === 'signed' || doc.status === 'completed') && (
                            <button
                              onClick={() => handleDownload(doc.id, 'signed')}
                              className="p-2 text-green-500 hover:text-green-700 rounded-lg hover:bg-green-50"
                              title="Download Signed PDF"
                              data-testid={`doc-download-signed-${doc.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Document Pagination */}
          {docTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-200" data-testid="doc-pagination">
              <div className="text-xs text-gray-500">
                Showing <span className="font-semibold">{Math.min(docTotal, (docPage - 1) * docPageSize + 1)}</span> to{' '}
                <span className="font-semibold">{Math.min(docPage * docPageSize, docTotal)}</span> of{' '}
                <span className="font-semibold">{docTotal}</span> documents
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDocPage(p => Math.max(1, p - 1))}
                  disabled={docPage === 1}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  data-testid="doc-prev-page"
                >
                  Previous
                </button>
                <span className="flex items-center px-3 text-xs text-gray-500">
                  Page {docPage} of {docTotalPages}
                </span>
                <button
                  onClick={() => setDocPage(p => Math.min(docTotalPages, p + 1))}
                  disabled={docPage === docTotalPages}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  data-testid="doc-next-page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </div>
        )}

        {activeTab === 'packages' && (
          <div data-testid="packages-tab">
            {/* Search / Filter / View Toggle Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={pkgSearch}
                  onChange={(e) => setPkgSearch(e.target.value)}
                  placeholder="Search packages by name, status, or recipient..."
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  data-testid="pkg-search-input"
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Status filter */}
                <select
                  value={pkgStatusFilter}
                  onChange={(e) => setPkgStatusFilter(e.target.value)}
                  className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="pkg-status-filter"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="voided">Voided</option>
                  <option value="expired">Expired</option>
                </select>
                {/* View toggle */}
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5" data-testid="pkg-view-toggle">
                  <button
                    onClick={() => setPkgViewMode('grid')}
                    className={`p-2 rounded-md transition-colors ${pkgViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    data-testid="pkg-view-grid-btn"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPkgViewMode('table')}
                    className={`p-2 rounded-md transition-colors ${pkgViewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    data-testid="pkg-view-table-btn"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Package List */}
            {packagesLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : filteredPackages.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {pkgSearch || pkgStatusFilter !== 'all' ? 'No packages match your search' : 'No packages yet'}
                </h3>
                <p className="text-gray-500 mb-6">
                  {pkgSearch || pkgStatusFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria.'
                    : 'Create your first multi-document package to get started.'}
                </p>
                {!pkgSearch && pkgStatusFilter === 'all' && (
                  <button
                    onClick={() => navigate('/setup/docflow/packages/create')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                    data-testid="create-package-btn"
                  >
                    <Plus className="h-5 w-5" /> Create Package
                  </button>
                )}
              </div>
            ) : pkgViewMode === 'grid' ? (
              /* ── Grid View ── */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedPackages.map((pkg) => {
                  const statusMap = {
                    draft:       { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400',   label: 'Draft' },
                    active:      { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
                    in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'In Progress' },
                    completed:   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
                    voided:      { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Voided' },
                    expired:     { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Expired' },
                    declined:    { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Declined' },
                  };
                  const sCfg = statusMap[pkg.status] || statusMap.active;
                  const docs = pkg.documents || [];
                  const runsCount = pkg.runs_count || 0;
                  const isBlueprint = pkg.status === 'active' || pkg.status === 'draft';

                  return (
                    <div
                      key={pkg.id}
                      className="bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-indigo-200 transition-all duration-200 overflow-hidden group"
                      data-testid={`package-card-${pkg.id}`}
                    >
                      <div className="p-5 pb-3 cursor-pointer" onClick={() => navigate(`/setup/docflow/packages/${pkg.id}`)}>
                        <div className="flex items-start justify-between mb-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${sCfg.bg} ${sCfg.text} capitalize`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                            {sCfg.label}
                          </span>
                          {runsCount > 0 && (
                            <span className="text-[10px] text-gray-400 font-medium">{runsCount} send{runsCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors truncate">
                          {pkg.name || 'Untitled Package'}
                        </h3>
                      </div>
                      <div className="px-5 pb-4">
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">
                          {new Date(pkg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingPkgId(pkg.id); setShowPkgDeleteModal(true); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group-hover:opacity-100"
                            title="Delete package"
                            data-testid={`delete-pkg-btn-${pkg.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {isBlueprint && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/setup/docflow/packages/${pkg.id}/send`); }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                              data-testid={`send-pkg-btn-${pkg.id}`}
                            >
                              <Send className="h-3 w-3" /> Send
                            </button>
                          )}
                          
                          {/* <span
                            onClick={() => navigate(`/setup/docflow/packages/${pkg.id}`)}
                            className="text-xs text-indigo-500 font-medium cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          >
                            Open <ChevronDown className="h-3 w-3 -rotate-90" />
                          </span> */}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Table View ── */
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="pkg-table-view">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package Name</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Docs</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sends</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPackages.map((pkg) => {
                      const statusMap = {
                        draft:       { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400',   label: 'Draft' },
                        active:      { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
                        in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'In Progress' },
                        completed:   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
                        voided:      { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Voided' },
                        expired:     { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Expired' },
                        declined:    { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Declined' },
                      };
                      const sCfg = statusMap[pkg.status] || statusMap.active;
                      const docs = pkg.documents || [];
                      const runsCount = pkg.runs_count || 0;
                      const isBlueprint = pkg.status === 'active' || pkg.status === 'draft';

                      return (
                        <tr
                          key={pkg.id}
                          onClick={() => navigate(`/setup/docflow/packages/${pkg.id}`)}
                          className="border-b border-gray-50 hover:bg-indigo-50/30 cursor-pointer transition-colors"
                          data-testid={`package-row-${pkg.id}`}
                        >
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-semibold text-gray-800">{pkg.name || 'Untitled Package'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full ${sCfg.bg} ${sCfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                              {sCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center text-sm text-gray-600">{docs.length}</td>
                          <td className="px-5 py-3.5 text-center text-sm text-gray-600">{runsCount}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-gray-400">
                              {new Date(pkg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isBlueprint && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/setup/docflow/packages/${pkg.id}/send`); }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                                  data-testid={`send-pkg-tbl-btn-${pkg.id}`}
                                >
                                  <Send className="h-3 w-3" /> Send
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingPkgId(pkg.id); setShowPkgDeleteModal(true); }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete package"
                                data-testid={`delete-pkg-tbl-btn-${pkg.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {filteredPackages.length > pkgPageSize && (
              <div className="flex items-center justify-between mt-5 px-1">
                <div className="text-xs text-gray-500">
                  Showing <span className="font-semibold">{(pkgPage - 1) * pkgPageSize + 1}</span>–<span className="font-semibold">{Math.min(pkgPage * pkgPageSize, filteredPackages.length)}</span> of{' '}
                  <span className="font-semibold">{filteredPackages.length}</span> packages
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPkgPage(p => Math.max(1, p - 1))}
                    disabled={pkgPage === 1}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    data-testid="pkg-prev-page"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-3 text-xs text-gray-500">
                    Page {pkgPage} of {pkgTotalPages}
                  </span>
                  <button
                    onClick={() => setPkgPage(p => Math.min(pkgTotalPages, p + 1))}
                    disabled={pkgPage === pkgTotalPages}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    data-testid="pkg-next-page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {activeTab === 'analytics' && (
          <TemplateAnalytics
            templates={templates}
            documents={documents}
            emailHistory={emailHistory}
          />
        )}

        {activeTab === 'emails' && (
          <EmailHistoryTable />
        )}

        {activeTab === 'developer' && (
          <DeveloperSettingsPage />
        )}

        {activeTab === 'email_templates' && (
          <EmailTemplatesPage />
        )}
      </div>

      {/* Close menu on outside click */}
      {showDeleteMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(null)} />
      )}

      {/* Package Delete Confirmation Modal */}
      {showPkgDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="pkg-delete-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Package</h3>
              <p className="text-sm text-gray-500 mt-1">This will permanently delete this package, all its runs, documents, and submissions. This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowPkgDeleteModal(false); setDeletingPkgId(null); }} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" data-testid="pkg-delete-cancel">Cancel</button>
              <button onClick={handleDeletePackage} disabled={pkgDeleting} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50" data-testid="pkg-delete-confirm">
                {pkgDeleting ? <Clock className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{pkgDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {showRejectReasonModal && selectedRejectDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="reject-reason-view-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Document Rejected</h3>
                <p className="text-xs text-gray-500">{selectedRejectDoc.template_name}</p>
              </div>
            </div>
            {selectedRejectDoc.rejected_by && (
              <p className="text-sm text-gray-500">Rejected by: <span className="font-medium text-gray-700">{selectedRejectDoc.rejected_by}</span></p>
            )}
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-gray-700" data-testid="reject-reason-text">{selectedRejectDoc.reject_reason}</p>
            </div>
            <button onClick={() => { setShowRejectReasonModal(false); setSelectedRejectDoc(null); }} className="w-full py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocFlowDashboard;
