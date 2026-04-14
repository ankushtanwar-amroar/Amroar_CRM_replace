/**
 * Integration Categories & Providers Management Page
 * Admin Portal - Platform Configuration
 */
import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { 
  Plug, 
  Plus, 
  Edit2, 
  Trash2, 
  Loader2,
  Mail,
  Brain,
  MessageCircle,
  Calendar,
  RefreshCw,
  Globe,
  ChevronRight,
  Sparkles,
  Server,
  Phone,
  Send,
  Cloud,
  Bot,
  Wand2,
  Database
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for categories
const CATEGORY_ICONS = {
  mail: Mail,
  brain: Brain,
  'message-circle': MessageCircle,
  calendar: Calendar,
  'refresh-cw': RefreshCw,
  globe: Globe,
  plug: Plug,
  database: Database
};

// Icon mapping for providers
const PROVIDER_ICONS = {
  send: Send,
  mail: Mail,
  cloud: Cloud,
  server: Server,
  sparkles: Sparkles,
  'wand-2': Wand2,
  bot: Bot,
  phone: Phone,
  globe: Globe,
  plug: Plug
};

const IntegrationsPage = () => {
  const { adminToken } = useAdminAuth();
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingProvider, setEditingProvider] = useState(null);

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, provRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/integrations/categories?include_inactive=true`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        }),
        fetch(`${API_URL}/api/admin/integrations/providers?include_inactive=true`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        })
      ]);

      if (catRes.ok) setCategories(await catRes.json());
      if (provRes.ok) setProviders(await provRes.json());
    } catch (error) {
      toast.error('Failed to load integration data');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/integrations/seed`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        toast.success('Seed data created successfully');
        fetchData();
      } else {
        toast.error('Failed to seed data');
      }
    } catch (error) {
      toast.error('Failed to seed data');
    }
  };

  const getCategoryIcon = (iconName) => {
    const Icon = CATEGORY_ICONS[iconName] || Plug;
    return <Icon className="h-5 w-5" />;
  };

  const getProviderIcon = (iconName) => {
    const Icon = PROVIDER_ICONS[iconName] || Plug;
    return <Icon className="h-5 w-5" />;
  };

  const getProvidersForCategory = (categoryId) => {
    return providers.filter(p => p.category_id === categoryId);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integration Providers</h1>
          <p className="text-slate-500">
            Manage integration categories and providers for tenant connections
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {categories.length === 0 && (
            <Button variant="outline" onClick={handleSeedData}>
              <Database className="h-4 w-4 mr-2" />
              Seed Default Data
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Categories</p>
                <p className="text-2xl font-bold">{categories.filter(c => c.is_active).length}</p>
              </div>
              <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Plug className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Providers</p>
                <p className="text-2xl font-bold">{providers.filter(p => p.is_active).length}</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Globe className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Auth Schemas</p>
                <p className="text-2xl font-bold">
                  {providers.reduce((acc, p) => acc + (p.auth_schema?.length || 0), 0)}
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Brain className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Integration Categories</CardTitle>
                <CardDescription>
                  Categories group similar integration providers together
                </CardDescription>
              </div>
              <Button onClick={() => { setEditingCategory(null); setCategoryDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Providers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center">
                            {getCategoryIcon(category.icon)}
                          </div>
                          <div>
                            <p className="font-medium">{category.name}</p>
                            <p className="text-sm text-slate-500">{category.description}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-slate-100 px-2 py-1 rounded">
                          {category.slug}
                        </code>
                      </TableCell>
                      <TableCell>
                        {getProvidersForCategory(category.id).length} providers
                      </TableCell>
                      <TableCell>
                        <Badge variant={category.is_active ? "default" : "secondary"}>
                          {category.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{category.sort_order}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCategory(category);
                              setCategoryDialogOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        No categories found. Click "Seed Default Data" to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Providers Tab */}
        <TabsContent value="providers" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Integration Providers</CardTitle>
                <CardDescription>
                  Providers define how tenants connect to external services
                </CardDescription>
              </div>
              <Button onClick={() => { setEditingProvider(null); setProviderDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Select
                  value={selectedCategory || "all"}
                  onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Auth Fields</TableHead>
                    <TableHead>Test Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers
                    .filter(p => !selectedCategory || p.category_id === selectedCategory)
                    .map((provider) => (
                      <TableRow key={provider.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center">
                              {getProviderIcon(provider.logo_icon)}
                            </div>
                            <div>
                              <p className="font-medium">{provider.name}</p>
                              <p className="text-sm text-slate-500">{provider.description}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{provider.category_name}</Badge>
                        </TableCell>
                        <TableCell>
                          {provider.auth_schema?.length || 0} fields
                        </TableCell>
                        <TableCell>
                          {provider.test_endpoint ? (
                            <Badge variant="default" className="bg-green-500">
                              Configured
                            </Badge>
                          ) : (
                            <Badge variant="secondary">None</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={provider.is_active ? "default" : "secondary"}>
                            {provider.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingProvider(provider);
                                setProviderDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  {providers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        No providers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        adminToken={adminToken}
        onSaved={fetchData}
      />

      {/* Provider Dialog */}
      <ProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        provider={editingProvider}
        categories={categories}
        adminToken={adminToken}
        onSaved={fetchData}
      />
    </div>
  );
};

// Category Edit Dialog
const CategoryDialog = ({ open, onOpenChange, category, adminToken, onSaved }) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon: 'plug',
    description: '',
    sort_order: 0,
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        slug: category.slug || '',
        icon: category.icon || 'plug',
        description: category.description || '',
        sort_order: category.sort_order || 0,
        is_active: category.is_active !== false
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        icon: 'plug',
        description: '',
        sort_order: 0,
        is_active: true
      });
    }
  }, [category, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = category
        ? `${API_URL}/api/admin/integrations/categories/${category.id}`
        : `${API_URL}/api/admin/integrations/categories`;

      const res = await fetch(url, {
        method: category ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success(category ? 'Category updated' : 'Category created');
        onOpenChange(false);
        onSaved();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to save category');
      }
    } catch (error) {
      toast.error('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>
            {category ? 'Update category details' : 'Create a new integration category'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Select
              value={formData.icon}
              onValueChange={(v) => setFormData({ ...formData, icon: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mail">Mail</SelectItem>
                <SelectItem value="brain">Brain</SelectItem>
                <SelectItem value="message-circle">Message</SelectItem>
                <SelectItem value="calendar">Calendar</SelectItem>
                <SelectItem value="refresh-cw">Sync</SelectItem>
                <SelectItem value="globe">Globe</SelectItem>
                <SelectItem value="plug">Plug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Category description..."
            />
          </div>
          <div className="space-y-2">
            <Label>Sort Order</Label>
            <Input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {category ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Provider Edit Dialog
const ProviderDialog = ({ open, onOpenChange, provider, categories, adminToken, onSaved }) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category_id: '',
    logo_icon: 'plug',
    description: '',
    docs_url: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setFormData({
        name: provider.name || '',
        slug: provider.slug || '',
        category_id: provider.category_id || '',
        logo_icon: provider.logo_icon || 'plug',
        description: provider.description || '',
        docs_url: provider.docs_url || '',
        is_active: provider.is_active !== false
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        category_id: categories[0]?.id || '',
        logo_icon: 'plug',
        description: '',
        docs_url: '',
        is_active: true
      });
    }
  }, [provider, categories, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = provider
        ? `${API_URL}/api/admin/integrations/providers/${provider.id}`
        : `${API_URL}/api/admin/integrations/providers`;

      // For new providers, we need to include auth_schema
      const payload = { ...formData };
      if (!provider) {
        payload.auth_schema = [];
      }

      const res = await fetch(url, {
        method: provider ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(provider ? 'Provider updated' : 'Provider created');
        onOpenChange(false);
        onSaved();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to save provider');
      }
    } catch (error) {
      toast.error('Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{provider ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
          <DialogDescription>
            {provider ? 'Update provider details' : 'Create a new integration provider'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="SendGrid"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="sendgrid"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category_id}
              onValueChange={(v) => setFormData({ ...formData, category_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Select
              value={formData.logo_icon}
              onValueChange={(v) => setFormData({ ...formData, logo_icon: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send">Send</SelectItem>
                <SelectItem value="mail">Mail</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="sparkles">Sparkles</SelectItem>
                <SelectItem value="wand-2">Wand</SelectItem>
                <SelectItem value="bot">Bot</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="globe">Globe</SelectItem>
                <SelectItem value="plug">Plug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provider description..."
            />
          </div>
          <div className="space-y-2">
            <Label>Documentation URL</Label>
            <Input
              value={formData.docs_url}
              onChange={(e) => setFormData({ ...formData, docs_url: e.target.value })}
              placeholder="https://docs.example.com"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {provider ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default IntegrationsPage;
