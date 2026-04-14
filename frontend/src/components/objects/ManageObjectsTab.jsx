/**
 * ManageObjectsTab - Custom Objects Management Component
 * Extracted from App.js for better maintainability
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

// Icons - Expanded library for intelligent suggestions
import {
  Plus,
  Trash2,
  Building2,
  Users,
  FileText,
  DollarSign,
  Calendar as CalendarIcon,
  Briefcase,
  Package,
  ShoppingCart,
  TrendingUp,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  Star,
  Heart,
  // Additional icons for smart suggestions
  Receipt,
  CreditCard,
  Wallet,
  FolderKanban,
  ClipboardList,
  ListTodo,
  CheckSquare,
  Target,
  UserPlus,
  UserCheck,
  Building,
  Home,
  MapPin,
  Megaphone,
  Rocket,
  Zap,
  Award,
  Gift,
  Truck,
  Box,
  Archive,
  FileSpreadsheet,
  FileCheck,
  FileClock,
  Newspaper,
  BookOpen,
  GraduationCap,
  Lightbulb,
  Settings,
  Wrench,
  Shield,
  Lock,
  Key,
  Tag,
  Tags,
  Bookmark,
  Flag,
  Bell,
  Clock,
  Timer,
  Activity,
  BarChart3,
  PieChart,
  LineChart,
  Layers,
  Grid3X3,
  Layout,
  Sparkles,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icon component mapping
const ICON_COMPONENTS = {
  FileText, Users, Building2, Briefcase, Package, ShoppingCart, Calendar: CalendarIcon,
  DollarSign, TrendingUp, MessageSquare, Mail, Phone, Globe, Star, Heart,
  Receipt, CreditCard, Wallet, FolderKanban, ClipboardList, ListTodo, CheckSquare,
  Target, UserPlus, UserCheck, Building, Home, MapPin, Megaphone, Rocket, Zap,
  Award, Gift, Truck, Box, Archive, FileSpreadsheet, FileCheck, FileClock,
  Newspaper, BookOpen, GraduationCap, Lightbulb, Settings, Wrench, Shield, Lock,
  Key, Tag, Tags, Bookmark, Flag, Bell, Clock, Timer, Activity, BarChart3,
  PieChart, LineChart, Layers, Grid3X3, Layout, Sparkles,
};

// Keyword-to-icon mapping for intelligent suggestions
const ICON_KEYWORDS = {
  // Financial / Money
  invoice: ['Receipt', 'FileText', 'DollarSign', 'CreditCard', 'Wallet'],
  payment: ['CreditCard', 'DollarSign', 'Wallet', 'Receipt', 'FileCheck'],
  bill: ['Receipt', 'FileText', 'DollarSign', 'CreditCard'],
  expense: ['Receipt', 'DollarSign', 'Wallet', 'CreditCard', 'TrendingUp'],
  revenue: ['DollarSign', 'TrendingUp', 'BarChart3', 'LineChart'],
  budget: ['DollarSign', 'PieChart', 'Wallet', 'BarChart3'],
  finance: ['DollarSign', 'TrendingUp', 'BarChart3', 'CreditCard', 'Wallet'],
  
  // Project / Task Management
  project: ['FolderKanban', 'Briefcase', 'ClipboardList', 'Layers', 'Layout'],
  task: ['CheckSquare', 'ListTodo', 'ClipboardList', 'Target', 'Flag'],
  todo: ['ListTodo', 'CheckSquare', 'ClipboardList', 'Target'],
  milestone: ['Flag', 'Target', 'Award', 'Rocket', 'Star'],
  sprint: ['Rocket', 'Zap', 'Timer', 'Target', 'Flag'],
  
  // People / CRM
  lead: ['UserPlus', 'Target', 'Users', 'Megaphone', 'Star'],
  contact: ['Users', 'UserCheck', 'Phone', 'Mail', 'MessageSquare'],
  customer: ['Users', 'UserCheck', 'Heart', 'Star', 'Building'],
  client: ['Building', 'Users', 'Briefcase', 'UserCheck', 'Star'],
  account: ['Building2', 'Building', 'Briefcase', 'Users', 'Globe'],
  vendor: ['Building', 'Truck', 'Package', 'Box', 'Users'],
  supplier: ['Truck', 'Package', 'Building', 'Box', 'Archive'],
  employee: ['Users', 'UserCheck', 'Briefcase', 'Building2', 'Award'],
  candidate: ['UserPlus', 'Users', 'GraduationCap', 'Briefcase', 'Star'],
  
  // Marketing / Sales
  campaign: ['Megaphone', 'Rocket', 'Target', 'Zap', 'TrendingUp'],
  opportunity: ['Star', 'Target', 'TrendingUp', 'DollarSign', 'Rocket'],
  deal: ['DollarSign', 'Star', 'Target', 'TrendingUp', 'Award'],
  promotion: ['Megaphone', 'Gift', 'Tag', 'Star', 'Sparkles'],
  
  // Products / Inventory
  product: ['Package', 'Box', 'ShoppingCart', 'Tag', 'Archive'],
  item: ['Package', 'Box', 'Tag', 'Archive', 'Layers'],
  inventory: ['Archive', 'Box', 'Package', 'Layers', 'Grid3X3'],
  stock: ['Archive', 'Box', 'Package', 'BarChart3', 'Layers'],
  order: ['ShoppingCart', 'Package', 'Truck', 'Receipt', 'ClipboardList'],
  shipment: ['Truck', 'Package', 'Box', 'MapPin', 'Clock'],
  
  // Documents / Content
  document: ['FileText', 'FileCheck', 'FileSpreadsheet', 'Archive', 'Layers'],
  report: ['FileSpreadsheet', 'BarChart3', 'PieChart', 'FileText', 'ClipboardList'],
  contract: ['FileCheck', 'FileText', 'Shield', 'Lock', 'Bookmark'],
  proposal: ['FileText', 'Lightbulb', 'Briefcase', 'Star', 'Target'],
  article: ['Newspaper', 'BookOpen', 'FileText', 'Bookmark', 'Globe'],
  template: ['Layout', 'Grid3X3', 'FileText', 'Layers', 'Settings'],
  
  // Events / Scheduling
  event: ['CalendarIcon', 'Clock', 'Bell', 'Star', 'Flag'],
  meeting: ['CalendarIcon', 'Users', 'Clock', 'MessageSquare', 'Bell'],
  appointment: ['CalendarIcon', 'Clock', 'Bell', 'UserCheck', 'Timer'],
  schedule: ['CalendarIcon', 'Clock', 'Timer', 'ClipboardList', 'Bell'],
  reminder: ['Bell', 'Clock', 'Timer', 'Flag', 'CalendarIcon'],
  
  // Support / Service
  ticket: ['Tag', 'MessageSquare', 'Flag', 'ClipboardList', 'Bell'],
  case: ['Briefcase', 'ClipboardList', 'Shield', 'FileText', 'Flag'],
  issue: ['Flag', 'MessageSquare', 'Wrench', 'ClipboardList', 'Bell'],
  request: ['MessageSquare', 'Bell', 'Flag', 'ClipboardList', 'Mail'],
  feedback: ['MessageSquare', 'Star', 'Heart', 'Bell', 'Mail'],
  
  // Knowledge / Learning
  course: ['GraduationCap', 'BookOpen', 'Lightbulb', 'Star', 'Award'],
  training: ['GraduationCap', 'BookOpen', 'Users', 'Award', 'Target'],
  lesson: ['BookOpen', 'Lightbulb', 'GraduationCap', 'Star', 'CheckSquare'],
  knowledge: ['Lightbulb', 'BookOpen', 'Globe', 'Star', 'Sparkles'],
  
  // Location / Property
  location: ['MapPin', 'Building', 'Globe', 'Home', 'Flag'],
  property: ['Building', 'Home', 'Key', 'MapPin', 'Star'],
  asset: ['Archive', 'Box', 'Tag', 'Key', 'Shield'],
  facility: ['Building', 'Settings', 'Wrench', 'MapPin', 'Shield'],
  
  // Security / Compliance
  policy: ['Shield', 'FileCheck', 'Lock', 'FileText', 'Bookmark'],
  compliance: ['Shield', 'CheckSquare', 'FileCheck', 'Lock', 'Award'],
  audit: ['FileCheck', 'Shield', 'ClipboardList', 'CheckSquare', 'Activity'],
  
  // Goals / Performance
  goal: ['Target', 'Flag', 'Award', 'Star', 'TrendingUp'],
  kpi: ['BarChart3', 'Target', 'TrendingUp', 'Activity', 'Award'],
  metric: ['BarChart3', 'LineChart', 'Activity', 'Target', 'TrendingUp'],
  
  // Communication
  message: ['MessageSquare', 'Mail', 'Bell', 'Phone', 'Globe'],
  email: ['Mail', 'MessageSquare', 'Bell', 'Globe', 'Users'],
  notification: ['Bell', 'MessageSquare', 'Mail', 'Flag', 'Zap'],
  
  // General
  record: ['FileText', 'Archive', 'Layers', 'ClipboardList', 'Grid3X3'],
  entry: ['FileText', 'ClipboardList', 'Archive', 'Layers', 'Plus'],
  log: ['ClipboardList', 'FileClock', 'Activity', 'FileText', 'Archive'],
  note: ['FileText', 'Bookmark', 'MessageSquare', 'ClipboardList', 'Star'],
};

// Default icons when no match found
const DEFAULT_SUGGESTED_ICONS = ['FileText', 'Star', 'Layers', 'Archive', 'Tag'];

// All available icons for the grid
const ALL_ICONS = [
  'FileText', 'Users', 'Building2', 'Briefcase', 'Package', 'ShoppingCart',
  'Calendar', 'DollarSign', 'TrendingUp', 'MessageSquare', 'Mail', 'Phone',
  'Globe', 'Star', 'Heart', 'Receipt', 'CreditCard', 'Wallet', 'FolderKanban',
  'ClipboardList', 'ListTodo', 'CheckSquare', 'Target', 'UserPlus', 'UserCheck',
  'Building', 'Home', 'MapPin', 'Megaphone', 'Rocket', 'Zap', 'Award', 'Gift',
  'Truck', 'Box', 'Archive', 'FileSpreadsheet', 'FileCheck', 'FileClock',
  'Newspaper', 'BookOpen', 'GraduationCap', 'Lightbulb', 'Settings', 'Wrench',
  'Shield', 'Lock', 'Key', 'Tag', 'Tags', 'Bookmark', 'Flag', 'Bell', 'Clock',
  'Timer', 'Activity', 'BarChart3', 'PieChart', 'LineChart', 'Layers',
  'Grid3X3', 'Layout', 'Sparkles',
];

/**
 * Get suggested icons based on object label using keyword matching
 */
const getSuggestedIcons = (label) => {
  if (!label || label.trim().length < 2) {
    return { icons: DEFAULT_SUGGESTED_ICONS, bestMatch: 'FileText' };
  }
  
  const normalizedLabel = label.toLowerCase().trim();
  const words = normalizedLabel.split(/[\s_-]+/);
  
  // Score icons based on keyword matches
  const iconScores = {};
  
  // Check each word against keywords
  words.forEach(word => {
    if (word.length < 2) return;
    
    // Exact match
    if (ICON_KEYWORDS[word]) {
      ICON_KEYWORDS[word].forEach((icon, index) => {
        // Higher score for earlier icons in the array (more relevant)
        const score = (5 - index) * 3;
        iconScores[icon] = (iconScores[icon] || 0) + score;
      });
    }
    
    // Fuzzy/partial match for keywords that contain or start with the word
    Object.entries(ICON_KEYWORDS).forEach(([keyword, icons]) => {
      if (keyword.startsWith(word) || keyword.includes(word) || word.includes(keyword)) {
        icons.forEach((icon, index) => {
          const score = (5 - index) * (keyword === word ? 3 : 1);
          iconScores[icon] = (iconScores[icon] || 0) + score;
        });
      }
    });
  });
  
  // Sort icons by score
  const sortedIcons = Object.entries(iconScores)
    .sort((a, b) => b[1] - a[1])
    .map(([icon]) => icon);
  
  if (sortedIcons.length === 0) {
    return { icons: DEFAULT_SUGGESTED_ICONS, bestMatch: 'FileText' };
  }
  
  // Return top 5 suggestions and the best match
  const suggestedIcons = sortedIcons.slice(0, 5);
  
  // Pad with defaults if less than 5 matches
  while (suggestedIcons.length < 5) {
    const defaultIcon = DEFAULT_SUGGESTED_ICONS[suggestedIcons.length];
    if (!suggestedIcons.includes(defaultIcon)) {
      suggestedIcons.push(defaultIcon);
    } else {
      break;
    }
  }
  
  return { icons: suggestedIcons, bestMatch: sortedIcons[0] };
};

/**
 * CreateObjectDialog - Dialog for creating custom objects
 */
export const CreateObjectDialog = ({ isOpen, onClose, onObjectCreated }) => {
  const [formData, setFormData] = useState({
    object_name: '',
    object_label: '',
    object_plural: '',
    icon: 'FileText',
    name_field: 'name'
  });
  const [saving, setSaving] = useState(false);
  const [manualIconSelection, setManualIconSelection] = useState(false);

  // Get suggested icons based on label
  const { icons: suggestedIcons, bestMatch } = useMemo(
    () => getSuggestedIcons(formData.object_label),
    [formData.object_label]
  );

  // Auto-select best matching icon when label changes (unless user manually selected)
  useEffect(() => {
    if (!manualIconSelection && bestMatch && formData.object_label.length >= 2) {
      setFormData(prev => ({ ...prev, icon: bestMatch }));
    }
  }, [bestMatch, formData.object_label, manualIconSelection]);

  // Reset manual selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setManualIconSelection(false);
      setFormData({
        object_name: '',
        object_label: '',
        object_plural: '',
        icon: 'FileText',
        name_field: 'name'
      });
    }
  }, [isOpen]);

  const handleLabelChange = (label) => {
    setFormData({
      ...formData,
      object_label: label,
      object_plural: label + 's',
      object_name: label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    });
  };

  const handleIconSelect = (iconName) => {
    setManualIconSelection(true);
    setFormData({ ...formData, icon: iconName });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.object_label || !formData.object_name) {
      toast.error('Object label and name are required');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/objects`, formData);
      toast.success('Custom object created successfully!');
      onObjectCreated();
    } catch (error) {
      console.error('Error creating object:', error);
      toast.error(error.response?.data?.detail || 'Failed to create object');
    } finally {
      setSaving(false);
    }
  };

  // Helper function to get icon component
  const getIconComponent = (iconName) => {
    return ICON_COMPONENTS[iconName] || FileText;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Custom Object</DialogTitle>
          <DialogDescription>
            Define a new object type to track custom data in your CRM
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Object Label */}
          <div>
            <Label htmlFor="object_label">Object Label (Singular) *</Label>
            <Input
              id="object_label"
              value={formData.object_label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., Project, Invoice, Campaign"
              required
              data-testid="object-label-input"
            />
            <p className="text-xs text-slate-500 mt-1">Display name for a single record</p>
          </div>

          {/* Plural Label */}
          <div>
            <Label htmlFor="object_plural">Plural Label *</Label>
            <Input
              id="object_plural"
              value={formData.object_plural}
              onChange={(e) => setFormData({ ...formData, object_plural: e.target.value })}
              placeholder="e.g., Projects, Invoices, Campaigns"
              required
              data-testid="object-plural-input"
            />
            <p className="text-xs text-slate-500 mt-1">Display name for multiple records</p>
          </div>

          {/* Object API Name */}
          <div>
            <Label htmlFor="object_name">API Name (Read Only)</Label>
            <Input
              id="object_name"
              value={formData.object_name}
              disabled
              className="font-mono bg-slate-50"
              data-testid="object-api-name-input"
            />
            <p className="text-xs text-slate-500 mt-1">Auto-generated from label</p>
          </div>

          {/* Icon Selection */}
          <div>
            <Label className="flex items-center gap-2">
              Icon
              {formData.object_label.length >= 2 && (
                <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Smart suggestions
                </Badge>
              )}
            </Label>
            
            {/* Suggested Icons Section */}
            {formData.object_label.length >= 2 && (
              <div className="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                <p className="text-xs font-medium text-indigo-700 mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  Suggested for "{formData.object_label}"
                </p>
                <div className="flex gap-2">
                  {suggestedIcons.map((iconName, index) => {
                    const IconComponent = getIconComponent(iconName);
                    const isSelected = formData.icon === iconName;
                    
                    return (
                      <Button
                        key={`suggested-${iconName}-${index}`}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        className={`h-12 w-12 p-0 transition-all ${
                          isSelected 
                            ? 'bg-indigo-600 text-white shadow-md scale-105' 
                            : 'bg-white hover:bg-indigo-100 hover:border-indigo-300'
                        } ${index === 0 && !manualIconSelection ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
                        onClick={() => handleIconSelect(iconName)}
                        title={iconName}
                        data-testid={`suggested-icon-${iconName}`}
                      >
                        <IconComponent className="h-5 w-5" />
                      </Button>
                    );
                  })}
                </div>
                {!manualIconSelection && (
                  <p className="text-xs text-indigo-500 mt-2">
                    ✓ Best match auto-selected
                  </p>
                )}
              </div>
            )}

            {/* All Icons Section */}
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500 mb-2">
                All Icons ({ALL_ICONS.length})
              </p>
              <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg border">
                {ALL_ICONS.map((iconName) => {
                  const IconComponent = getIconComponent(iconName);
                  const isSelected = formData.icon === iconName;
                  const isSuggested = suggestedIcons.includes(iconName) && formData.object_label.length >= 2;

                  return (
                    <Button
                      key={iconName}
                      type="button"
                      variant={isSelected ? 'default' : 'ghost'}
                      className={`h-9 w-9 p-0 ${
                        isSelected 
                          ? 'bg-indigo-600 text-white' 
                          : isSuggested 
                            ? 'bg-indigo-50 border border-indigo-200' 
                            : 'hover:bg-slate-100'
                      }`}
                      onClick={() => handleIconSelect(iconName)}
                      title={iconName}
                      data-testid={`icon-${iconName}`}
                    >
                      <IconComponent className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="border rounded-lg p-4 bg-slate-50">
            <p className="text-sm text-slate-700">
              <strong>Default Fields:</strong> Your new object will include "Name" and "Description" fields by default.
              You can add more custom fields after creation via the "Manage Fields" tab.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? 'Creating...' : 'Create Object'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * ManageObjectsTab - Tab content for managing custom objects
 */
export const ManageObjectsTab = ({ objects, onObjectsChanged }) => {
  const [showCreateObject, setShowCreateObject] = useState(false);
  const [customObjects, setCustomObjects] = useState([]);

  useEffect(() => {
    // Filter custom objects
    const custom = objects.filter(obj => obj.is_custom);
    setCustomObjects(custom);
  }, [objects]);

  const handleDeleteObject = async (objectName) => {
    if (!window.confirm(`⚠️ WARNING: This will delete the object "${objectName}" and ALL its records permanently. Are you absolutely sure?`)) {
      return;
    }

    try {
      await axios.delete(`${API}/objects/${objectName}`);
      toast.success('Object deleted successfully');
      onObjectsChanged();
    } catch (error) {
      console.error('Error deleting object:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete object');
    }
  };

  // Helper function to get icon component
  const getIconComponent = (iconName) => {
    switch (iconName) {
      case 'Users': return Users;
      case 'Building2': return Building2;
      case 'Calendar': return CalendarIcon;
      case 'DollarSign': return DollarSign;
      default: return FileText;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Custom Objects</h3>
          <p className="text-sm text-slate-600">Create and manage custom object types</p>
        </div>
        <Button
          onClick={() => setShowCreateObject(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Object
        </Button>
      </div>

      {/* Objects Table */}
      {customObjects.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border rounded-lg bg-slate-50">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium mb-2">No custom objects yet</p>
          <p className="text-sm mb-4">Create your first custom object to start tracking custom data</p>
          <Button
            onClick={() => setShowCreateObject(true)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Object
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Object Name</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Plural Label</TableHead>
                <TableHead>Icon</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customObjects.map((obj) => {
                const IconComponent = getIconComponent(obj.icon);

                return (
                  <TableRow key={obj.object_name}>
                    <TableCell className="font-mono text-sm">{obj.object_name}</TableCell>
                    <TableCell className="font-medium">{obj.object_label}</TableCell>
                    <TableCell>{obj.object_plural}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <IconComponent className="h-5 w-5 text-slate-600" />
                        <span className="text-sm text-slate-500">{obj.icon || 'FileText'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteObject(obj.object_name)}
                        className="text-red-600 hover:text-red-700"
                        title="Delete custom object"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* All Objects Display */}
      <div className="border rounded-lg p-6 bg-white">
        <h4 className="font-semibold text-slate-900 mb-2 flex items-center justify-between">
          <span>All Objects</span>
          <span className="text-xs text-slate-500 font-normal">
            {objects.length} total • {objects.filter(o => o.is_custom).length} custom
          </span>
        </h4>
        <p className="text-sm text-slate-600 mb-4">
          Your CRM objects. Custom objects can be deleted.
        </p>
        
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Object Label</TableHead>
              <TableHead>API Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {objects.map((obj) => (
              <TableRow key={obj.object_name}>
                <TableCell className="font-medium">{obj.object_label || obj.object_name}</TableCell>
                <TableCell className="font-mono text-sm text-slate-600">{obj.object_name}</TableCell>
                <TableCell>
                  <Badge variant={obj.is_custom ? "default" : "secondary"} className={obj.is_custom ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}>
                    {obj.is_custom ? 'Custom Object' : 'Standard Object'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {obj.is_custom ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteObject(obj.object_name)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Protected</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Object Dialog */}
      {showCreateObject && (
        <CreateObjectDialog
          isOpen={showCreateObject}
          onClose={() => setShowCreateObject(false)}
          onObjectCreated={() => {
            setShowCreateObject(false);
            onObjectsChanged();
          }}
        />
      )}
    </div>
  );
};

export default ManageObjectsTab;
