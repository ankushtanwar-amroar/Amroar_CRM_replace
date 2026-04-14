import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Type, Hash, Mail, Phone, Calendar, CheckSquare, 
  ChevronDown, AlignLeft, GripVertical, Trash2, AlertCircle,
  Clock, Lock, DollarSign, Percent, Link, Upload, Image as ImageIcon,
  FileImage, MapPin, Map, Star, Sliders, User, Users, Building,
  CreditCard, Globe, Tag, Paperclip, Calculator, Eye, AlignCenter,
  Heading, FileText, ToggleLeft, Radio, List, SearchIcon, Bell, Table
} from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Label } from '../../../../components/ui/label';
import ToastPlaceholder from './ToastPlaceholder';

// Theme style computation utilities
const getThemeStyles = (theme) => {
  const styles = {
    pageBackground: {},
    contentCard: {},
    header: {},
    headerStyle: {},
    button: {},
    contentPadding: 'p-6'
  };

  if (!theme) return styles;

  // Page background
  const bgColorMap = {
    'white': '#ffffff',
    'gray-50': '#f9fafb',
    'gray-100': '#f3f4f6',
    'blue-50': '#eff6ff',
    'indigo-50': '#eef2ff',
    'purple-50': '#faf5ff',
    'green-50': '#f0fdf4',
    'amber-50': '#fffbeb'
  };
  if (theme.pageBackground === 'custom' && theme.pageBackgroundCustom) {
    styles.pageBackground = { backgroundColor: theme.pageBackgroundCustom };
  } else if (bgColorMap[theme.pageBackground]) {
    styles.pageBackground = { backgroundColor: bgColorMap[theme.pageBackground] };
  }

  // Content card background
  if (theme.contentBackground === 'custom' && theme.contentBackgroundCustom) {
    styles.contentCard.backgroundColor = theme.contentBackgroundCustom;
  } else if (bgColorMap[theme.contentBackground]) {
    styles.contentCard.backgroundColor = bgColorMap[theme.contentBackground];
  }

  // Border radius
  const radiusMap = {
    'none': '0px',
    'sm': '4px',
    'md': '8px',
    'lg': '12px',
    'xl': '16px',
    '2xl': '24px'
  };
  if (radiusMap[theme.borderRadius]) {
    styles.contentCard.borderRadius = radiusMap[theme.borderRadius];
  }

  // Shadow
  const shadowMap = {
    'none': 'none',
    'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
  };
  if (shadowMap[theme.shadow]) {
    styles.contentCard.boxShadow = shadowMap[theme.shadow];
  }

  // Header style
  const headerGradients = {
    'blue-gradient': 'linear-gradient(to right, #2563eb, #4f46e5)',
    'indigo-gradient': 'linear-gradient(to right, #4f46e5, #9333ea)',
    'purple-gradient': 'linear-gradient(to right, #9333ea, #ec4899)',
    'green-gradient': 'linear-gradient(to right, #16a34a, #0d9488)',
    'orange-gradient': 'linear-gradient(to right, #ea580c, #ef4444)',
    'gray-gradient': 'linear-gradient(to right, #374151, #111827)'
  };
  const headerSolids = {
    'solid-blue': '#2563eb',
    'solid-indigo': '#4f46e5',
    'solid-gray': '#374151'
  };
  
  if (theme.headerStyle === 'custom' && theme.headerCustomStart && theme.headerCustomEnd) {
    styles.header = { background: `linear-gradient(to right, ${theme.headerCustomStart}, ${theme.headerCustomEnd})` };
  } else if (headerGradients[theme.headerStyle]) {
    styles.header = { background: headerGradients[theme.headerStyle] };
  } else if (headerSolids[theme.headerStyle]) {
    styles.header = { backgroundColor: headerSolids[theme.headerStyle] };
  }

  // Button color
  const buttonColors = {
    'blue': { backgroundColor: '#2563eb', hover: '#1d4ed8' },
    'indigo': { backgroundColor: '#4f46e5', hover: '#4338ca' },
    'purple': { backgroundColor: '#9333ea', hover: '#7e22ce' },
    'green': { backgroundColor: '#16a34a', hover: '#15803d' },
    'orange': { backgroundColor: '#ea580c', hover: '#c2410c' },
    'gray': { backgroundColor: '#374151', hover: '#1f2937' }
  };
  if (theme.buttonColor === 'custom' && theme.buttonColorCustom) {
    styles.button = { backgroundColor: theme.buttonColorCustom };
  } else if (buttonColors[theme.buttonColor]) {
    styles.button = buttonColors[theme.buttonColor];
  }

  // Content padding
  const paddingMap = {
    'compact': 'p-4',
    'normal': 'p-6',
    'relaxed': 'p-8',
    'spacious': 'p-12'
  };
  styles.contentPadding = paddingMap[theme.contentPadding] || 'p-6';

  return styles;
};

// Helper function to render icon for field type
const FieldTypeIcon = ({ type, className }) => {
  const icons = {
    Text: Type, Number: Hash, Email: Mail, Phone: Phone, Date: Calendar,
    DateTime: Clock, Time: Clock, Checkbox: CheckSquare, Toggle: ToggleLeft,
    Radio: Radio, Dropdown: ChevronDown, MultiSelect: List, Textarea: AlignLeft,
    RichText: FileText, Password: Lock, Currency: DollarSign, Percent: Percent,
    URL: Link, Lookup: SearchIcon, File: Upload, Image: Image, Signature: FileImage,
    Address: MapPin, Location: Map, Rating: Star, Slider: Sliders, Name: User,
    FullName: Users, Company: Building, CreditCard: CreditCard, SSN: Lock,
    Country: Globe, State: Map, Tag: Tag, Color: Paperclip, Formula: Calculator,
    DisplayText: Eye, Section: AlignCenter, Heading: Heading, DataTable: Table
  };
  const Icon = icons[type] || Type;
  return <Icon className={className} />;
};

const SortableField = ({ field, isSelected, onClick, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Special handling for Toast - render placeholder only
  if (field.type === 'Toast') {
    const handleToastClick = (e) => {
      e.preventDefault();
      e.stopPropagation(); // CRITICAL: Prevent screen background click
      console.log('[TOAST CLICK] Toast clicked, ID:', field.id);
      onClick(field.id);
    };

    return (
      <div 
        ref={setNodeRef} 
        style={style}
        className={isDragging ? 'opacity-50' : ''}
      >
        {/* Clickable wrapper - OUTSIDE drag handle */}
        <div 
          onClick={handleToastClick}
          style={{ 
            pointerEvents: 'auto', 
            cursor: 'pointer', 
            position: 'relative', 
            zIndex: 10 
          }}
        >
          {/* Drag handle - small area only */}
          <div 
            {...attributes} 
            {...listeners} 
            className="absolute top-2 left-2 p-1 cursor-grab active:cursor-grabbing bg-gray-200 rounded z-20"
            style={{ pointerEvents: 'auto' }}
            title="Drag to reorder"
          >
            <div className="w-3 h-3 flex items-center justify-center">
              <span className="text-xs">⋮⋮</span>
            </div>
          </div>
          
          {/* Toast content */}
          <ToastPlaceholder 
            field={field}
            isSelected={isSelected}
            onClick={handleToastClick}
            onDelete={() => onDelete(field.id)}
          />
        </div>
      </div>
    );
  }

  // FIX #3: Handle field click to open properties panel
  const handleFieldClick = (e) => {
    e.stopPropagation(); // Prevent screen click
    console.log('[FIELD CLICK] Field clicked, ID:', field.id);
    onClick(field.id);
  };

  // Get width class based on field width setting
  const getWidthClass = () => {
    switch (field.width) {
      case 'half': return 'w-1/2';
      case 'third': return 'w-1/3';
      case 'quarter': return 'w-1/4';
      default: return 'w-full';
    }
  };

  // Get margin classes
  const getMarginClass = () => {
    const margins = [];
    if (field.marginTop === 'small') margins.push('mt-2');
    else if (field.marginTop === 'large') margins.push('mt-6');
    else if (field.marginTop !== 'none') margins.push('mt-4');
    
    if (field.marginBottom === 'small') margins.push('mb-2');
    else if (field.marginBottom === 'large') margins.push('mb-6');
    else if (field.marginBottom !== 'none') margins.push('mb-4');
    
    return margins.join(' ');
  };

  // Get text alignment
  const getTextAlignClass = () => {
    if (field.alignment === 'center') return 'text-center';
    if (field.alignment === 'right') return 'text-right';
    return 'text-left';
  };

  // Get font size for display components
  const getFontSizeClass = () => {
    const sizes = {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl'
    };
    return sizes[field.fontSize] || 'text-base';
  };

  // Get font weight
  const getFontWeightClass = () => {
    const weights = {
      light: 'font-light',
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold'
    };
    return weights[field.fontWeight] || 'font-normal';
  };

  // Get text color
  const getTextColorClass = () => {
    const colors = {
      gray: 'text-gray-600',
      blue: 'text-blue-600',
      green: 'text-green-600',
      red: 'text-red-600',
      yellow: 'text-yellow-600',
      purple: 'text-purple-600'
    };
    return colors[field.textColor] || 'text-gray-900';
  };

  // Get field-level custom styles
  const getFieldStyles = () => {
    const style = field.style || {};
    const styles = {
      container: {},
      label: {},
      input: {}
    };
    
    // Label color
    const labelColors = {
      'default': '#374151',
      'blue': '#2563eb',
      'indigo': '#4f46e5',
      'purple': '#9333ea',
      'green': '#16a34a',
      'amber': '#d97706',
      'red': '#dc2626',
      'gray': '#6b7280'
    };
    if (style.labelColor && style.labelColor !== 'default') {
      styles.label.color = labelColors[style.labelColor] || '#374151';
    }
    
    // Background color
    const bgColors = {
      'transparent': 'transparent',
      'white': '#ffffff',
      'gray-50': '#f9fafb',
      'blue-50': '#eff6ff',
      'green-50': '#f0fdf4',
      'purple-50': '#faf5ff',
      'amber-50': '#fffbeb',
      'red-50': '#fef2f2'
    };
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      styles.container.backgroundColor = bgColors[style.backgroundColor] || 'transparent';
      styles.container.padding = '12px';
      styles.container.marginLeft = '-12px';
      styles.container.marginRight = '-12px';
    }
    
    // Border color
    const borderColors = {
      'default': '#d1d5db',
      'blue': '#3b82f6',
      'indigo': '#6366f1',
      'purple': '#a855f7',
      'green': '#22c55e',
      'amber': '#f59e0b',
      'red': '#ef4444',
      'gray': '#9ca3af'
    };
    if (style.borderColor && style.borderColor !== 'default') {
      styles.input.borderColor = borderColors[style.borderColor];
      styles.input.borderWidth = style.borderWidth ? `${style.borderWidth}px` : '1px';
    }
    
    // Border radius
    const borderRadii = {
      'none': '0px',
      'sm': '4px',
      'md': '6px',
      'lg': '8px',
      'xl': '12px',
      'full': '9999px'
    };
    if (style.borderRadius) {
      styles.input.borderRadius = borderRadii[style.borderRadius] || '6px';
      if (style.backgroundColor && style.backgroundColor !== 'transparent') {
        styles.container.borderRadius = borderRadii[style.borderRadius] || '6px';
      }
    }
    
    return styles;
  };

  const fieldStyles = getFieldStyles();

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleFieldClick}
      className={`group relative bg-white rounded-lg border-2 p-4 transition-all ${getWidthClass()} ${getMarginClass()} ${
        isSelected 
          ? 'border-blue-500 shadow-md ring-2 ring-blue-200' 
          : isDragging
          ? 'border-blue-400 shadow-lg'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
    >
      {/* ENHANCED DRAG HANDLE - Always visible for better UX */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-30 group-hover:opacity-100 transition-all hover:scale-110"
        title="Drag to reorder"
      >
        <GripVertical className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
      </div>

      {/* Delete Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(field.id);
        }}
        title="Delete field"
        className="absolute right-2 top-2 p-1 text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* DRAG FEEDBACK: Show border indicator when being dragged */}
      {isDragging && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50 bg-opacity-50 pointer-events-none"></div>
      )}

      <div className="space-y-2 pl-6" style={fieldStyles.container}>
        {/* Field Label */}
        <Label 
          className={`text-sm font-medium flex items-center gap-2 ${getTextAlignClass()}`}
          style={fieldStyles.label.color ? { color: fieldStyles.label.color } : {}}
        >
          <FieldTypeIcon type={field.type} className="w-4 h-4 text-blue-600" />
          {field.label || 'Untitled Field'}
          {field.required && <span className="text-red-500">*</span>}
          {field.readOnly && <span className="text-xs text-gray-500 ml-2">(Read Only)</span>}
        </Label>

        {/* Field Preview - Display Text & Heading */}
        {(field.type === 'DisplayText' || field.type === 'Heading') ? (
          <div className={`${getFontSizeClass()} ${getFontWeightClass()} ${getTextColorClass()} ${getTextAlignClass()}`}>
            {field.defaultValue || field.label || 'Display text will appear here'}
          </div>
        ) : field.type === 'Section' ? (
          <div className="border-t-2 border-gray-300 pt-2">
            <p className="text-sm font-semibold text-gray-700">{field.label}</p>
          </div>
        ) : 
        /* Field Preview - Standard Input Types */
        (field.type === 'Text' || field.type === 'Email' || field.type === 'Phone' || field.type === 'Password' || 
        field.type === 'URL' || field.type === 'Name' || field.type === 'FullName' || field.type === 'Company') ? (
          <Input
            key={`${field.id}-${field.defaultValue || ''}`}
            type={field.type === 'Email' ? 'email' : field.type === 'Phone' ? 'tel' : field.type === 'Password' ? 'password' : field.type === 'URL' ? 'url' : 'text'}
            placeholder={field.helpText || `Enter ${field.label}`}
            defaultValue={field.defaultValue || ''}
            disabled
            className="bg-gray-50"
            style={Object.keys(fieldStyles.input).length > 0 ? fieldStyles.input : {}}
            readOnly={field.readOnly}
          />
        ) : field.type === 'Number' || field.type === 'Currency' || field.type === 'Percent' ? (
          <Input
            key={`${field.id}-${field.defaultValue || ''}`}
            type="number"
            placeholder={field.helpText || `Enter ${field.label}`}
            defaultValue={field.defaultValue || ''}
            disabled
            className="bg-gray-50"
            style={Object.keys(fieldStyles.input).length > 0 ? fieldStyles.input : {}}
            readOnly={field.readOnly}
          />
        ) : field.type === 'Date' || field.type === 'DateTime' ? (
          <Input
            key={`${field.id}-${field.defaultValue || ''}`}
            type={field.type === 'DateTime' ? 'datetime-local' : 'date'}
            defaultValue={field.defaultValue || ''}
            disabled
            className="bg-gray-50"
            style={Object.keys(fieldStyles.input).length > 0 ? fieldStyles.input : {}}
            readOnly={field.readOnly}
          />
        ) : field.type === 'Time' ? (
          <Input
            key={`${field.id}-${field.defaultValue || ''}`}
            type="time"
            defaultValue={field.defaultValue || ''}
            disabled
            className="bg-gray-50"
            style={Object.keys(fieldStyles.input).length > 0 ? fieldStyles.input : {}}
            readOnly={field.readOnly}
          />
        ) : field.type === 'Checkbox' || field.type === 'Toggle' ? (
          <div className="flex items-center gap-2">
            <input
              key={`${field.id}-${field.defaultValue || ''}`}
              type="checkbox"
              defaultChecked={field.defaultValue === 'true' || field.defaultValue === true}
              disabled
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">{field.helpText || field.label}</span>
          </div>
        ) : field.type === 'Radio' ? (
          <div className="space-y-2">
            {(field.options || ['Option 1', 'Option 2']).slice(0, 3).map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input type="radio" disabled className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-gray-600">{opt}</span>
              </div>
            ))}
          </div>
        ) : field.type === 'Dropdown' || field.type === 'MultiSelect' ? (
          <select disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm">
            <option>{field.helpText || `Select ${field.label}`}</option>
            {(field.options || []).map((opt, idx) => (
              <option key={idx}>{opt}</option>
            ))}
          </select>
        ) : field.type === 'Textarea' || field.type === 'RichText' || field.type === 'Address' ? (
          <Textarea
            key={`${field.id}-${field.defaultValue || ''}`}
            placeholder={field.helpText || `Enter ${field.label}`}
            defaultValue={field.defaultValue || ''}
            disabled
            rows={3}
            className="bg-gray-50"
            readOnly={field.readOnly}
          />
        ) : field.type === 'File' || field.type === 'Image' || field.type === 'Signature' ? (
          <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center bg-gray-50">
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
            <p className="text-xs text-gray-500">
              {field.type === 'Image' ? 'Upload Image' : field.type === 'Signature' ? 'Sign Here' : 'Upload File'}
            </p>
          </div>
        ) : field.type === 'Rating' ? (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
        ) : field.type === 'Slider' ? (
          <div className="py-2">
            <input type="range" disabled className="w-full" min="0" max="100" />
          </div>
        ) : field.type === 'Tag' ? (
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Tag 1</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Tag 2</span>
          </div>
        ) : field.type === 'Color' ? (
          <div className="flex items-center gap-2">
            <input type="color" disabled className="w-12 h-10 rounded border" />
            <span className="text-sm text-gray-600">#000000</span>
          </div>
        ) : field.type === 'Lookup' ? (
          <div className="relative">
            <Input
              type="text"
              placeholder={`Search ${field.label}...`}
              disabled
              className="bg-gray-50 pr-8"
            />
            <SearchIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        ) : field.type === 'DataTable' ? (
          <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
            {/* Data Table Placeholder */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-300 p-3">
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">Data Table</span>
                {field.tableMode === 'inlineEditable' && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                    Editable
                  </span>
                )}
              </div>
              {field.dataSource?.nodeId && (
                <p className="text-xs text-blue-700 mt-1">
                  Data Source: {field.dataSource.nodeId}
                </p>
              )}
            </div>
            <div className="p-3 space-y-2">
              {/* Column preview */}
              {field.columns && field.columns.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-600">Columns ({field.columns.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {field.columns.slice(0, 4).map((col, idx) => {
                      const isEditable = field.tableMode === 'inlineEditable' && 
                                        (field.editableColumns || []).includes(col.field);
                      return (
                        <span 
                          key={idx} 
                          className={`px-2 py-1 ${
                            isEditable ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          } text-xs rounded flex items-center gap-1`}
                        >
                          {col.label}
                          {isEditable && <span className="text-[10px]">✎</span>}
                        </span>
                      );
                    })}
                    {field.columns.length > 4 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        +{field.columns.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No columns configured</p>
              )}
              
              {/* Selection mode */}
              {field.selectionMode && field.selectionMode !== 'none' && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckSquare className="w-3 h-3" />
                  <span>Selection: {field.selectionMode === 'single' ? 'Single' : 'Multiple'}</span>
                </div>
              )}
              
              {/* Features */}
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                {field.pagination && <span>• Pagination</span>}
                {field.sorting && <span>• Sorting</span>}
                {field.search && <span>• Search</span>}
                {field.tableMode === 'inlineEditable' && (
                  <span className="text-green-600 font-medium">• Inline Editing</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Input
            type="text"
            placeholder={field.helpText || `Enter ${field.label}`}
            disabled
            className="bg-gray-50"
          />
        )}

        {/* Help Text */}
        {field.helpText && field.type !== 'Checkbox' && field.type !== 'Toggle' && (
          <p className="text-xs text-gray-500">{field.helpText}</p>
        )}

        {/* API Name Badge */}
        <div className="text-xs text-gray-400 font-mono">
          API: {field.name}
        </div>
      </div>
    </div>
  );
};

// Droppable column header indicator
const DroppableColumn = ({ columnId, label, onDropToColumn }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: columnId,
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        p-2 text-center text-xs font-medium rounded-md transition-colors
        ${isOver 
          ? 'bg-blue-100 border-2 border-blue-400 text-blue-700' 
          : 'bg-gray-100 border border-gray-200 text-gray-600'}
      `}
    >
      {label}
    </div>
  );
};

// Droppable empty slot for 2-column layout
const DroppableEmptySlot = ({ slotId, column, rowIndex, onDropToSlot, isAddNew = false }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
    data: {
      type: 'empty-slot',
      column,
      rowIndex
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        h-full min-h-[80px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer
        ${isOver 
          ? 'border-blue-400 bg-blue-50 scale-[1.02]' 
          : isAddNew 
            ? 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30'
            : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'}
      `}
      onClick={() => onDropToSlot?.(column, rowIndex)}
    >
      {isOver ? (
        <>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-1">
            <span className="text-blue-600 text-lg">+</span>
          </div>
          <span className="text-xs text-blue-600 font-medium">Drop here</span>
        </>
      ) : isAddNew ? (
        <>
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center mb-1">
            <span className="text-gray-500 text-sm">+</span>
          </div>
          <span className="text-xs text-gray-400">Add field</span>
        </>
      ) : (
        <span className="text-xs text-gray-400">Empty slot</span>
      )}
    </div>
  );
};

const ScreenCanvas = ({ 
  screenConfig, 
  previewMode, 
  selectedFieldId, 
  onScreenClick, 
  onFieldClick, 
  onFieldDelete,
  onToastClick,
  onToastDelete,
  onDropToSlot,
  onMoveToColumn
}) => {
  const { setNodeRef } = useDroppable({
    id: 'screen-canvas',
  });

  // Calculate canvas width based on preview mode
  // FIX: Debug logging to verify previewMode is received correctly
  console.log('[ScreenCanvas] previewMode:', previewMode);
  
  // Use specific width styles for each device mode
  // These widths simulate real device viewport widths
  const canvasWidthStyles = {
    desktop: { width: '100%', maxWidth: '1024px' },   // Desktop: Full width up to 1024px
    tablet: { width: '768px', maxWidth: '768px' },    // Tablet: iPad-like width
    mobile: { width: '375px', maxWidth: '375px' }     // Mobile: iPhone-like width
  };
  
  const canvasStyle = canvasWidthStyles[previewMode] || canvasWidthStyles.desktop;
  
  console.log('[ScreenCanvas] Calculated canvasStyle:', canvasStyle);

  // Compute theme styles
  const themeStyles = getThemeStyles(screenConfig.theme);
  console.log('[ScreenCanvas] Theme styles:', themeStyles);

  // MANDATORY: Center panel scrolling - MUST ALWAYS SCROLL
  const shouldScroll = true; // Always enable scrolling
  
  // FIX #2: Enable horizontal scroll for tablet view
  const scrollContainerStyle = {
    flex: 1,
    overflowY: 'auto',
    overflowX: previewMode === 'tablet' ? 'auto' : 'hidden',  // Enable horizontal scroll for tablet
    padding: '1.5rem',
    minWidth: previewMode === 'tablet' ? '768px' : 'auto',  // Minimum width for tablet to enable scroll
    ...themeStyles.pageBackground
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: themeStyles.pageBackground.backgroundColor || '#f9fafb' }}>
      {/* SCROLL CONTAINER - Enables horizontal scroll for tablet view */}
      <div style={scrollContainerStyle}>
        {/* FIX: Screen container - uses inline style for explicit width control */}
        <div 
          className="mx-auto transition-all duration-300 ease-in-out"
          style={canvasStyle}
        >
          <div
            ref={setNodeRef}
            onClick={(e) => {
              // Log for debugging
              console.log('[SCREEN CLICK] Event fired:', { 
                target: e.target.tagName, 
                targetClass: e.target.className,
                currentTarget: e.currentTarget.tagName
              });
              
              // SIMPLIFIED: Field cards and toast card use stopPropagation()
              // So if we reach here, it's a valid screen background click
              // (header, body padding, empty areas, footer, etc.)
              
              console.log('[SCREEN CLICK] Valid background click - calling onScreenClick');
              onScreenClick();
            }}
            className="overflow-hidden flex flex-col"
            style={{
              backgroundColor: themeStyles.contentCard.backgroundColor || '#ffffff',
              borderRadius: themeStyles.contentCard.borderRadius || '12px',
              boxShadow: themeStyles.contentCard.boxShadow || '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
          >
          {/* Screen Header */}
          {screenConfig.headerConfig?.show && (
            <div 
              className="px-6 py-4"
              style={themeStyles.header.background ? { background: themeStyles.header.background } : { backgroundColor: themeStyles.header.backgroundColor || '#2563eb', backgroundImage: 'linear-gradient(to right, #2563eb, #4f46e5)' }}
            >
              <h2 className="text-xl font-bold text-white">
                {screenConfig.headerConfig.title || screenConfig.screenTitle}
              </h2>
              {screenConfig.screenDescription && (
                <p className="text-blue-100 text-sm mt-1">{screenConfig.screenDescription}</p>
              )}
            </div>
          )}

          {/* Screen Body - Scrollable field list */}
          <div className={themeStyles.contentPadding}>
            {/* Toast Indicator - Always show if toast exists */}
            {screenConfig.toast && (
              <div 
                className={`mb-4 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedFieldId === 'toast_config'
                    ? 'bg-purple-50 border-purple-500 shadow-md'
                    : 'bg-purple-50 border-purple-300 hover:border-purple-400 hover:shadow-sm'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToastClick && onToastClick();
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 bg-purple-500 rounded flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-purple-900">Toast Component</h4>
                        <span className="px-2 py-0.5 bg-purple-200 text-purple-800 text-xs font-medium rounded">
                          {screenConfig.toast.displayMode === 'always' ? 'Always Show' : 'Conditional'}
                        </span>
                      </div>
                      <p className="text-xs text-purple-700 mt-1">
                        {screenConfig.toast.triggerTiming === 'onLoad' ? '🔵 Triggers on screen load' : '🔵 Triggers on next click'}
                      </p>
                      {screenConfig.toast.rules && screenConfig.toast.rules.length > 0 && (
                        <p className="text-xs text-purple-600 mt-1">
                          {screenConfig.toast.rules.length} rule{screenConfig.toast.rules.length > 1 ? 's' : ''} configured
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete Toast component? This will remove all configured rules.')) {
                        onToastDelete && onToastDelete();
                      }
                    }}
                    className="p-1.5 hover:bg-red-100 rounded transition-colors"
                    title="Delete Toast"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            )}
            
            {screenConfig.fields.length === 0 && !screenConfig.toast ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Type className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Components Yet
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Drag components from the left panel to build your screen
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Start by dragging a Text Input or other component</span>
                </div>
              </div>
            ) : (
              <SortableContext
                items={screenConfig.fields.map(f => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* REORDERING INSTRUCTIONS - Shown when fields exist */}
                {screenConfig.fields.length > 1 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                    <GripVertical className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Drag & Drop to Reorder</p>
                      <p className="text-xs text-blue-700">
                        {screenConfig.layout?.type === 'twoColumn'
                          ? 'Drag fields between columns or reorder within a column. Use field properties to change column placement.'
                          : 'Click and drag the grip icon (⋮⋮) on any field to change its position'}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* COLUMN LAYOUT RENDERING */}
                {screenConfig.layout?.type === 'twoColumn' ? (
                  // 2-COLUMN LAYOUT with droppable columns
                  <div className="space-y-4">
                    {/* Column drop zone indicators */}
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <DroppableColumn 
                        columnId="col-1" 
                        label="Left Column" 
                        onDropToColumn={(fieldId) => onMoveToColumn?.(fieldId, 1)}
                      />
                      <DroppableColumn 
                        columnId="col-2" 
                        label="Right Column"
                        onDropToColumn={(fieldId) => onMoveToColumn?.(fieldId, 2)}
                      />
                    </div>
                    
                    {/* Fields rendering logic for 2 columns */}
                    {(() => {
                      // Separate full-width and column-specific fields
                      const col1Fields = screenConfig.fields.filter(f => f.layout?.span !== 'full' && (f.layout?.col === 1 || !f.layout?.col));
                      const col2Fields = screenConfig.fields.filter(f => f.layout?.span !== 'full' && f.layout?.col === 2);
                      const fullWidthFields = screenConfig.fields.filter(f => f.layout?.span === 'full');
                      
                      // Build rows - pair fields from both columns
                      const rows = [];
                      const maxRows = Math.max(col1Fields.length, col2Fields.length);
                      
                      for (let i = 0; i < maxRows; i++) {
                        rows.push({
                          type: 'pair',
                          left: col1Fields[i] || null,
                          right: col2Fields[i] || null,
                          rowIndex: i
                        });
                      }
                      
                      // Add full-width fields at the end
                      fullWidthFields.forEach((field, idx) => {
                        rows.push({
                          type: 'full',
                          field: field,
                          rowIndex: maxRows + idx
                        });
                      });
                      
                      // If no rows, show empty state with both columns droppable
                      if (rows.length === 0) {
                        return (
                          <div className="grid grid-cols-2 gap-4">
                            <DroppableEmptySlot 
                              slotId="empty-col-1-row-0"
                              column={1}
                              rowIndex={0}
                              onDropToSlot={onDropToSlot}
                            />
                            <DroppableEmptySlot 
                              slotId="empty-col-2-row-0"
                              column={2}
                              rowIndex={0}
                              onDropToSlot={onDropToSlot}
                            />
                          </div>
                        );
                      }
                      
                      return (
                        <>
                          {rows.map((row, rowIdx) => {
                            if (row.type === 'full') {
                              return (
                                <div key={`row-${rowIdx}`} className="w-full">
                                  <SortableField
                                    field={row.field}
                                    isSelected={selectedFieldId === row.field.id}
                                    onClick={onFieldClick}
                                    onDelete={onFieldDelete}
                                  />
                                </div>
                              );
                            } else {
                              return (
                                <div key={`row-${rowIdx}`} className="grid grid-cols-2 gap-4">
                                  <div className="min-h-[80px]">
                                    {row.left ? (
                                      <SortableField
                                        field={row.left}
                                        isSelected={selectedFieldId === row.left.id}
                                        onClick={onFieldClick}
                                        onDelete={onFieldDelete}
                                      />
                                    ) : (
                                      <DroppableEmptySlot 
                                        slotId={`empty-col-1-row-${rowIdx}`}
                                        column={1}
                                        rowIndex={rowIdx}
                                        onDropToSlot={onDropToSlot}
                                      />
                                    )}
                                  </div>
                                  <div className="min-h-[80px]">
                                    {row.right ? (
                                      <SortableField
                                        field={row.right}
                                        isSelected={selectedFieldId === row.right.id}
                                        onClick={onFieldClick}
                                        onDelete={onFieldDelete}
                                      />
                                    ) : (
                                      <DroppableEmptySlot 
                                        slotId={`empty-col-2-row-${rowIdx}`}
                                        column={2}
                                        rowIndex={rowIdx}
                                        onDropToSlot={onDropToSlot}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            }
                          })}
                          {/* Add extra row for new items */}
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <DroppableEmptySlot 
                              slotId={`empty-col-1-row-${rows.length}`}
                              column={1}
                              rowIndex={rows.length}
                              onDropToSlot={onDropToSlot}
                              isAddNew={true}
                            />
                            <DroppableEmptySlot 
                              slotId={`empty-col-2-row-${rows.length}`}
                              column={2}
                              rowIndex={rows.length}
                              onDropToSlot={onDropToSlot}
                              isAddNew={true}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  // 1-COLUMN LAYOUT (Default)
                  <div className="space-y-4">
                    {screenConfig.fields.map((field) => (
                      <SortableField
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onClick={onFieldClick}
                        onDelete={onFieldDelete}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>
            )}
          </div>

          {/* Screen Footer */}
          <div className="bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
            <div>
              {screenConfig.footerConfig?.showPrevious && (
                <button
                  disabled
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {screenConfig.footerConfig?.showNext && (
                <button
                  disabled
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={themeStyles.button.backgroundColor ? { backgroundColor: themeStyles.button.backgroundColor } : { backgroundColor: '#2563eb' }}
                >
                  Next
                </button>
              )}
              {screenConfig.footerConfig?.showFinish && (
                <button
                  disabled
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Finish
                </button>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Screen Info */}
        <div className="mt-4 text-center text-xs text-gray-500">
          Click on screen background to edit screen properties • Click on field to edit field properties
        </div>
      </div>
    </div>
  );
};

export default ScreenCanvas;
