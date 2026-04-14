import React from 'react';
import { Settings, Type, Plus, Trash2, Palette, Maximize2, Bell, LayoutGrid, Columns, Paintbrush } from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { Button } from '../../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import ToastRulesEditor from './ToastRulesEditor';
import DataTableProperties from './DataTableProperties';

// Theme Presets - Pre-built themes that apply all settings at once
const THEME_PRESETS = {
  'corporate-blue': {
    name: 'Corporate Blue',
    description: 'Professional blue theme with clean lines',
    pageBackground: 'gray-50',
    headerStyle: 'blue-gradient',
    contentBackground: 'white',
    buttonColor: 'blue',
    contentPadding: 'normal',
    borderRadius: 'lg',
    shadow: 'lg'
  },
  'modern-purple': {
    name: 'Modern Purple',
    description: 'Trendy purple gradient design',
    pageBackground: 'purple-50',
    headerStyle: 'purple-gradient',
    contentBackground: 'white',
    buttonColor: 'purple',
    contentPadding: 'relaxed',
    borderRadius: 'xl',
    shadow: 'lg'
  },
  'minimal-gray': {
    name: 'Minimal Gray',
    description: 'Clean, minimalist grayscale design',
    pageBackground: 'white',
    headerStyle: 'gray-gradient',
    contentBackground: 'gray-50',
    buttonColor: 'gray',
    contentPadding: 'normal',
    borderRadius: 'md',
    shadow: 'sm'
  },
  'forest-green': {
    name: 'Forest Green',
    description: 'Nature-inspired green theme',
    pageBackground: 'green-50',
    headerStyle: 'green-gradient',
    contentBackground: 'white',
    buttonColor: 'green',
    contentPadding: 'relaxed',
    borderRadius: 'lg',
    shadow: 'md'
  },
  'sunset-orange': {
    name: 'Sunset Orange',
    description: 'Warm, energetic orange design',
    pageBackground: 'amber-50',
    headerStyle: 'orange-gradient',
    contentBackground: 'white',
    buttonColor: 'orange',
    contentPadding: 'normal',
    borderRadius: 'xl',
    shadow: 'lg'
  },
  'indigo-pro': {
    name: 'Indigo Professional',
    description: 'Sophisticated indigo business theme',
    pageBackground: 'indigo-50',
    headerStyle: 'indigo-gradient',
    contentBackground: 'white',
    buttonColor: 'indigo',
    contentPadding: 'spacious',
    borderRadius: '2xl',
    shadow: 'xl'
  },
  'custom': {
    name: 'Custom Theme',
    description: 'Customize each setting individually'
  }
};

// Field Style Presets - Quick styling for individual fields
const FIELD_STYLE_PRESETS = {
  'default': {
    name: 'Default',
    labelColor: 'default',
    backgroundColor: 'transparent',
    borderColor: 'default',
    borderRadius: 'md'
  },
  'highlight-blue': {
    name: 'Highlight Blue',
    labelColor: 'blue',
    backgroundColor: 'blue-50',
    borderColor: 'blue',
    borderRadius: 'lg'
  },
  'highlight-green': {
    name: 'Highlight Green',
    labelColor: 'green',
    backgroundColor: 'green-50',
    borderColor: 'green',
    borderRadius: 'lg'
  },
  'highlight-purple': {
    name: 'Highlight Purple',
    labelColor: 'purple',
    backgroundColor: 'purple-50',
    borderColor: 'purple',
    borderRadius: 'lg'
  },
  'highlight-amber': {
    name: 'Highlight Amber',
    labelColor: 'amber',
    backgroundColor: 'amber-50',
    borderColor: 'amber',
    borderRadius: 'lg'
  },
  'subtle-gray': {
    name: 'Subtle Gray',
    labelColor: 'gray',
    backgroundColor: 'gray-50',
    borderColor: 'gray',
    borderRadius: 'md'
  },
  'bordered-accent': {
    name: 'Bordered Accent',
    labelColor: 'indigo',
    backgroundColor: 'transparent',
    borderColor: 'indigo',
    borderRadius: 'xl',
    borderWidth: '2'
  }
};

// Predefined color palettes for theme customization
const THEME_COLORS = {
  backgrounds: [
    { value: 'white', label: 'White', color: '#ffffff' },
    { value: 'gray-50', label: 'Light Gray', color: '#f9fafb' },
    { value: 'gray-100', label: 'Gray', color: '#f3f4f6' },
    { value: 'blue-50', label: 'Light Blue', color: '#eff6ff' },
    { value: 'indigo-50', label: 'Light Indigo', color: '#eef2ff' },
    { value: 'purple-50', label: 'Light Purple', color: '#faf5ff' },
    { value: 'green-50', label: 'Light Green', color: '#f0fdf4' },
    { value: 'amber-50', label: 'Light Amber', color: '#fffbeb' },
    { value: 'custom', label: 'Custom Color', color: null }
  ],
  headers: [
    { value: 'blue-gradient', label: 'Blue Gradient', gradient: 'from-blue-600 to-indigo-600' },
    { value: 'indigo-gradient', label: 'Indigo Gradient', gradient: 'from-indigo-600 to-purple-600' },
    { value: 'purple-gradient', label: 'Purple Gradient', gradient: 'from-purple-600 to-pink-600' },
    { value: 'green-gradient', label: 'Green Gradient', gradient: 'from-green-600 to-teal-600' },
    { value: 'orange-gradient', label: 'Orange Gradient', gradient: 'from-orange-500 to-red-500' },
    { value: 'gray-gradient', label: 'Gray Gradient', gradient: 'from-gray-700 to-gray-900' },
    { value: 'solid-blue', label: 'Solid Blue', gradient: null, solid: '#2563eb' },
    { value: 'solid-indigo', label: 'Solid Indigo', gradient: null, solid: '#4f46e5' },
    { value: 'solid-gray', label: 'Solid Gray', gradient: null, solid: '#374151' },
    { value: 'custom', label: 'Custom Color', gradient: null, solid: null }
  ],
  buttons: [
    { value: 'blue', label: 'Blue', color: '#2563eb', hover: '#1d4ed8' },
    { value: 'indigo', label: 'Indigo', color: '#4f46e5', hover: '#4338ca' },
    { value: 'purple', label: 'Purple', color: '#9333ea', hover: '#7e22ce' },
    { value: 'green', label: 'Green', color: '#16a34a', hover: '#15803d' },
    { value: 'orange', label: 'Orange', color: '#ea580c', hover: '#c2410c' },
    { value: 'gray', label: 'Gray', color: '#374151', hover: '#1f2937' },
    { value: 'custom', label: 'Custom Color', color: null, hover: null }
  ],
  // Field-level colors
  fieldLabels: [
    { value: 'default', label: 'Default', color: '#374151' },
    { value: 'blue', label: 'Blue', color: '#2563eb' },
    { value: 'indigo', label: 'Indigo', color: '#4f46e5' },
    { value: 'purple', label: 'Purple', color: '#9333ea' },
    { value: 'green', label: 'Green', color: '#16a34a' },
    { value: 'amber', label: 'Amber', color: '#d97706' },
    { value: 'red', label: 'Red', color: '#dc2626' },
    { value: 'gray', label: 'Gray', color: '#6b7280' }
  ],
  fieldBackgrounds: [
    { value: 'transparent', label: 'Transparent', color: 'transparent' },
    { value: 'white', label: 'White', color: '#ffffff' },
    { value: 'gray-50', label: 'Light Gray', color: '#f9fafb' },
    { value: 'blue-50', label: 'Light Blue', color: '#eff6ff' },
    { value: 'green-50', label: 'Light Green', color: '#f0fdf4' },
    { value: 'purple-50', label: 'Light Purple', color: '#faf5ff' },
    { value: 'amber-50', label: 'Light Amber', color: '#fffbeb' },
    { value: 'red-50', label: 'Light Red', color: '#fef2f2' }
  ],
  fieldBorders: [
    { value: 'default', label: 'Default', color: '#d1d5db' },
    { value: 'blue', label: 'Blue', color: '#3b82f6' },
    { value: 'indigo', label: 'Indigo', color: '#6366f1' },
    { value: 'purple', label: 'Purple', color: '#a855f7' },
    { value: 'green', label: 'Green', color: '#22c55e' },
    { value: 'amber', label: 'Amber', color: '#f59e0b' },
    { value: 'red', label: 'Red', color: '#ef4444' },
    { value: 'gray', label: 'Gray', color: '#9ca3af' }
  ]
};

const PropertiesPanel = ({ 
  selectedScreen, 
  selectedField, 
  screenConfig, 
  onScreenPropertyUpdate, 
  onFieldPropertyUpdate,
  allFields,
  toastConfig,
  onToastConfigUpdate,
  nodes = [] // Add nodes prop to pass flow nodes for Data Table configuration
}) => {
  console.log('[PROPERTIES PANEL] Rendering with:', { 
    selectedField: selectedField ? { id: selectedField.id, type: selectedField.type } : null,
    selectedScreen,
    hasScreenConfig: !!screenConfig,
    hasToastConfig: !!toastConfig,
    toastConfigValue: toastConfig
  });
  
  console.log('[PROPERTIES PANEL] Condition checks:');
  console.log('  Toast panel condition:', toastConfig && !selectedScreen && !selectedField);
  console.log('  Screen panel condition:', selectedScreen && !selectedField);
  console.log('  Field panel condition:', !!selectedField);
  
  // Toast Configuration Panel
  if (toastConfig && !selectedScreen && !selectedField) {
    console.log('[PROPERTIES PANEL] → Showing TOAST Configuration Panel');
    return (
      <div className="w-80 bg-white border-l flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
        {/* Header - Fixed */}
        <div className="p-4 border-b flex-shrink-0 bg-purple-50">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-semibold text-purple-900">Toast Configuration</h3>
          </div>
          <p className="text-xs text-purple-700">Configure conditional toast rules</p>
        </div>

        {/* MANDATORY SCROLLING */}
        <div className="flex-1 p-4 space-y-4" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
          <ToastRulesEditor 
            toastConfig={toastConfig}
            onChange={onToastConfigUpdate}
          />
        </div>
      </div>
    );
  }
  
  // Generate unique API name
  const generateUniqueApiName = (baseName, currentFieldId) => {
    const existingNames = allFields
      .filter(f => f.id !== currentFieldId)
      .map(f => f.name);
    
    let apiName = baseName.replace(/[^a-zA-Z0-9_]/g, '_');
    let counter = 1;
    let uniqueName = apiName;
    
    while (existingNames.includes(uniqueName)) {
      uniqueName = `${apiName}_${counter}`;
      counter++;
    }
    
    return uniqueName;
  };

  // Auto-generate API name from label
  const handleLabelChange = (value) => {
    if (selectedField) {
      onFieldPropertyUpdate(selectedField.id, 'label', value);
      
      // Auto-generate API name if field name is empty or looks auto-generated
      const currentName = selectedField.name || '';
      // Check if current name is auto-generated (contains only letters, underscores, and optionally trailing numbers)
      // Also check if current name derives from old label (converted with underscores)
      const oldLabelAsApiName = selectedField.label ? selectedField.label.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_') : '';
      const isAutoGenerated = !currentName || 
                              currentName.match(/^[A-Za-z_]+(_\d+)?$/) ||
                              currentName === oldLabelAsApiName ||
                              currentName.startsWith(oldLabelAsApiName);
      
      if (isAutoGenerated) {
        const newApiName = generateUniqueApiName(value, selectedField.id);
        onFieldPropertyUpdate(selectedField.id, 'name', newApiName);
      }
    }
  };

  // Add option for dropdown
  const addOption = () => {
    const currentOptions = selectedField.options || [];
    const newOption = `Option ${currentOptions.length + 1}`;
    onFieldPropertyUpdate(selectedField.id, 'options', [...currentOptions, newOption]);
  };

  // Update option
  const updateOption = (index, value) => {
    const updatedOptions = [...(selectedField.options || [])];
    updatedOptions[index] = value;
    onFieldPropertyUpdate(selectedField.id, 'options', updatedOptions);
  };

  // Remove option
  const removeOption = (index) => {
    const updatedOptions = (selectedField.options || []).filter((_, i) => i !== index);
    onFieldPropertyUpdate(selectedField.id, 'options', updatedOptions);
  };

  // Generate API name from screen title
  const generateScreenApiName = (title) => {
    if (!title || !title.trim()) return '';
    return title
      .trim()
      .replace(/[^a-zA-Z0-9_\s]/g, '')  // Remove special chars except spaces
      .replace(/\s+/g, '_')              // Replace spaces with underscores
      .replace(/_+/g, '_')               // Remove duplicate underscores
      .replace(/^_|_$/g, '');            // Remove leading/trailing underscores
  };

  // Handle screen title change - ALWAYS sync API name from title
  const handleScreenTitleChange = (newTitle) => {
    // Update title
    onScreenPropertyUpdate('screenTitle', newTitle);
    
    // ALWAYS generate API name from title for consistent sync
    if (newTitle && newTitle.trim()) {
      const newApiName = generateScreenApiName(newTitle);
      onScreenPropertyUpdate('screenApiName', newApiName);
    }
  };

  // Screen Properties
  if (selectedScreen && !selectedField) {
    console.log('[PROPERTIES PANEL] → Showing SCREEN Properties Panel');
    return (
      <div className="w-80 bg-white border-l flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
        {/* Header - Fixed */}
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Screen Properties</h3>
          </div>
          <p className="text-xs text-gray-500">Configure screen settings</p>
        </div>

        {/* MANDATORY SCROLLING */}
        <div className="flex-1 p-4 space-y-4" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
          {/* Screen Title */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Screen Title <span className="text-red-500">*</span>
            </Label>
            <Input
              value={screenConfig.screenTitle}
              onChange={(e) => handleScreenTitleChange(e.target.value)}
              placeholder="Enter screen title"
            />
          </div>

          {/* Screen API Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              API Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={screenConfig.screenApiName}
              onChange={(e) => onScreenPropertyUpdate('screenApiName', e.target.value)}
              placeholder="Screen_API_Name"
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500">Used in flow references</p>
          </div>

          {/* Screen Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Description</Label>
            <Textarea
              value={screenConfig.screenDescription}
              onChange={(e) => onScreenPropertyUpdate('screenDescription', e.target.value)}
              placeholder="Describe this screen"
              rows={3}
            />
          </div>

          {/* Header Configuration */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700">Header</h4>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showHeader"
                checked={screenConfig.headerConfig?.show !== false}
                onChange={(e) => onScreenPropertyUpdate('headerConfig', {
                  ...screenConfig.headerConfig,
                  show: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor="showHeader" className="text-sm text-gray-700">
                Show header
              </Label>
            </div>

            {screenConfig.headerConfig?.show !== false && (
              <div className="space-y-2 ml-6">
                <Label className="text-sm font-medium text-gray-700">Header Title</Label>
                <Input
                  value={screenConfig.headerConfig?.title || ''}
                  onChange={(e) => onScreenPropertyUpdate('headerConfig', {
                    ...screenConfig.headerConfig,
                    title: e.target.value
                  })}
                  placeholder={screenConfig.screenTitle}
                />
                <p className="text-xs text-gray-500">Leave empty to use screen title</p>
              </div>
            )}
          </div>

          {/* Footer Configuration */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700">Navigation Buttons</h4>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showPrevious"
                  checked={screenConfig.footerConfig?.showPrevious || false}
                  onChange={(e) => onScreenPropertyUpdate('footerConfig', {
                    ...screenConfig.footerConfig,
                    showPrevious: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="showPrevious" className="text-sm text-gray-700">
                  Show "Previous" button
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showNext"
                  checked={screenConfig.footerConfig?.showNext !== false}
                  onChange={(e) => onScreenPropertyUpdate('footerConfig', {
                    ...screenConfig.footerConfig,
                    showNext: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="showNext" className="text-sm text-gray-700">
                  Show "Next" button
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showFinish"
                  checked={screenConfig.footerConfig?.showFinish || false}
                  onChange={(e) => onScreenPropertyUpdate('footerConfig', {
                    ...screenConfig.footerConfig,
                    showFinish: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="showFinish" className="text-sm text-gray-700">
                  Show "Finish" button
                </Label>
              </div>
            </div>
          </div>

          {/* Form Layout Configuration - NEW FEATURE */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Columns className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-gray-700">Form Layout</h4>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Choose how fields are arranged on the screen
            </p>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Layout Type</Label>
              <Select
                value={screenConfig.layout?.type || 'oneColumn'}
                onValueChange={(value) => onScreenPropertyUpdate('layout', {
                  type: value,
                  columns: value === 'twoColumn' ? 2 : 1
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oneColumn">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-4 border border-gray-400 rounded flex">
                        <div className="flex-1 bg-gray-300 m-0.5 rounded-sm"></div>
                      </div>
                      <span>1 Column (Default)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="twoColumn">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-4 border border-gray-400 rounded flex">
                        <div className="flex-1 bg-blue-300 m-0.5 rounded-sm"></div>
                        <div className="flex-1 bg-blue-300 m-0.5 rounded-sm"></div>
                      </div>
                      <span>2 Columns</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {screenConfig.layout?.type === 'twoColumn' 
                  ? '✓ Fields will render in a 2-column grid. Drag fields between columns.'
                  : '✓ Fields will render vertically in a single column.'}
              </p>
            </div>
          </div>

          {/* Theme & Styling Configuration - NEW */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Paintbrush className="w-4 h-4 text-purple-600" />
              <h4 className="text-sm font-semibold text-gray-700">Theme & Styling</h4>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Customize the look and feel of this screen
            </p>
            
            {/* Theme Presets - Quick Apply */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Theme Preset</Label>
              <Select
                value={screenConfig.theme?.preset || 'custom'}
                onValueChange={(value) => {
                  if (value === 'custom') {
                    onScreenPropertyUpdate('theme', {
                      ...screenConfig.theme,
                      preset: 'custom'
                    });
                  } else {
                    // Apply all preset values
                    const preset = THEME_PRESETS[value];
                    if (preset) {
                      onScreenPropertyUpdate('theme', {
                        preset: value,
                        pageBackground: preset.pageBackground,
                        headerStyle: preset.headerStyle,
                        contentBackground: preset.contentBackground,
                        buttonColor: preset.buttonColor,
                        contentPadding: preset.contentPadding,
                        borderRadius: preset.borderRadius,
                        shadow: preset.shadow
                      });
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a preset" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span className="font-medium">{preset.name}</span>
                        <span className="text-xs text-gray-500">{preset.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {screenConfig.theme?.preset && screenConfig.theme?.preset !== 'custom' && (
                <p className="text-xs text-green-600">
                  ✓ Using {THEME_PRESETS[screenConfig.theme?.preset]?.name} preset
                </p>
              )}
            </div>
            
            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500">Individual Settings</span>
              </div>
            </div>
            
            {/* Page Background */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Page Background</Label>
              <Select
                value={screenConfig.theme?.pageBackground || 'gray-50'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom', // Switch to custom when manually editing
                  pageBackground: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select background" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_COLORS.backgrounds.map(bg => (
                    <SelectItem key={bg.value} value={bg.value}>
                      <div className="flex items-center gap-2">
                        {bg.color && (
                          <div 
                            className="w-4 h-4 rounded border border-gray-300" 
                            style={{ backgroundColor: bg.color }}
                          />
                        )}
                        <span>{bg.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {screenConfig.theme?.pageBackground === 'custom' && (
                <Input
                  type="color"
                  value={screenConfig.theme?.pageBackgroundCustom || '#f9fafb'}
                  onChange={(e) => onScreenPropertyUpdate('theme', {
                    ...screenConfig.theme,
                    preset: 'custom',
                    pageBackgroundCustom: e.target.value
                  })}
                  className="h-10 w-full cursor-pointer"
                />
              )}
            </div>

            {/* Header Style */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Header Style</Label>
              <Select
                value={screenConfig.theme?.headerStyle || 'blue-gradient'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  headerStyle: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select header style" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_COLORS.headers.map(header => (
                    <SelectItem key={header.value} value={header.value}>
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-8 h-4 rounded ${header.gradient ? `bg-gradient-to-r ${header.gradient}` : ''}`}
                          style={header.solid ? { backgroundColor: header.solid } : {}}
                        />
                        <span>{header.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {screenConfig.theme?.headerStyle === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-600">Start Color</Label>
                    <Input
                      type="color"
                      value={screenConfig.theme?.headerCustomStart || '#2563eb'}
                      onChange={(e) => onScreenPropertyUpdate('theme', {
                        ...screenConfig.theme,
                        preset: 'custom',
                        headerCustomStart: e.target.value
                      })}
                      className="h-8 cursor-pointer"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">End Color</Label>
                    <Input
                      type="color"
                      value={screenConfig.theme?.headerCustomEnd || '#4f46e5'}
                      onChange={(e) => onScreenPropertyUpdate('theme', {
                        ...screenConfig.theme,
                        preset: 'custom',
                        headerCustomEnd: e.target.value
                      })}
                      className="h-8 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Content Background */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Content Card Background</Label>
              <Select
                value={screenConfig.theme?.contentBackground || 'white'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  contentBackground: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select background" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_COLORS.backgrounds.map(bg => (
                    <SelectItem key={bg.value} value={bg.value}>
                      <div className="flex items-center gap-2">
                        {bg.color && (
                          <div 
                            className="w-4 h-4 rounded border border-gray-300" 
                            style={{ backgroundColor: bg.color }}
                          />
                        )}
                        <span>{bg.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {screenConfig.theme?.contentBackground === 'custom' && (
                <Input
                  type="color"
                  value={screenConfig.theme?.contentBackgroundCustom || '#ffffff'}
                  onChange={(e) => onScreenPropertyUpdate('theme', {
                    ...screenConfig.theme,
                    preset: 'custom',
                    contentBackgroundCustom: e.target.value
                  })}
                  className="h-10 w-full cursor-pointer"
                />
              )}
            </div>

            {/* Primary Button Color */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Button Color</Label>
              <Select
                value={screenConfig.theme?.buttonColor || 'blue'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  buttonColor: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select button color" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_COLORS.buttons.map(btn => (
                    <SelectItem key={btn.value} value={btn.value}>
                      <div className="flex items-center gap-2">
                        {btn.color && (
                          <div 
                            className="w-4 h-4 rounded" 
                            style={{ backgroundColor: btn.color }}
                          />
                        )}
                        <span>{btn.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {screenConfig.theme?.buttonColor === 'custom' && (
                <Input
                  type="color"
                  value={screenConfig.theme?.buttonColorCustom || '#2563eb'}
                  onChange={(e) => onScreenPropertyUpdate('theme', {
                    ...screenConfig.theme,
                    preset: 'custom',
                    buttonColorCustom: e.target.value
                  })}
                  className="h-10 w-full cursor-pointer"
                />
              )}
            </div>

            {/* Container Padding */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Content Padding</Label>
              <Select
                value={screenConfig.theme?.contentPadding || 'normal'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  contentPadding: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select padding" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact (16px)</SelectItem>
                  <SelectItem value="normal">Normal (24px)</SelectItem>
                  <SelectItem value="relaxed">Relaxed (32px)</SelectItem>
                  <SelectItem value="spacious">Spacious (48px)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Border Radius */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Card Border Radius</Label>
              <Select
                value={screenConfig.theme?.borderRadius || 'lg'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  borderRadius: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select border radius" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (0px)</SelectItem>
                  <SelectItem value="sm">Small (4px)</SelectItem>
                  <SelectItem value="md">Medium (8px)</SelectItem>
                  <SelectItem value="lg">Large (12px)</SelectItem>
                  <SelectItem value="xl">Extra Large (16px)</SelectItem>
                  <SelectItem value="2xl">2XL (24px)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shadow */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Card Shadow</Label>
              <Select
                value={screenConfig.theme?.shadow || 'lg'}
                onValueChange={(value) => onScreenPropertyUpdate('theme', {
                  ...screenConfig.theme,
                  preset: 'custom',
                  shadow: value
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select shadow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="xl">Extra Large</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset to Default Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onScreenPropertyUpdate('theme', null)}
              className="w-full mt-2"
            >
              Reset to Default Theme
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Field Properties
  if (selectedField) {
    console.log('[PROPERTIES PANEL] → Showing FIELD Properties Panel');
    
    // Special handling for Data Table component
    if (selectedField.type === 'DataTable') {
      return (
        <div className="w-80 bg-white border-l flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
          <div className="p-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Type className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Data Table Properties</h3>
            </div>
            <p className="text-xs text-gray-500">Configure data table settings</p>
          </div>
          
          <div className="flex-1 p-4" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            <DataTableProperties 
              field={selectedField}
              onUpdate={onFieldPropertyUpdate}
              nodes={nodes}
            />
          </div>
        </div>
      );
    }
    
    return (
      <div className="w-80 bg-white border-l flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
        {/* Header - Fixed */}
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Type className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Field Properties</h3>
          </div>
          <p className="text-xs text-gray-500">{selectedField.type} Field</p>
        </div>

        {/* MANDATORY SCROLLING */}
        <div className="flex-1 p-4 space-y-4" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
          {/* Field Label */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Label <span className="text-red-500">*</span>
            </Label>
            <Input
              value={selectedField.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Enter field label"
            />
          </div>

          {/* API Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              API Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={selectedField.name}
              onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'name', e.target.value)}
              placeholder="field_api_name"
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500">Must be unique</p>
          </div>

          {/* Required */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="required"
              checked={selectedField.required || false}
              onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'required', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <Label htmlFor="required" className="text-sm text-gray-700">
              Required field
            </Label>
          </div>

          {/* Help Text */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Help Text</Label>
            <Textarea
              value={selectedField.helpText || ''}
              onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'helpText', e.target.value)}
              placeholder="Provide guidance for this field"
              rows={2}
            />
            <p className="text-xs text-gray-500">Displayed as a tooltip next to the field</p>
          </div>

          {/* SALESFORCE FEATURE: Conditional Visibility */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-700">Conditional Visibility</Label>
              <input
                type="checkbox"
                checked={selectedField.hasVisibilityRule || false}
                onChange={(e) => {
                  onFieldPropertyUpdate(selectedField.id, 'hasVisibilityRule', e.target.checked);
                  if (!e.target.checked) {
                    onFieldPropertyUpdate(selectedField.id, 'visibilityRule', null);
                  } else {
                    // Initialize with default rule
                    onFieldPropertyUpdate(selectedField.id, 'visibilityRule', {
                      field: '',
                      operator: 'equals',
                      value: ''
                    });
                  }
                }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {selectedField.hasVisibilityRule && (
              <div className="space-y-3 bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-800">
                  Show this field only when the condition is met
                </p>
                
                {/* Field to compare */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">When Field</Label>
                  <Select
                    value={selectedField.visibilityRule?.field || ''}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'visibilityRule', {
                      ...selectedField.visibilityRule,
                      field: value
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allFields
                        .filter(f => f.id !== selectedField.id) // Can't reference self
                        .map(field => (
                          <SelectItem key={field.id} value={field.name}>
                            {field.label} ({field.name})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Operator */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Operator</Label>
                  <Select
                    value={selectedField.visibilityRule?.operator || 'equals'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'visibilityRule', {
                      ...selectedField.visibilityRule,
                      operator: value
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Not Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="not_contains">Does Not Contain</SelectItem>
                      <SelectItem value="starts_with">Starts With</SelectItem>
                      <SelectItem value="greater_than">Greater Than</SelectItem>
                      <SelectItem value="less_than">Less Than</SelectItem>
                      <SelectItem value="is_null">Is Null</SelectItem>
                      <SelectItem value="is_not_null">Is Not Null</SelectItem>
                      <SelectItem value="is_empty">Is Empty</SelectItem>
                      <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Value (only if not is_empty/is_not_empty/is_null/is_not_null) */}
                {!['is_empty', 'is_not_empty', 'is_null', 'is_not_null'].includes(selectedField.visibilityRule?.operator) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-700">Value</Label>
                    <Input
                      value={selectedField.visibilityRule?.value || ''}
                      onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'visibilityRule', {
                        ...selectedField.visibilityRule,
                        value: e.target.value
                      })}
                      placeholder="Enter value..."
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SALESFORCE FEATURE: Enhanced Validation */}
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-sm font-semibold text-gray-700">Validation Rules</Label>
            
            {/* Min/Max Length (for text fields) */}
            {['Text', 'Email', 'Phone', 'URL', 'Textarea'].includes(selectedField.type) && (
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-700">Min Length</Label>
                    <Input
                      type="number"
                      value={selectedField.minLength || ''}
                      onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'minLength', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="No min"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-700">Max Length</Label>
                    <Input
                      type="number"
                      value={selectedField.maxLength || ''}
                      onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'maxLength', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="No max"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Min/Max Value (for number fields) */}
            {['Number', 'Currency', 'Percent'].includes(selectedField.type) && (
              <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-700">Min Value</Label>
                    <Input
                      type="number"
                      value={selectedField.minValue !== undefined ? selectedField.minValue : ''}
                      onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'minValue', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="No min"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-700">Max Value</Label>
                    <Input
                      type="number"
                      value={selectedField.maxValue !== undefined ? selectedField.maxValue : ''}
                      onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'maxValue', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="No max"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Custom Regex Pattern */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">Custom Pattern (Regex)</Label>
              <Input
                value={selectedField.pattern || ''}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'pattern', e.target.value)}
                placeholder="e.g., ^[A-Z]{3}-\d{4}$"
                className="h-8 text-xs font-mono"
              />
              <p className="text-xs text-gray-500">Regular expression for custom validation</p>
            </div>
            
            {/* Custom Error Message */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">Error Message</Label>
              <Input
                value={selectedField.errorMessage || ''}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'errorMessage', e.target.value)}
                placeholder="Custom validation error message"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Read-Only Option */}
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="readOnly"
                checked={selectedField.readOnly || false}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'readOnly', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor="readOnly" className="text-sm text-gray-700">
                Read-Only (display only)
              </Label>
            </div>
          </div>

          {/* Column Layout Options - Visible in 2-column mode */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <LayoutGrid className="w-4 h-4 text-indigo-600" />
              <Label className="text-sm font-semibold text-gray-700">Layout Options</Label>
            </div>
            
            {/* Column Span */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">Column Span</Label>
              <Select
                value={selectedField.layout?.span || 'single'}
                onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'layout', {
                  ...selectedField.layout,
                  span: value
                })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Column</SelectItem>
                  <SelectItem value="full">Full Width (Span Both Columns)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                In 2-column layout, "Full Width" spans across both columns
              </p>
            </div>
            
            {/* Column Placement (only for single span) */}
            {(selectedField.layout?.span !== 'full') && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700">Preferred Column</Label>
                <Select
                  value={String(selectedField.layout?.col || 1)}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'layout', {
                    ...selectedField.layout,
                    col: parseInt(value)
                  })}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Left Column</SelectItem>
                    <SelectItem value="2">Right Column</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Position this field in the left or right column (in 2-column layout)
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Description</Label>
            <Textarea
              value={selectedField.description || ''}
              onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'description', e.target.value)}
              placeholder="Field description"
              rows={2}
            />
          </div>

          {/* Default Value (except checkbox) */}
          {selectedField.type !== 'Checkbox' && selectedField.type !== 'Dropdown' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Default Value</Label>
              <Input
                value={selectedField.defaultValue || ''}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'defaultValue', e.target.value)}
                placeholder="Default value"
              />
            </div>
          )}

          {/* Dropdown/MultiSelect/Radio Options */}
          {(selectedField.type === 'Dropdown' || selectedField.type === 'MultiSelect' || selectedField.type === 'Radio') && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-700">
                  {selectedField.type === 'Radio' ? 'Radio Options' : 'Picklist Options'}
                </Label>
                <Button
                  type="button"
                  onClick={addOption}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {(selectedField.options || []).map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1"
                    />
                    <button
                      onClick={() => removeOption(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {(selectedField.options || []).length === 0 && (
                <div className="text-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <p className="text-xs text-gray-600">No options added</p>
                  <p className="text-xs text-gray-500 mt-1">Click "Add" to create options</p>
                </div>
              )}
            </div>
          )}

          {/* Checkbox Default */}
          {selectedField.type === 'Checkbox' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultChecked"
                checked={selectedField.defaultValue === true || selectedField.defaultValue === 'true'}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'defaultValue', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor="defaultChecked" className="text-sm text-gray-700">
                Checked by default
              </Label>
            </div>
          )}

          {/* Style & Layout Section */}
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-gray-900">Style & Layout</h4>
            </div>

            {/* Field Style Preset - Quick styling for input fields */}
            {!['DisplayText', 'Heading', 'Toast', 'DataTable'].includes(selectedField.type) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Style Preset</Label>
                <Select
                  value={selectedField.stylePreset || 'default'}
                  onValueChange={(value) => {
                    const preset = FIELD_STYLE_PRESETS[value];
                    if (preset && value !== 'default') {
                      onFieldPropertyUpdate(selectedField.id, 'style', {
                        preset: value,
                        labelColor: preset.labelColor,
                        backgroundColor: preset.backgroundColor,
                        borderColor: preset.borderColor,
                        borderRadius: preset.borderRadius,
                        borderWidth: preset.borderWidth || '1'
                      });
                      onFieldPropertyUpdate(selectedField.id, 'stylePreset', value);
                    } else {
                      onFieldPropertyUpdate(selectedField.id, 'style', null);
                      onFieldPropertyUpdate(selectedField.id, 'stylePreset', 'default');
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_STYLE_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {key !== 'default' && (
                            <div 
                              className="w-4 h-4 rounded border"
                              style={{ 
                                backgroundColor: THEME_COLORS.fieldBackgrounds.find(b => b.value === preset.backgroundColor)?.color || 'transparent',
                                borderColor: THEME_COLORS.fieldBorders.find(b => b.value === preset.borderColor)?.color || '#d1d5db'
                              }}
                            />
                          )}
                          <span>{preset.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Custom Field Styling - For input fields */}
            {!['DisplayText', 'Heading', 'Toast', 'DataTable'].includes(selectedField.type) && (
              <>
                {/* Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-gray-400">Custom Styling</span>
                  </div>
                </div>
                
                {/* Label Color */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Label Color</Label>
                  <Select
                    value={selectedField.style?.labelColor || 'default'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'style', {
                      ...selectedField.style,
                      labelColor: value
                    })}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEME_COLORS.fieldLabels.map(label => (
                        <SelectItem key={label.value} value={label.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: label.color }}
                            />
                            <span>{label.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Background Color */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Background Color</Label>
                  <Select
                    value={selectedField.style?.backgroundColor || 'transparent'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'style', {
                      ...selectedField.style,
                      backgroundColor: value
                    })}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEME_COLORS.fieldBackgrounds.map(bg => (
                        <SelectItem key={bg.value} value={bg.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded border border-gray-300" 
                              style={{ backgroundColor: bg.color }}
                            />
                            <span>{bg.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Border Color */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Border Color</Label>
                  <Select
                    value={selectedField.style?.borderColor || 'default'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'style', {
                      ...selectedField.style,
                      borderColor: value
                    })}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEME_COLORS.fieldBorders.map(border => (
                        <SelectItem key={border.value} value={border.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded border-2" 
                              style={{ borderColor: border.color }}
                            />
                            <span>{border.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Border Radius */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Border Radius</Label>
                  <Select
                    value={selectedField.style?.borderRadius || 'md'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'style', {
                      ...selectedField.style,
                      borderRadius: value
                    })}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="sm">Small</SelectItem>
                      <SelectItem value="md">Medium</SelectItem>
                      <SelectItem value="lg">Large</SelectItem>
                      <SelectItem value="xl">Extra Large</SelectItem>
                      <SelectItem value="full">Full (Pill)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reset Field Style */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onFieldPropertyUpdate(selectedField.id, 'style', null);
                    onFieldPropertyUpdate(selectedField.id, 'stylePreset', 'default');
                  }}
                  className="w-full h-7 text-xs"
                >
                  Reset to Default Style
                </Button>
              </>
            )}

            {/* Field Width */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Field Width</Label>
              <Select
                value={selectedField.width || 'full'}
                onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'width', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Width (100%)</SelectItem>
                  <SelectItem value="half">Half Width (50%)</SelectItem>
                  <SelectItem value="third">One Third (33%)</SelectItem>
                  <SelectItem value="quarter">Quarter (25%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Text Alignment */}
            {(selectedField.type === 'Text' || selectedField.type === 'DisplayText' || selectedField.type === 'Heading') && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Text Alignment</Label>
                <Select
                  value={selectedField.alignment || 'left'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'alignment', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Font Size */}
            {(selectedField.type === 'DisplayText' || selectedField.type === 'Heading') && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Font Size</Label>
                <Select
                  value={selectedField.fontSize || 'base'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'fontSize', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xs">Extra Small</SelectItem>
                    <SelectItem value="sm">Small</SelectItem>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="lg">Large</SelectItem>
                    <SelectItem value="xl">Extra Large</SelectItem>
                    <SelectItem value="2xl">2X Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Font Weight */}
            {(selectedField.type === 'DisplayText' || selectedField.type === 'Heading') && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Font Weight</Label>
                <Select
                  value={selectedField.fontWeight || 'normal'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'fontWeight', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="semibold">Semi Bold</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Text Color */}
            {(selectedField.type === 'DisplayText' || selectedField.type === 'Heading') && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Text Color</Label>
                <Select
                  value={selectedField.textColor || 'default'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'textColor', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="gray">Gray</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="yellow">Yellow</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          {/* TOAST COMPONENT CONFIGURATION */}
          {selectedField.type === 'Toast' && (
            <div className="space-y-4">
              {console.log('[PROPERTIES PANEL] Rendering Toast Properties for:', selectedField.id)}
              {/* Title (Optional) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Title (Optional)</Label>
                <Input
                  value={selectedField.title || ''}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'title', e.target.value)}
                  placeholder="Success"
                />
              </div>

              {/* Message (Required) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Message <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={selectedField.message || ''}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'message', e.target.value)}
                  placeholder="Record created: {{createdLeadId}}"
                  rows={3}
                />
                <p className="text-xs text-gray-500">
                  Supports variables: {'{{Screen.field}}'}, {'{{varName}}'}, {'{{recordId}}'}
                </p>
              </div>

              {/* Variant / Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Type</Label>
                <Select
                  value={selectedField.variant || 'info'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'variant', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Duration (ms)</Label>
                <Input
                  type="number"
                  value={selectedField.duration || 3000}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'duration', parseInt(e.target.value) || 3000)}
                  min="1000"
                  placeholder="3000"
                />
                <p className="text-xs text-gray-500">Minimum: 1000ms (1 second)</p>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Position</Label>
                <Select
                  value={selectedField.position || 'top-right'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'position', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dismissible */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dismissible"
                  checked={selectedField.dismissible !== false}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'dismissible', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="dismissible" className="text-sm text-gray-700">
                  User can dismiss
                </Label>
              </div>

              {/* Show on Screen Load */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showOnLoad"
                  checked={selectedField.showOnLoad !== false}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'showOnLoad', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="showOnLoad" className="text-sm text-gray-700">
                  Show on screen load
                </Label>
              </div>

              {/* Show Icon */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showIcon"
                  checked={selectedField.showIcon !== false}
                  onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'showIcon', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Label htmlFor="showIcon" className="text-sm text-gray-700">
                  Show icon
                </Label>
              </div>

              {/* Trigger Timing */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Trigger Timing</Label>
                <Select
                  value={selectedField.triggerTiming || 'onScreenLoad'}
                  onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'triggerTiming', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onScreenLoad">On Screen Load</SelectItem>
                    <SelectItem value="onNextClick">On Next Click</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {selectedField.triggerTiming === 'onNextClick' 
                    ? 'Toast shows when user clicks Next button' 
                    : 'Toast shows immediately when screen loads'}
                </p>
              </div>

              {/* Display Condition */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-gray-800">Display Condition</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enableCondition"
                      checked={selectedField.displayCondition?.enabled || false}
                      onChange={(e) => {
                        const newCondition = {
                          ...selectedField.displayCondition,
                          enabled: e.target.checked,
                          formula: selectedField.displayCondition?.formula || ''
                        };
                        onFieldPropertyUpdate(selectedField.id, 'displayCondition', newCondition);
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <Label htmlFor="enableCondition" className="text-sm text-gray-700">
                      Enable condition
                    </Label>
                  </div>
                </div>

                {selectedField.displayCondition?.enabled && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-700">
                        Condition Formula <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={selectedField.displayCondition?.formula || ''}
                        onChange={(e) => {
                          const newCondition = {
                            ...selectedField.displayCondition,
                            formula: e.target.value
                          };
                          onFieldPropertyUpdate(selectedField.id, 'displayCondition', newCondition);
                        }}
                        placeholder="{{Screen.Email}} == null"
                        rows={3}
                        className="font-mono text-sm"
                      />
                      <div className="text-xs text-gray-500 space-y-1">
                        <p className="font-medium">Examples:</p>
                        <p>• {'{{Screen.Email}} == null'}</p>
                        <p>• {'{{Screen.Status}} == "New"'}</p>
                        <p>• {'contains({{Screen.Email}}, "@") == false'}</p>
                        <p>• {'{{createdLeadId}} != null'}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-700">
                        Condition Mode
                      </Label>
                      <Select
                        value={selectedField.displayCondition?.mode || 'showIfTrue'}
                        onValueChange={(value) => {
                          const newCondition = {
                            ...selectedField.displayCondition,
                            mode: value
                          };
                          onFieldPropertyUpdate(selectedField.id, 'displayCondition', newCondition);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="showIfTrue">Show only if condition is TRUE</SelectItem>
                          <SelectItem value="showIfFalse">Show only if condition is FALSE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                      <p className="font-medium mb-1">ℹ️ Validation Rules:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>Condition must evaluate to boolean (true/false)</li>
                        <li>All referenced variables must exist</li>
                        <li>Invalid conditions will block Save & Activate</li>
                      </ul>
                    </div>

                    {selectedField.variant === 'error' && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                        <p className="font-semibold mb-1">⚠️ Error Toast Behavior:</p>
                        <p>When condition is TRUE and Error toast displays:</p>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          <li>Flow execution STOPS immediately (terminal)</li>
                          <li>Next/Finish buttons are disabled</li>
                          <li>User must close preview/flow</li>
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {!selectedField.displayCondition?.enabled && (
                  <p className="text-xs text-gray-500 italic">
                    Toast will always display when triggered
                  </p>
                )}
              </div>
            </div>
          )}

            {/* Margin & Padding */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Spacing</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-600">Top Margin</Label>
                  <Select
                    value={selectedField.marginTop || 'normal'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'marginTop', value)}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Bottom Margin</Label>
                  <Select
                    value={selectedField.marginBottom || 'normal'}
                    onValueChange={(value) => onFieldPropertyUpdate(selectedField.id, 'marginBottom', value)}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="visible"
                checked={selectedField.visible !== false}
                onChange={(e) => onFieldPropertyUpdate(selectedField.id, 'visible', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <Label htmlFor="visible" className="text-sm text-gray-700">
                Visible by default
              </Label>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // No selection - default message
  return (
    <div className="w-80 bg-white border-l flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Settings className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-2">No Selection</h3>
      <p className="text-xs text-gray-500">
        Click on the screen background or a field to view and edit properties
      </p>
    </div>
  );
};

export default PropertiesPanel;
