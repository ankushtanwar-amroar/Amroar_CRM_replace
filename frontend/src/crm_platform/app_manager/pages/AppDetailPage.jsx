/**
 * App Manager Detail Page - Enterprise Edition
 * 
 * Detail view for a single app with tabs for:
 * - Pages (Home + App Pages)
 * - Navigation
 * 
 * Route: /setup/app-manager/:appId
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Home, FileText, Menu, Plus, Edit, Trash2,
  Loader2, AlertCircle, GripVertical, MoreHorizontal,
  Layout, Grid3X3, Sparkles, Settings, Eye, ArrowRight,
  Star, Copy, Pencil
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { toast } from 'sonner';
import { 
  getApp, listAppPages, getAppNavigation, 
  createPage, deletePage, updateAppNavigation 
} from '../services/appManagerService';

const AppDetailPage = () => {
  const { appId } = useParams();
  const navigate = useNavigate();
  
  // App data
  const [app, setApp] = useState(null);
  const [pages, setPages] = useState([]);
  const [navigation, setNavigation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('pages');
  
  // Create page dialog
  const [showCreatePageDialog, setShowCreatePageDialog] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [newPageData, setNewPageData] = useState({
    name: '',
    description: '',
    template: 'header_two_column'
  });
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
  // Rename page dialog
  const [renameDialog, setRenameDialog] = useState({ open: false, page: null, newName: '' });
  const [renaming, setRenaming] = useState(false);
  
  // Duplicate page
  const [duplicating, setDuplicating] = useState(null);
  
  // Set default page
  const [settingDefault, setSettingDefault] = useState(null);
  
  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [appData, pagesData, navData] = await Promise.all([
        getApp(appId),
        listAppPages(appId, true),
        getAppNavigation(appId)
      ]);
      
      setApp(appData);
      setPages(pagesData.pages || []);
      setNavigation(navData);
    } catch (err) {
      console.error('Error fetching app data:', err);
      setError('Failed to load app data');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (appId) {
      fetchData();
    }
  }, [appId]);
  
  // Create new page
  const handleCreatePage = async () => {
    if (!newPageData.name.trim()) {
      toast.error('Page name is required');
      return;
    }
    
    setCreatingPage(true);
    try {
      await createPage({
        app_id: appId,
        name: newPageData.name.trim(),
        description: newPageData.description.trim(),
        type: 'app_page',
        layout: {
          template: newPageData.template,
          regions: {}
        }
      });
      
      toast.success(`Page "${newPageData.name}" created`);
      setShowCreatePageDialog(false);
      setNewPageData({ name: '', description: '', template: 'header_two_column' });
      fetchData();
    } catch (err) {
      console.error('Error creating page:', err);
      toast.error('Failed to create page');
    } finally {
      setCreatingPage(false);
    }
  };
  
  // Delete page
  const handleDeletePage = async (pageId) => {
    setDeleting(true);
    try {
      await deletePage(pageId);
      toast.success('Page deleted');
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      console.error('Error deleting page:', err);
      toast.error('Failed to delete page');
    } finally {
      setDeleting(false);
    }
  };
  
  // Rename page
  const handleRenamePage = async () => {
    if (!renameDialog.newName.trim() || !renameDialog.page) return;
    
    setRenaming(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API_URL}/api/app-manager/pages/${renameDialog.page.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: renameDialog.newName.trim() })
      });
      
      toast.success('Page renamed');
      setRenameDialog({ open: false, page: null, newName: '' });
      fetchData();
    } catch (err) {
      console.error('Error renaming page:', err);
      toast.error('Failed to rename page');
    } finally {
      setRenaming(false);
    }
  };
  
  // Duplicate page
  const handleDuplicatePage = async (page) => {
    setDuplicating(page.id);
    try {
      await createPage({
        app_id: appId,
        name: `${page.name} (Copy)`,
        description: page.description || '',
        type: 'app_page',
        layout: page.layout || { template: 'header_two_column', regions: {} }
      });
      
      toast.success('Page duplicated');
      fetchData();
    } catch (err) {
      console.error('Error duplicating page:', err);
      toast.error('Failed to duplicate page');
    } finally {
      setDuplicating(null);
    }
  };
  
  // Set page as default
  const handleSetDefault = async (page) => {
    setSettingDefault(page.id);
    try {
      const token = localStorage.getItem('token');
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API_URL}/api/app-manager/pages/${page.id}/set-default`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      toast.success(`"${page.name}" is now the default page`);
      fetchData();
    } catch (err) {
      console.error('Error setting default page:', err);
      toast.error('Failed to set default page');
    } finally {
      setSettingDefault(null);
    }
  };
  
  // Edit page in Page Builder
  const handleEditPage = (pageId) => {
    navigate(`/setup/page-builder/${pageId}`);
  };
  
  // Reorder navigation items
  const handleNavReorder = async (fromIndex, toIndex) => {
    if (!navigation?.items) return;
    
    const newItems = [...navigation.items];
    const [removed] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, removed);
    
    // Update order values
    newItems.forEach((item, index) => {
      item.order = index;
    });
    
    try {
      await updateAppNavigation(appId, { items: newItems });
      setNavigation({ ...navigation, items: newItems });
      toast.success('Navigation order updated');
    } catch (err) {
      console.error('Error updating navigation:', err);
      toast.error('Failed to update navigation');
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="animate-pulse flex items-center gap-4">
              <div className="h-8 w-24 bg-slate-200 rounded" />
              <div className="h-8 w-px bg-slate-200" />
              <div className="h-8 w-48 bg-slate-200 rounded" />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-slate-600 font-medium">Loading app configuration...</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !app) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Error</h2>
            <p className="text-slate-500 mb-6">{error || 'App not found'}</p>
            <Button onClick={() => navigate('/setup/app-manager')}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Apps
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // Separate home page from app pages
  const homePage = pages.find(p => p.type === 'home_page');
  const appPages = pages.filter(p => p.type === 'app_page');
  
  return (
    <div className="min-h-screen bg-slate-50" data-testid="app-detail-page">
      {/* Enterprise Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/setup/app-manager')}
                className="text-slate-600 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Apps
              </Button>
              <div className="h-8 w-px bg-slate-200" />
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Grid3X3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-slate-900">{app.name}</h1>
                  {!app.is_active && (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">{app.description || 'App configuration'}</p>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/crm-platform', '_blank')}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Preview App
            </Button>
          </div>
        </div>
      </div>
      
      {/* Tabs Section */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-white border shadow-sm h-11">
              <TabsTrigger value="pages" className="gap-2 px-5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <Layout className="h-4 w-4" />
                Pages
              </TabsTrigger>
              <TabsTrigger value="navigation" className="gap-2 px-5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <Menu className="h-4 w-4" />
                Navigation
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'pages' && (
              <Button 
                onClick={() => setShowCreatePageDialog(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
                data-testid="create-page-btn"
              >
                <Plus className="h-4 w-4" />
                New Page
              </Button>
            )}
          </div>
          
          {/* Pages Tab */}
          <TabsContent value="pages" className="space-y-6 mt-0">
            {/* Home Page Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Home className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Home Page
                </h3>
              </div>
              
              {homePage ? (
                <Card className="bg-white shadow-sm border-slate-200 hover:border-blue-200 transition-colors" data-testid="home-page-card">
                  <CardContent className="p-0">
                    <div className="flex items-center">
                      <div className="w-1.5 h-full min-h-[88px] rounded-l-lg bg-gradient-to-b from-blue-500 to-indigo-500" />
                      <div className="flex-1 flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-md">
                            <Home className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{homePage.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-sm text-slate-500">
                                {homePage.layout?.template?.replace(/_/g, ' ') || 'Default layout'}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-sm text-slate-500">
                                {Object.values(homePage.layout?.regions || {}).flat().length} components
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="bg-blue-100 text-blue-700 border-0 font-medium">
                            Home
                          </Badge>
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleEditPage(homePage.id)}
                            className="gap-2 bg-blue-600 hover:bg-blue-700"
                            data-testid="edit-home-page-btn"
                          >
                            <Edit className="h-4 w-4" />
                            Edit Layout
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-slate-50/50 border-dashed border-2 border-slate-200">
                  <CardContent className="p-8 text-center">
                    <Home className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No home page configured</p>
                  </CardContent>
                </Card>
              )}
            </div>
            
            {/* App Pages Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-slate-100 rounded-lg">
                  <FileText className="h-4 w-4 text-slate-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  App Pages ({appPages.length})
                </h3>
              </div>
              
              {appPages.length === 0 ? (
                <Card className="bg-slate-50/50 border-dashed border-2 border-slate-200">
                  <CardContent className="p-10 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-slate-400" />
                    </div>
                    <h4 className="font-semibold text-slate-900 mb-2">No App Pages Yet</h4>
                    <p className="text-slate-500 mb-5 max-w-sm mx-auto">
                      Create custom pages to add specialized functionality to your app.
                    </p>
                    <Button 
                      variant="outline"
                      onClick={() => setShowCreatePageDialog(true)}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Create First Page
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {appPages.map((page) => (
                    <Card 
                      key={page.id} 
                      className={`group bg-white shadow-sm border-slate-200 hover:border-slate-300 hover:shadow transition-all ${page.is_default ? 'ring-2 ring-indigo-200 border-indigo-300' : ''}`}
                      data-testid={`app-page-card-${page.id}`}
                    >
                      <CardContent className="p-0">
                        <div className="flex items-center">
                          <div className={`w-1 h-full min-h-[80px] rounded-l-lg transition-colors ${page.is_default ? 'bg-indigo-500' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                          <div className="flex-1 flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-4">
                              <div className={`p-2.5 rounded-xl transition-colors ${page.is_default ? 'bg-indigo-100' : 'bg-slate-100 group-hover:bg-slate-200'}`}>
                                <Layout className={`h-5 w-5 ${page.is_default ? 'text-indigo-600' : 'text-slate-600'}`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className={`font-medium transition-colors ${page.is_default ? 'text-indigo-700' : 'text-slate-900 group-hover:text-blue-600'}`}>
                                    {page.name}
                                  </p>
                                  {page.is_default && (
                                    <Badge className="bg-indigo-100 text-indigo-700 text-[10px] font-medium px-1.5 py-0">
                                      <Star className="h-2.5 w-2.5 mr-0.5 fill-indigo-500" />
                                      Default
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-slate-500 mt-0.5">
                                  {page.layout?.template?.replace(/_/g, ' ') || 'Blank'} template
                                  {page.description && <span className="mx-1">•</span>}
                                  {page.description && <span className="text-slate-400">{page.description}</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditPage(page.id)}
                                className="gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Edit className="h-4 w-4" />
                                Edit Layout
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem onClick={() => handleEditPage(page.id)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Layout
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => setRenameDialog({ open: true, page, newName: page.name })}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleDuplicatePage(page)}
                                    disabled={duplicating === page.id}
                                  >
                                    {duplicating === page.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Copy className="h-4 w-4 mr-2" />
                                    )}
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {!page.is_default && (
                                    <DropdownMenuItem 
                                      onClick={() => handleSetDefault(page)}
                                      disabled={settingDefault === page.id}
                                    >
                                      {settingDefault === page.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Star className="h-4 w-4 mr-2" />
                                      )}
                                      Set as Default
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onClick={() => setDeleteConfirm(page)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          
          {/* Navigation Tab */}
          <TabsContent value="navigation" className="space-y-6 mt-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <Menu className="h-4 w-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Navigation Items
                </h3>
              </div>
              <p className="text-sm text-slate-500">
                Drag items to reorder
              </p>
            </div>
            
            {!navigation?.items?.length ? (
              <Card className="bg-slate-50/50 border-dashed border-2 border-slate-200">
                <CardContent className="p-10 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Menu className="h-8 w-8 text-slate-400" />
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-2">No Navigation Items</h4>
                  <p className="text-slate-500">
                    Navigation items will appear here when configured
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {navigation.items
                  .sort((a, b) => a.order - b.order)
                  .map((item, index) => (
                    <Card 
                      key={item.id}
                      className="bg-white shadow-sm border-slate-200 cursor-grab active:cursor-grabbing hover:border-slate-300 transition-all"
                      data-testid={`nav-item-${item.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <GripVertical className="h-4 w-4 text-slate-300 flex-shrink-0" />
                          <div className={`p-2.5 rounded-xl ${
                            item.type === 'home' 
                              ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                              : 'bg-slate-100'
                          }`}>
                            {item.type === 'home' ? (
                              <Home className="h-4 w-4 text-white" />
                            ) : item.type === 'object' ? (
                              <FileText className="h-4 w-4 text-slate-600" />
                            ) : (
                              <Layout className="h-4 w-4 text-slate-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500 capitalize">
                              {item.type === 'object' ? `Object: ${item.reference_id}` : item.type}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs font-medium bg-slate-50">
                            #{index + 1}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
            
            {/* Navigation Info */}
            <div className="p-5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-purple-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Navigation Tips</h4>
                  <p className="text-sm text-slate-600">
                    Navigation items are automatically created when you add pages to your app. 
                    Use drag and drop to reorder items as they appear in the app's sidebar.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Create Page Dialog */}
      <Dialog open={showCreatePageDialog} onOpenChange={setShowCreatePageDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Create New Page</DialogTitle>
            <DialogDescription>
              Create a new app page for {app.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="page-name" className="text-sm font-medium">
                Page Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="page-name"
                placeholder="e.g., Lead Dashboard, Reports"
                value={newPageData.name}
                onChange={(e) => setNewPageData({ ...newPageData, name: e.target.value })}
                className="h-11"
                data-testid="page-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="page-description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="page-description"
                placeholder="Brief description of this page's purpose..."
                value={newPageData.description}
                onChange={(e) => setNewPageData({ ...newPageData, description: e.target.value })}
                rows={2}
                className="resize-none"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Layout Template</Label>
              <Select 
                value={newPageData.template} 
                onValueChange={(v) => setNewPageData({ ...newPageData, template: v })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank (Single Column)</SelectItem>
                  <SelectItem value="header_two_column">Header + Two Columns</SelectItem>
                  <SelectItem value="header_sidebar">Header + Sidebar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowCreatePageDialog(false)}
              disabled={creatingPage}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePage}
              disabled={creatingPage || !newPageData.name.trim()}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="create-page-submit"
            >
              {creatingPage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Page
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-600">Delete Page</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => handleDeletePage(deleteConfirm.id)}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Page
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Rename Page Dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({ open: false, page: null, newName: '' })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Rename Page</DialogTitle>
            <DialogDescription>
              Enter a new name for "{renameDialog.page?.name}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-sm font-medium">Page Name</Label>
            <Input
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
              placeholder="Enter page name"
              className="mt-2 h-11"
              autoFocus
            />
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setRenameDialog({ open: false, page: null, newName: '' })}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRenamePage}
              disabled={renaming || !renameDialog.newName.trim() || renameDialog.newName === renameDialog.page?.name}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {renaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppDetailPage;
