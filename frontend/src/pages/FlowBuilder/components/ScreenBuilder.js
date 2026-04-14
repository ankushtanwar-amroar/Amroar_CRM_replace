import React, { useState, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Monitor, Eye, Smartphone, Tablet, Save, X, GripVertical } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';
import ComponentPalette from './ScreenBuilder/ComponentPalette';
import ScreenCanvas from './ScreenBuilder/ScreenCanvas';
import PropertiesPanel from './ScreenBuilder/PropertiesPanel';

const ScreenBuilder = ({ node, onUpdate, onClose, nodes = [] }) => {
  const [screenConfig, setScreenConfig] = useState({
    screenTitle: 'New Screen',
    screenApiName: 'New_Screen',
    screenDescription: '',
    headerConfig: {
      show: true,
      title: ''
    },
    footerConfig: {
      showPrevious: false,
      showNext: true,
      showFinish: false
    },
    // COLUMN LAYOUT CONFIGURATION - Default to 1 column for backward compatibility
    layout: {
      type: 'oneColumn',  // 'oneColumn' | 'twoColumn'
      columns: 1          // 1 | 2
    },
    fields: [],
    // CRITICAL: Toast stored separately (not in fields array)
    toast: null  // Will contain toast configuration with rules
  });
  
  // Debug: Log screenConfig changes
  useEffect(() => {
    const fieldCount = screenConfig.fields.length;
    const hasToast = !!screenConfig.toast;
    console.log('[SCREEN CONFIG STATE CHANGED]', {
      timestamp: new Date().toISOString(),
      totalFields: fieldCount,
      hasToast,
      screenTitle: screenConfig.screenTitle
    });
    
    if (hasToast) {
      console.log('[SCREEN CONFIG STATE] ✅ Toast configuration exists:', {
        triggerTiming: screenConfig.toast.triggerTiming,
        ruleCount: screenConfig.toast.rules?.length || 0
      });
    } else {
      console.log('[SCREEN CONFIG STATE] ⚠️ NO Toast configuration');
    }
  }, [screenConfig]);
  
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [selectedScreen, setSelectedScreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // CRITICAL: Track save state
  
  // Debug: Log selection changes
  useEffect(() => {
    console.log('[SELECTED COMPONENT] selectedFieldId:', selectedFieldId, ', selectedScreen:', selectedScreen);
    if (selectedFieldId) {
      const field = screenConfig.fields.find(f => f.id === selectedFieldId);
      console.log('[SELECTED COMPONENT] Field found:', field ? {id: field.id, type: field.type} : 'NOT FOUND');
    }
  }, [selectedFieldId, selectedScreen]);
  
  const [activeId, setActiveId] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop'); // desktop, tablet, mobile
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load existing screen configuration from node
  useEffect(() => {
    console.log('[SCREEN BUILDER LOAD] useEffect triggered');
    console.log('[SCREEN BUILDER LOAD] node object:', node);
    console.log('[SCREEN BUILDER LOAD] node.data:', node?.data);
    console.log('[SCREEN BUILDER LOAD] node.data.config:', node?.data?.config);
    
    if (node?.data?.config) {
      const config = node.data.config;
      
      console.log('📂 ===== LOAD SCREEN DEBUG =====');
      console.log('📂 Timestamp:', new Date().toISOString());
      console.log('📂 Node ID:', node.id);
      console.log('📂 Node Type:', node.type);
      console.log('📂 Screen Title:', config.screenTitle || config.title);
      console.log('📂 Screen API Name:', config.screenApiName);
      console.log('📂 Has Toast Config:', !!config.toast);
      
      console.log('📂 Setting screenConfig state with loaded data...');
      
      // MIGRATION: Move old Toast from fields to toast config
      const fieldsArray = config.fields || [];
      const oldToastInFields = fieldsArray.filter(f => f.type === 'Toast');
      const regularFields = fieldsArray.filter(f => f.type !== 'Toast');
      
      console.log('📂 Field components:', regularFields.length);
      console.log('📂 Old toast in fields (to migrate):', oldToastInFields.length);
      
      let toastConfig = config.toast || null;
      
      // If old toast exists in fields, migrate it
      if (oldToastInFields.length > 0 && !toastConfig) {
        console.log('📂 🔄 MIGRATION: Found old Toast in fields, migrating to new structure');
        const oldToast = oldToastInFields[0]; // Take first one only
        
        toastConfig = {
          id: oldToast.id || `toast_${Date.now()}`,
          triggerTiming: oldToast.triggerTiming || 'onLoad',
          displayMode: oldToast.displayCondition?.enabled ? 'conditional' : 'always',
          rules: [
            {
              id: `rule_${Date.now()}`,
              name: 'Migrated Rule',
              condition: oldToast.displayCondition?.formula || '',
              type: oldToast.variant || 'info',
              title: oldToast.title || '',
              message: oldToast.message || 'Notification',
              position: oldToast.position || 'top-right',
              duration: oldToast.duration || 3000,
              dismissible: oldToast.closeable !== false,
              stopFlow: false
            }
          ],
          defaultRule: null
        };
        console.log('📂 ✅ Toast migrated to new structure:', toastConfig);
      }
      
      const newScreenConfig = {
        screenTitle: config.screenTitle || config.title || 'New Screen',
        screenApiName: config.screenApiName || 'New_Screen',
        screenDescription: config.screenDescription || config.description || '',
        headerConfig: config.headerConfig || {
          show: true,
          title: ''
        },
        footerConfig: config.footerConfig || {
          showPrevious: false,
          showNext: true,
          showFinish: false
        },
        // COLUMN LAYOUT - Load from saved config or default to 1 column
        layout: config.layout || {
          type: 'oneColumn',
          columns: 1
        },
        fields: regularFields, // Only regular fields, no Toast
        toast: toastConfig // Toast stored separately
      };
      
      console.log('📂 New screenConfig being set:', newScreenConfig);
      console.log('📂 New screenConfig.fields length:', newScreenConfig.fields.length);
      console.log('📂 New screenConfig.fields with Toast:', newScreenConfig.fields.filter(f => f.type === 'Toast').length);
      
      setScreenConfig(newScreenConfig);
      
      console.log('📂 screenConfig state updated');
      console.log('📂 ===== END LOAD DEBUG =====');
    } else {
      console.warn('📂 ⚠️ No node.data.config found - node:', node);
      console.warn('📂 ⚠️ Initializing empty screen');
    }
  }, [node]);

  // Handle drag start
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  // Handle drag end - add new component or reorder existing
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    setActiveId(null);
    
    if (!over) return;
    
    console.log('[DRAG END] Active:', active.id, 'Over:', over.id);
    
    // FIX: Handle dropping directly on the screen canvas
    if (over.id === 'screen-canvas') {
      console.log('[DRAG END] Dropping on screen canvas');
      if (active.id.startsWith('palette-')) {
        const componentType = active.id.replace('palette-', '');
        addNewComponent(componentType, null); // Add to end of list
        return;
      }
    }
    
    // Check if dropping on an empty column slot
    if (over.id.startsWith('empty-col-')) {
      // Parse column and row from slot ID (format: empty-col-X-row-Y)
      const parts = over.id.split('-');
      const targetCol = parseInt(parts[2]);
      const targetRow = parseInt(parts[4]);
      
      console.log('[DRAG END] Dropping to empty slot - Column:', targetCol, 'Row:', targetRow);
      
      // Set target column for new components
      setTargetColumn(targetCol);
      
      // If dragging from palette, add new component to this column
      if (active.id.startsWith('palette-')) {
        const componentType = active.id.replace('palette-', '');
        addNewComponentToColumn(componentType, targetCol);
        return;
      }
      
      // If dragging existing field, move it to this column
      const fieldToMove = screenConfig.fields.find(f => f.id === active.id);
      if (fieldToMove) {
        handleMoveToColumn(active.id, targetCol);
        return;
      }
    }
    
    // Check if dropping on column header
    if (over.id === 'col-1' || over.id === 'col-2') {
      const targetCol = over.id === 'col-1' ? 1 : 2;
      console.log('[DRAG END] Dropping to column header:', targetCol);
      
      setTargetColumn(targetCol);
      
      if (active.id.startsWith('palette-')) {
        const componentType = active.id.replace('palette-', '');
        addNewComponentToColumn(componentType, targetCol);
        return;
      }
      
      // Move existing field to column
      const fieldToMove = screenConfig.fields.find(f => f.id === active.id);
      if (fieldToMove) {
        handleMoveToColumn(active.id, targetCol);
        return;
      }
    }
    
    // Check if dragging from palette (new component)
    if (active.id.startsWith('palette-')) {
      const componentType = active.id.replace('palette-', '');
      // If over.id is a field, add after it; otherwise add to end
      const targetField = screenConfig.fields.find(f => f.id === over.id);
      addNewComponent(componentType, targetField ? over.id : null);
    } else {
      // Reordering existing components
      const oldIndex = screenConfig.fields.findIndex(f => f.id === active.id);
      const newIndex = screenConfig.fields.findIndex(f => f.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedFields = arrayMove(screenConfig.fields, oldIndex, newIndex);
        setScreenConfig(prev => ({
          ...prev,
          fields: reorderedFields
        }));
      }
    }
  };
  
  // Add new component to a specific column
  const addNewComponentToColumn = (componentType, targetCol) => {
    console.log('[ADD TO COLUMN] Adding', componentType, 'to column', targetCol);
    
    // Special handling for Toast component
    if (componentType === 'Toast') {
      // CRITICAL: Check if toast already exists
      if (screenConfig.toast) {
        toast.error('Only one Toast allowed per screen', {
          description: 'Delete the existing Toast first if you want to add a new one.'
        });
        return;
      }
      
      const newToast = {
        id: `toast_${Date.now()}`,
        triggerTiming: 'onLoad',
        displayMode: 'conditional',
        rules: [{
          id: `rule_${Date.now()}`,
          name: 'Default Rule',
          condition: '',
          type: 'info',
          title: 'Notification',
          message: 'This is a notification message',
          position: 'top-right',
          duration: 3000,
          dismissible: true,
          stopFlow: false
        }],
        defaultRule: null
      };
      
      setScreenConfig(prev => ({ ...prev, toast: newToast }));
      setSelectedFieldId('toast_config');
      setSelectedScreen(false);
      toast.success('Toast added to screen');
      return;
    }
    
    const newField = {
      id: `field_${Date.now()}`,
      name: generateApiName(componentType),
      label: generateLabel(componentType),
      type: componentType,
      required: false,
      defaultValue: '',
      helpText: '',
      description: '',
      visible: true,
      readOnly: false,
      width: 'full',
      alignment: 'left',
      marginTop: 'normal',
      marginBottom: 'normal',
      layout: {
        col: targetCol,
        order: screenConfig.fields.length,
        span: (componentType === 'Section' || componentType === 'Heading' || componentType === 'DisplayText' || componentType === 'DataTable') ? 'full' : 'single'
      },
      options: (componentType === 'Dropdown' || componentType === 'MultiSelect' || componentType === 'Radio') 
        ? ['Option 1', 'Option 2', 'Option 3'] 
        : []
    };
    
    setScreenConfig(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
    
    setSelectedFieldId(newField.id);
    setSelectedScreen(false);
    toast.success(`${componentType} added to ${targetCol === 1 ? 'left' : 'right'} column`);
  };

  // Add new component to screen
  const addNewComponent = (componentType, afterFieldId) => {
    // Special handling for Toast component
    if (componentType === 'Toast') {
      // CRITICAL: Check if toast already exists
      if (screenConfig.toast) {
        toast.error('Only one Toast allowed per screen', {
          description: 'Delete the existing Toast first if you want to add a new one.'
        });
        console.warn('[ADD COMPONENT] Blocked: Toast already exists');
        return;
      }
      
      // Create new Toast configuration with default rule
      const newToast = {
        id: `toast_${Date.now()}`,
        triggerTiming: 'onLoad', // 'onLoad' or 'onNextClick'
        displayMode: 'conditional', // 'always' or 'conditional'
        rules: [
          {
            id: `rule_${Date.now()}`,
            name: 'Default Rule',
            condition: '', // Empty = always true for first rule
            type: 'info', // 'info', 'success', 'warning', 'error'
            title: 'Notification',
            message: 'This is a notification message',
            position: 'top-right',
            duration: 3000,
            dismissible: true,
            stopFlow: false
          }
        ],
        defaultRule: null // Optional fallback
      };
      
      console.log('[ADD COMPONENT] Adding Toast with configuration:', newToast);
      
      // Set toast in separate config field
      setScreenConfig(prev => ({
        ...prev,
        toast: newToast
      }));
      
      // Auto-select the Toast for editing
      setSelectedFieldId('toast_config');
      setSelectedScreen(false);
      
      toast.success('Toast component added', {
        description: 'Configure conditional rules in the properties panel'
      });
      return;
    }
    
    // Regular field component
    const newField = {
      id: `field_${Date.now()}`,
      name: generateApiName(componentType),
      label: generateLabel(componentType),
      type: componentType,
      required: false,
      defaultValue: '',
      helpText: '',
      description: '',
      visible: true,
      readOnly: false,
      width: 'full',
      alignment: 'left',
      marginTop: 'normal',
      marginBottom: 'normal',
      // COLUMN LAYOUT: Use targetColumn for 2-column mode, default to 1 for 1-column mode
      layout: {
        col: screenConfig.layout?.type === 'twoColumn' ? targetColumn : 1,
        order: screenConfig.fields.length,
        span: (componentType === 'Section' || componentType === 'Heading' || componentType === 'DisplayText' || componentType === 'DataTable') ? 'full' : 'single'
      },
      // Add default options for dropdown/multiselect/radio
      options: (componentType === 'Dropdown' || componentType === 'MultiSelect' || componentType === 'Radio') 
        ? ['Option 1', 'Option 2', 'Option 3'] 
        : []
    };
    
    // Insert after the target field, or at the end
    if (afterFieldId) {
      const targetIndex = screenConfig.fields.findIndex(f => f.id === afterFieldId);
      if (targetIndex !== -1) {
        const updatedFields = [...screenConfig.fields];
        updatedFields.splice(targetIndex + 1, 0, newField);
        setScreenConfig(prev => ({ ...prev, fields: updatedFields }));
      } else {
        setScreenConfig(prev => ({
          ...prev,
          fields: [...prev.fields, newField]
        }));
      }
    } else {
      setScreenConfig(prev => ({
        ...prev,
        fields: [...prev.fields, newField]
      }));
    }
    
    // Auto-select the new field
    setSelectedFieldId(newField.id);
    setSelectedScreen(false);
    
    toast.success(`${componentType} added to screen`);
  };

  // Generate API name from component type
  const generateApiName = (type) => {
    const existingNames = screenConfig.fields.map(f => f.name);
    let baseName = type.replace(/\s+/g, '_');
    let counter = 1;
    let apiName = baseName;
    
    while (existingNames.includes(apiName)) {
      apiName = `${baseName}_${counter}`;
      counter++;
    }
    
    return apiName;
  };

  // Generate label from component type
  const generateLabel = (type) => {
    const labels = {
      Text: 'Text', Number: 'Number', Email: 'Email', Phone: 'Phone',
      Date: 'Date', DateTime: 'Date Time', Time: 'Time', Checkbox: 'Checkbox',
      Toggle: 'Toggle', Radio: 'Radio Group', Dropdown: 'Picklist',
      MultiSelect: 'Multi-Select Picklist', Textarea: 'Long Text Area',
      RichText: 'Rich Text Area', Password: 'Password', Currency: 'Currency',
      Percent: 'Percent', URL: 'URL', Lookup: 'Lookup', File: 'File Upload',
      Image: 'Image Upload', Signature: 'Signature', Address: 'Address',
      Location: 'Geolocation', Rating: 'Rating', Slider: 'Slider',
      Name: 'Name', FullName: 'Full Name', Company: 'Company',
      CreditCard: 'Credit Card', SSN: 'SSN', Country: 'Country',
      State: 'State/Province', Tag: 'Tags', Color: 'Color Picker',
      Formula: 'Formula', DisplayText: 'Display Text', Section: 'Section',
      Heading: 'Rich Text', Toast: 'Toast Notification'
    };
    return labels[type] || type;
  };

  // Update screen properties
  const updateScreenProperty = (key, value) => {
    setScreenConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Update field properties
  const updateFieldProperty = (fieldId, key, value) => {
    setScreenConfig(prev => ({
      ...prev,
      fields: prev.fields.map(f =>
        f.id === fieldId ? { ...f, [key]: value } : f
      )
    }));
  };

  // Delete field
  const deleteField = (fieldId) => {
    setScreenConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId)
    }));
    
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
      setSelectedScreen(true);
    }
    
    toast.success('Field removed from screen');
  };

  // Handle dropping a component to a specific column slot
  const handleDropToSlot = (column, rowIndex) => {
    console.log('[DROP TO SLOT] Column:', column, 'Row:', rowIndex);
    // This will be used when dragging new components from the palette
    // For now, we just need to set the target column for the next component added
    setTargetColumn(column);
  };
  
  // State for target column when adding new components in 2-column mode
  const [targetColumn, setTargetColumn] = useState(1);

  // Handle moving a field to a different column
  const handleMoveToColumn = (fieldId, targetCol) => {
    console.log('[MOVE TO COLUMN] Moving field', fieldId, 'to column', targetCol);
    setScreenConfig(prev => ({
      ...prev,
      fields: prev.fields.map(field => {
        if (field.id === fieldId) {
          return {
            ...field,
            layout: {
              ...field.layout,
              col: targetCol
            }
          };
        }
        return field;
      })
    }));
    toast.success(`Field moved to ${targetCol === 1 ? 'left' : 'right'} column`);
  };

  // Save screen configuration
  const handleSave = async (e) => {
    // CRITICAL: Prevent default form submission if inside a form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('[SAVE SCREEN] ===== BUTTON CLICKED =====');
    console.log('[SAVE SCREEN] Timestamp:', new Date().toISOString());
    console.log('[SAVE SCREEN] Starting save process...');
    
    // CRITICAL: Set loading state IMMEDIATELY
    setIsSaving(true);
    console.log('[SAVE SCREEN] isSaving set to TRUE');
    
    // CRITICAL: Add timeout protection - reset after 10 seconds max
    const timeoutId = setTimeout(() => {
      console.error('[SAVE SCREEN] ⏰ TIMEOUT - Resetting loading state after 10s');
      setIsSaving(false);
      toast.error('⏰ Save timed out. Please try again.');
    }, 10000);
    
    try {
      // Validate required fields
      if (!screenConfig.screenTitle || screenConfig.screenTitle.trim() === '') {
        console.error('[SAVE SCREEN] Validation failed: Screen title is required');
        toast.error('Screen title is required');
        throw new Error('Screen title is required');
      }
      
      if (!screenConfig.screenApiName || screenConfig.screenApiName.trim() === '') {
        console.error('[SAVE SCREEN] Validation failed: Screen API name is required');
        toast.error('Screen API name is required');
        throw new Error('Screen API name is required');
      }
      
      // Validate all fields have required properties
      for (const field of screenConfig.fields) {
        // Skip validation for Toast components (they use title instead of label)
        if (field.type === 'Toast') {
          // Toast only needs a message
          if (!field.message || field.message.trim() === '') {
            console.error('[SAVE SCREEN] Validation failed: Toast requires message');
            toast.error(`Toast component requires a message`);
            throw new Error('Toast component requires a message');
          }
          continue; // Skip label/name validation for Toast
        }
        
        if (!field.label || field.label.trim() === '') {
          console.error('[SAVE SCREEN] Validation failed: Field label required');
          toast.error(`Field label is required for all components`);
          throw new Error('Field label is required for all components');
        }
        
        if (!field.name || field.name.trim() === '') {
          console.error('[SAVE SCREEN] Validation failed: Field API name required');
          toast.error(`Field API name is required for all components`);
          throw new Error('Field API name is required for all components');
        }
      }
      
      // Check for duplicate API names (exclude Toast components)
      const apiNames = screenConfig.fields
        .filter(f => f.type !== 'Toast') // Toast doesn't need unique API names
        .map(f => f.name);
      const duplicates = apiNames.filter((name, index) => apiNames.indexOf(name) !== index);
      if (duplicates.length > 0) {
        console.error('[SAVE SCREEN] Validation failed: Duplicate API names:', duplicates);
        toast.error(`Duplicate API names found: ${duplicates.join(', ')}`);
        throw new Error(`Duplicate API names found: ${duplicates.join(', ')}`);
      }
      
      console.log('[SAVE SCREEN] ✅ All validations passed');
      
      // CRITICAL DEBUG: Log save payload structure
      const fieldsCount = screenConfig.fields.length;
      const hasToast = !!screenConfig.toast;
      
      console.log('[SAVE SCREEN] ===== SAVE PAYLOAD DEBUG =====');
      console.log('[SAVE SCREEN] Screen Title:', screenConfig.screenTitle);
      console.log('[SAVE SCREEN] Screen API Name:', screenConfig.screenApiName);
      console.log('[SAVE SCREEN] Field components:', fieldsCount);
      console.log('[SAVE SCREEN] Has Toast:', hasToast);
      if (hasToast) {
        console.log('[SAVE SCREEN] Toast config:', {
          triggerTiming: screenConfig.toast.triggerTiming,
          displayMode: screenConfig.toast.displayMode,
          ruleCount: screenConfig.toast.rules?.length || 0
        });
      }
      
      // CRITICAL: Test JSON serialization before sending
      try {
        const jsonTest = JSON.stringify(screenConfig);
        console.log('[SAVE SCREEN] ✅ Config is JSON-serializable, size:', jsonTest.length, 'bytes');
      } catch (jsonError) {
        console.error('[SAVE SCREEN] ❌ Config contains non-serializable data:', jsonError);
        toast.error('Configuration contains invalid data and cannot be saved');
        throw new Error('Configuration contains non-serializable data');
      }
      
      console.log('[SAVE SCREEN] Full screenConfig:', screenConfig);
      
      console.log('[SAVE SCREEN] Calling onUpdate with screenConfig...');
      console.log('[SAVE SCREEN] onUpdate is a', typeof onUpdate, 'function');
      
      // Call onUpdate with the complete screen configuration
      try {
        const result = onUpdate(screenConfig);
        console.log('[SAVE SCREEN] onUpdate returned:', result);
        console.log('[SAVE SCREEN] ✅ onUpdate called successfully');
      } catch (updateError) {
        console.error('[SAVE SCREEN] ❌ onUpdate FAILED:', updateError);
        console.error('[SAVE SCREEN] Error details:', {
          message: updateError.message,
          stack: updateError.stack,
          name: updateError.name
        });
        throw updateError;
      }
      
      console.log('[SAVE SCREEN] ===== SAVE COMPLETE =====');
      
      // CRITICAL: Clear timeout since we succeeded
      clearTimeout(timeoutId);
      
      // CRITICAL: Show success feedback
      toast.success('✅ Screen configuration saved! Click the main "Save" button to persist changes.', {
        duration: 5000
      });
      
      console.log('[SAVE SCREEN] 🎉 SUCCESS - Config updated in node state');
      
    } catch (error) {
      console.error('[SAVE SCREEN] ❌ ERROR during save:', error);
      console.error('[SAVE SCREEN] Error message:', error.message);
      console.error('[SAVE SCREEN] Error stack:', error.stack);
      console.error('[SAVE SCREEN] Error name:', error.name);
      
      // CRITICAL: Clear timeout on error
      clearTimeout(timeoutId);
      
      // Check if it's a validation error (already shown toast)
      const isValidationError = error.message && (
        error.message.includes('required') ||
        error.message.includes('Duplicate')
      );
      
      if (!isValidationError) {
        // CRITICAL: Show error feedback for non-validation errors
        toast.error(`❌ Failed to save screen: ${error.message}`);
        
        // CRITICAL: Alert user for maximum visibility
        alert(`SAVE SCREEN FAILED!\n\nError: ${error.message}\n\nCheck browser console for details.`);
      }
      
    } finally {
      // CRITICAL: ALWAYS reset loading state in finally block
      console.log('[SAVE SCREEN] Finally block: Resetting loading state...');
      setIsSaving(false);
      console.log('[SAVE SCREEN] isSaving set to FALSE (finally block)');
      
      // CRITICAL: Force re-render if stuck
      setTimeout(() => {
        console.log('[SAVE SCREEN] Backup: Ensuring isSaving is false after 100ms');
        setIsSaving(false);
      }, 100);
    }
  };

  // Select screen (background)
  const handleScreenClick = () => {
    console.log('[SCREEN BUILDER] Screen background clicked - setting selectedScreen=true');
    setSelectedFieldId(null); // Clear any field/toast selection
    setSelectedScreen(true);
  };

  // Select field
  const handleFieldClick = (fieldId) => {
    console.log('[SCREEN BUILDER] Field/Toast clicked, ID:', fieldId);
    console.log('[SCREEN BUILDER] Setting selectedFieldId to:', fieldId, ', selectedScreen=false');
    setSelectedFieldId(fieldId);
    setSelectedScreen(false);
  };

  const selectedField = screenConfig.fields.find(f => f.id === selectedFieldId);
  console.log('[SCREEN BUILDER RENDER] selectedScreen:', selectedScreen, ', selectedFieldId:', selectedFieldId, ', selectedField:', selectedField ? {id: selectedField.id, type: selectedField.type} : null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header - FIXED (never scrolls) */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Screen Builder</h2>
            <p className="text-xs text-gray-500">{screenConfig.screenTitle}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Preview Mode Selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                console.log('[ScreenBuilder] Desktop button clicked');
                setPreviewMode('desktop');
              }}
              className={`p-2 rounded ${previewMode === 'desktop' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
              title="Desktop View"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                console.log('[ScreenBuilder] Tablet button clicked');
                setPreviewMode('tablet');
              }}
              className={`p-2 rounded ${previewMode === 'tablet' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
              title="Tablet View"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                console.log('[ScreenBuilder] Mobile button clicked');
                setPreviewMode('mobile');
              }}
              className={`p-2 rounded ${previewMode === 'mobile' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
              title="Mobile View"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
          
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            Save Screen
          </Button>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Main Content - 3 Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Left Panel - Component Palette */}
          <ComponentPalette hasToast={!!screenConfig.toast} />

          {/* Center Panel - Screen Canvas with Horizontal Scroll for Tablet */}
          <div 
            className="flex-1 flex flex-col"
            style={{ 
              overflow: previewMode === 'tablet' ? 'auto' : 'hidden',
              minWidth: previewMode === 'tablet' ? '800px' : 'auto'
            }}
          >
            <ScreenCanvas
              screenConfig={screenConfig}
              previewMode={previewMode}
              selectedFieldId={selectedFieldId}
              onScreenClick={handleScreenClick}
              onFieldClick={handleFieldClick}
              onFieldDelete={deleteField}
              onToastClick={() => {
                setSelectedFieldId('toast_config');
                setSelectedScreen(false);
              }}
              onToastDelete={() => {
                setScreenConfig(prev => ({ ...prev, toast: null }));
                setSelectedFieldId(null);
                setSelectedScreen(false);
                toast.success('Toast component deleted');
              }}
              onDropToSlot={handleDropToSlot}
              onMoveToColumn={handleMoveToColumn}
            />
          </div>

          {/* Right Panel - Properties */}
          <PropertiesPanel
            selectedScreen={selectedScreen}
            selectedField={selectedField}
            screenConfig={screenConfig}
            onScreenPropertyUpdate={updateScreenProperty}
            onFieldPropertyUpdate={updateFieldProperty}
            allFields={screenConfig.fields}
            toastConfig={selectedFieldId === 'toast_config' ? screenConfig.toast : null}
            onToastConfigUpdate={(updatedToast) => {
              setScreenConfig(prev => ({ ...prev, toast: updatedToast }));
            }}
            nodes={nodes}
          />

          {/* ENHANCED Drag Overlay - Better visual feedback while dragging */}
          <DragOverlay>
            {activeId ? (
              <div className="bg-white rounded-lg shadow-2xl border-2 border-blue-500 p-4 min-w-[300px]">
                <div className="flex items-center gap-3">
                  <GripVertical className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {activeId.startsWith('palette-') 
                        ? activeId.replace('palette-', '').replace(/([A-Z])/g, ' $1').trim()
                        : screenConfig.fields.find(f => f.id === activeId)?.label || 'Field'
                      }
                    </div>
                    <div className="text-xs text-gray-500">
                      {activeId.startsWith('palette-') 
                        ? 'Drop to add to screen'
                        : 'Drop to reposition'
                      }
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Bottom Controls */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {screenConfig.fields.length} component{screenConfig.fields.length !== 1 ? 's' : ''} on screen
          {screenConfig.fields.filter(f => f.type === 'Toast').length > 0 && (
            <span className="ml-2 text-blue-600 font-semibold">
              (includes {screenConfig.fields.filter(f => f.type === 'Toast').length} Toast{screenConfig.fields.filter(f => f.type === 'Toast').length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Screen'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScreenBuilder;
