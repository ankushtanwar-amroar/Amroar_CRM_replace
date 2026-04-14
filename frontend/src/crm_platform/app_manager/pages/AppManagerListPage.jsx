/**
 * App Manager List Page - Enterprise Edition
 * 
 * Central administrative control panel for apps.
 * Features polished Salesforce-inspired design with modern aesthetics.
 * 
 * Route: /setup/app-manager
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Settings, MoreHorizontal, Power, PowerOff,
  Home, FileText, ChevronRight, Loader2, AlertCircle,
  TrendingUp, Briefcase, Users, Layers, Search, ArrowLeft,
  Sparkles, Grid3X3
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';
import { listApps, createApp, updateApp } from '../services/appManagerService';

// App icon mapping with colors
const appIconConfig = {
  'sales': { icon: TrendingUp, color: 'bg-gradient-to-br from-blue-500 to-blue-600', text: 'text-white' },
  'sales_console': { icon: TrendingUp, color: 'bg-gradient-to-br from-blue-500 to-blue-600', text: 'text-white' },
  'service': { icon: Briefcase, color: 'bg-gradient-to-br from-purple-500 to-purple-600', text: 'text-white' },
  'marketing': { icon: Users, color: 'bg-gradient-to-br from-green-500 to-green-600', text: 'text-white' },
  'default': { icon: Layers, color: 'bg-gradient-to-br from-slate-500 to-slate-600', text: 'text-white' }
};

const AppManagerListPage = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create app dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAppData, setNewAppData] = useState({
    name: '',
    description: '',
    icon: 'layers'
  });
  
  // Fetch apps
  const fetchApps = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApps(true);
      setApps(data.apps || []);
    } catch (err) {
      console.error('Error fetching apps:', err);
      setError('Failed to load apps');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchApps();
  }, []);
  
  // Create new app
  const handleCreateApp = async () => {
    if (!newAppData.name.trim()) {
      toast.error('App name is required');
      return;
    }
    
    setCreating(true);
    try {
      const result = await createApp({
        name: newAppData.name.trim(),
        description: newAppData.description.trim(),
        icon: newAppData.icon
      });
      
      toast.success(`App "${result.name}" created successfully`);
      setShowCreateDialog(false);
      setNewAppData({ name: '', description: '', icon: 'layers' });
      fetchApps();
    } catch (err) {
      console.error('Error creating app:', err);
      toast.error('Failed to create app');
    } finally {
      setCreating(false);
    }
  };
  
  // Toggle app active status
  const handleToggleActive = async (app) => {
    try {
      await updateApp(app.id, { is_active: !app.is_active });
      toast.success(`App ${app.is_active ? 'deactivated' : 'activated'}`);
      fetchApps();
    } catch (err) {
      console.error('Error toggling app status:', err);
      toast.error('Failed to update app status');
    }
  };
  
  // Navigate to app detail
  const handleAppClick = (appId) => {
    navigate(`/setup/app-manager/${appId}`);
  };
  
  const getAppConfig = (app) => {
    return appIconConfig[app.api_name] || appIconConfig[app.icon] || appIconConfig.default;
  };

  // Filter apps based on search
  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (app.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <div className="animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-200 rounded-xl" />
                <div>
                  <div className="h-6 w-40 bg-slate-200 rounded mb-2" />
                  <div className="h-4 w-60 bg-slate-200 rounded" />
                </div>
              </div>
              <div className="h-10 w-28 bg-slate-200 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-slate-600 font-medium">Loading applications...</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Apps</h2>
            <p className="text-slate-500 mb-6">{error}</p>
            <Button onClick={fetchApps} className="gap-2">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-50" data-testid="app-manager-list">
      {/* Enterprise Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="mr-2 text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Setup
              </Button>
              <div className="h-8 w-px bg-slate-200" />
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Grid3X3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">App Manager</h1>
                <p className="text-sm text-slate-500">
                  Create and configure your CRM applications
                </p>
              </div>
            </div>
            {/* <Button 
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
              data-testid="create-app-btn"
            >
              <Plus className="h-4 w-4" />
              New App
            </Button> */}
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Bar & Search */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
              <Layers className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-slate-700">
                {apps.length} {apps.length === 1 ? 'Application' : 'Applications'}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-slate-700">
                {apps.filter(a => a.is_active).length} Active
              </span>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-200 shadow-sm"
            />
          </div>
        </div>
        
        {filteredApps.length === 0 && searchQuery ? (
          <Card className="text-center py-12 bg-white shadow-sm">
            <CardContent>
              <Search className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Results</h3>
              <p className="text-slate-500 mb-4">
                No applications match "{searchQuery}"
              </p>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </CardContent>
          </Card>
        ) : filteredApps.length === 0 ? (
          <Card className="text-center py-16 bg-white shadow-sm border-dashed border-2">
            <CardContent>
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-10 w-10 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Create Your First App</h3>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">
                Apps help you organize and customize the CRM experience for different teams and use cases.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create App
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredApps.map((app) => {
              const config = getAppConfig(app);
              const IconComponent = config.icon;
              
              return (
                <Card 
                  key={app.id}
                  className={`group cursor-pointer transition-all duration-200 bg-white shadow-sm hover:shadow-md border-slate-200 hover:border-blue-200 ${
                    !app.is_active ? 'opacity-70' : ''
                  }`}
                  onClick={() => handleAppClick(app.id)}
                  data-testid={`app-card-${app.id}`}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center">
                      {/* Left Accent */}
                      <div className={`w-1.5 h-full min-h-[96px] rounded-l-lg ${app.is_active ? 'bg-gradient-to-b from-blue-500 to-indigo-500' : 'bg-slate-300'}`} />
                      
                      {/* Content */}
                      <div className="flex-1 flex items-center justify-between px-6 py-5">
                        <div className="flex items-center gap-5">
                          {/* Icon */}
                          <div className={`p-3.5 rounded-xl ${config.color} shadow-lg`}>
                            <IconComponent className={`h-6 w-6 ${config.text}`} />
                          </div>
                          
                          {/* Info */}
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                {app.name}
                              </h3>
                              {!app.is_active && (
                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-medium">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 max-w-lg">
                              {app.description || 'No description provided'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          {/* Stats */}
                          <div className="hidden md:flex items-center gap-6">
                            <div className="flex items-center gap-2 text-slate-500">
                              <div className="p-1.5 bg-blue-50 rounded-lg">
                                <Home className="h-4 w-4 text-blue-500" />
                              </div>
                              <span className="text-sm font-medium">1 Home</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                              <div className="p-1.5 bg-slate-100 rounded-lg">
                                <FileText className="h-4 w-4 text-slate-500" />
                              </div>
                              <span className="text-sm font-medium">{app.pages_count || 0} Pages</span>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAppClick(app.id);
                                }}
                              >
                                <Settings className="h-4 w-4 mr-2" />
                                Manage App
                              </DropdownMenuItem>
                              {/* <DropdownMenuSeparator /> */}
                              {/* <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleActive(app);
                                }}
                              >
                                {app.is_active ? (
                                  <>
                                    <PowerOff className="h-4 w-4 mr-2" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-4 w-4 mr-2" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem> */}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {/* Info Card */}
        <div className="mt-8 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">What are Apps?</h4>
              <p className="text-sm text-slate-600">
                Apps are customizable workspaces that group related functionality. Each app has its own home page 
                that you can configure with widgets and components relevant to that team or workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Create App Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Create New Application</DialogTitle>
            <DialogDescription>
              Create a new application with its own home page and navigation.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="app-name" className="text-sm font-medium">
                Application Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="app-name"
                placeholder="e.g., Sales, Service, Marketing"
                value={newAppData.name}
                onChange={(e) => setNewAppData({ ...newAppData, name: e.target.value })}
                className="h-11"
                data-testid="app-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="app-description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="app-description"
                placeholder="Brief description of this application's purpose..."
                value={newAppData.description}
                onChange={(e) => setNewAppData({ ...newAppData, description: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateApp}
              disabled={creating || !newAppData.name.trim()}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="create-app-submit"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create App
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppManagerListPage;
