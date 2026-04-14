
/**
 * Professional Form Builder - Similar to Zoho/HubSpot
 * Features: Multi-step forms, AI Assistant, Voice Commands, Enhanced drag-drop with @dnd-kit
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Save, Eye, ArrowLeft, Share2, Settings as SettingsIcon,
  GripVertical, ChevronRight, ChevronLeft, X, List, Layers, Grid3x3,
  Sparkles, Mic, MicOff, Send
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast, { Toaster } from 'react-hot-toast';
import * as FormService from '../services/formBuilderService';
import { v4 as uuidv4 } from 'uuid';

// Field Type Categories
const FIELD_CATEGORIES = {
  basic: [
    { value: 'text', label: 'Text Input', icon: '📝', category: 'basic' },
    { value: 'email', label: 'Email', icon: '📧', category: 'basic' },
    { value: 'phone', label: 'Phone', icon: '📱', category: 'basic' },
    { value: 'number', label: 'Number', icon: '🔢', category: 'basic' },
    { value: 'textarea', label: 'Text Area', icon: '📄', category: 'basic' },
    { value: 'date', label: 'Date', icon: '📅', category: 'basic' },
  ],
  advanced: [
    { value: 'select', label: 'Dropdown', icon: '▼', category: 'advanced' },
    { value: 'multiselect', label: 'Multi-Select', icon: '☑️', category: 'advanced' },
    { value: 'checkbox', label: 'Checkboxes', icon: '✓', category: 'advanced' },
    { value: 'radio', label: 'Radio', icon: '⚪', category: 'advanced' },
    { value: 'rating', label: 'Rating', icon: '⭐', category: 'advanced' },
    { value: 'file', label: 'File Upload', icon: '📎', category: 'advanced' },
  ],
  layout: [
    { value: 'section', label: 'Section Header', icon: '🔖', category: 'layout' },
    { value: 'divider', label: 'Divider', icon: '➖', category: 'layout' },
    // { value: 'grid_layout', label: 'Grid Layout', icon: '📐', category: 'layout' }, 
  ]
};

const ALL_FIELD_TYPES = [...FIELD_CATEGORIES.basic, ...FIELD_CATEGORIES.advanced, ...FIELD_CATEGORIES.layout];
// Draggable Field Palette Item
const DraggableFieldItem = ({ field }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${field.value}`,
    data: {
      isNewField: true,
      fieldType: field.value
    }
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-full px-2 md:px-3 py-2 border border-slate-200 rounded-md text-xs md:text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 flex items-center space-x-1 md:space-x-2 transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''
        }`}
    >
      <span className="text-sm md:text-base">{field.icon}</span>
      <span className="flex-1 text-left truncate">{field.label}</span>
      <GripVertical className="h-3 w-3 text-slate-400 flex-shrink-0" />
    </div>
  );
};

// Droppable Grid Cell
const DroppableGridCell = ({ gridFieldId, cellIndex, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `grid-${gridFieldId}-cell-${cellIndex}`,
    data: {
      isGridCell: true,
      gridFieldId,
      cellIndex
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] border-2 border-dashed rounded-lg p-3 transition-colors ${isOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white'
        }`}
    >
      {children}
    </div>
  );
};

// Droppable Canvas for Empty Form
const DroppableCanvas = ({ stepIndex, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-step-${stepIndex}`,
    data: {
      isCanvas: true,
      stepIndex
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-colors ${isOver ? 'bg-indigo-50' : ''
        }`}
    >
      {children}
    </div>
  );
};

// Draggable CRM Property
const DraggableCRMProperty = ({ property, onAIMap, onDetailView }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `crm-${property.id}`,
    data: {
      isNewField: true,
      isCRMField: true,
      fieldType: property.type === 'text' ? 'text' :
        property.type === 'email' ? 'email' :
          property.type === 'phone' ? 'phone' :
            property.type === 'number' ? 'number' :
              property.type === 'date' ? 'date' :
                property.type === 'textarea' ? 'textarea' :
                  'text',
      crmProperty: property
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`p-3 border border-slate-200 rounded-lg hover:border-indigo-300 transition-all bg-white ${isDragging ? 'opacity-50' : ''
        }`}
    >
      <div className="flex items-start justify-between mb-2 cursor-grab active:cursor-grabbing"{...listeners}
          {...attributes}>
        <div
          className="flex-1"
          // onClick={() => onDetailView(property)}
        >
          <p className="text-sm font-semibold text-slate-900">{property.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Type: {property.type}
            {property.required && <span className="text-red-600 ml-2">• Required</span>}
            {property.is_custom && <span className="text-blue-600 ml-2">• Custom</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2 mt-2">
        {/* <button
          {...listeners}
          {...attributes}
          className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3 mr-1" />
          Drag to Add
        </button> */}
        <button
          onClick={() => onAIMap(property)}
          className="flex-1 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded text-xs font-medium transition-all flex items-center justify-center"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          AI Map
        </button>
      </div>
    </div>
  );
};

// Sortable Field Item Component
const SortableFieldItem = ({ field, isSelected, onSelect, onDelete, renderPreview }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(field.id)}
      className={`border-2 rounded-lg p-4 transition-all ${isSelected
          ? 'border-indigo-500 bg-indigo-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300'
        } ${isDragging ? 'shadow-2xl' : ''}`}
    >
      <div className="flex items-start space-x-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex-1">
          {/* CRM Mapping Indicator */}
          {field.crm_mapping && (
            <div className="mb-2 flex items-center space-x-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                {field.crm_mapping.is_auto_mapped && <Sparkles className="h-3 w-3 mr-1" />}
                🔗 {field.crm_mapping.property_label}
                {field.crm_mapping.confidence && (
                  <span className="ml-1 text-blue-600">
                    ({Math.round(field.crm_mapping.confidence * 100)}%)
                  </span>
                )}
              </span>
            </div>
          )}
          {renderPreview(field)}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(field.id);
          }}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const FormEditorPro = () => {
  const { formId } = useParams();
  const navigate = useNavigate();

  // Form State
  const [formTitle, setFormTitle] = useState('Untitled Form');
  const [formDescription, setFormDescription] = useState('');
  const [steps, setSteps] = useState([{ id: uuidv4(), title: 'Step 1', fields: [] }]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedField, setSelectedField] = useState(null);

  // UI State
  const [showPreview, setShowPreview] = useState(false);
  const [currentPreviewStep, setCurrentPreviewStep] = useState(0); // For multi-step preview navigation
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [shareableLink, setShareableLink] = useState('');
  const [leftPanelTab, setLeftPanelTab] = useState('fields'); // 'fields' or 'steps'
  const [activeId, setActiveId] = useState(null);

  // AI Assistant State
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [aiConversation, setAiConversation] = useState([]);

  // CRM Property Mapping State (Always Active - No Toggle)
  const [selectedCRMModule, setSelectedCRMModule] = useState(null); // Default to Lead
  const [crmModules, setCRMModules] = useState([]);
  const [crmProperties, setCRMProperties] = useState([]);
  const [crmSearchQuery, setCrmSearchQuery] = useState(''); // New: Search CRM objects
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showMappingPanel, setShowMappingPanel] = useState(false);
  const [selectedFieldForMapping, setSelectedFieldForMapping] = useState(null);
  const [showFieldDetailView, setShowFieldDetailView] = useState(false); // New: Detail view panel
  const [autoMappingLoading, setAutoMappingLoading] = useState(false);

  // New: Layout & Theme State
  const [formLayout, setFormLayout] = useState('1-column'); // '1-column', '2-column', '3-column'
  const [formTheme, setFormTheme] = useState({
    backgroundColor: '#f8fafc',
    cardBackgroundColor: '#ffffff',
    primaryColor: '#4f46e5',
    textColor: '#1e293b',
    buttonColor: '#10b981',
    fontFamily: 'Inter, system-ui, sans-serif',
    // Button Labels
    submitButtonText: 'Submit',
    nextButtonText: 'Next',
    previousButtonText: 'Previous',
    // Button Text Color
    buttonTextColor: '#ffffff'
  });
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);

  // New: AI Form Creation State
  const [showAIFormCreator, setShowAIFormCreator] = useState(false);
  const [aiFormConversation, setAiFormConversation] = useState([]);
  const [aiFormMetadata, setAiFormMetadata] = useState({}); // Store form metadata for AI memory

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (formId) {
      loadForm();
    }
    // Load CRM modules on mount (CRM is always active)
    loadCRMModules();
  }, [formId]);

  // Auto-load properties when CRM module is selected
  useEffect(() => {
    if (selectedCRMModule) {
      loadModuleProperties(selectedCRMModule);
    }
  }, [selectedCRMModule]);

  const loadForm = async () => {
    try {
      const form = await FormService.getForm(formId);
      setFormTitle(form.title);
      setFormDescription(form.description || '');

      // Load CRM module
      if (form.crm_module) {
        setSelectedCRMModule(form.crm_module);
      }

      // CRM is always enabled now
      // Load theme and layout settings
      if (form.settings?.theme) {
        setFormTheme(form.settings.theme);
      }
      if (form.settings?.layout) {
        setFormLayout(form.settings.layout);
      }
      if (form.settings?.ai_metadata) {
        setAiFormMetadata(form.settings.ai_metadata);
      }

      // Load steps or convert fields to single step
      if (form.steps && form.steps.length > 0) {
        setSteps(form.steps);
      } else if (form.fields && form.fields.length > 0) {
        setSteps([{ id: uuidv4(), title: 'Step 1', fields: form.fields }]);
      }

      if (form.is_published && form.public_url) {
        setShareableLink(`${window.location.origin}/form/${formId}`);
      }
    } catch (error) {
      console.error('Error loading form:', error);
      toast.error('Failed to load form');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const savePromise = (async () => {
      // Flatten all fields from all steps for backend
      const allFields = steps.flatMap(step => step.fields);

      const formData = {
        title: formTitle,
        description: formDescription,
        fields: allFields,
        steps: steps, // Save steps structure
        enable_crm_mapping: true, // Always enabled
        crm_module: selectedCRMModule,
        settings: {
          theme: formTheme,
          layout: formLayout,
          ai_metadata: aiFormMetadata,
          crm_mapping_enabled: true
        }
      };

      if (formId) {
        await FormService.updateForm(formId, formData);
        return 'Form saved successfully!';
      } else {
        const newForm = await FormService.createForm(formData);
        navigate(`/form-builder/editor/${newForm.id}`);
        return 'Form created successfully!';
      }
    })();

    toast.promise(savePromise, {
      loading: 'Saving form...',
      success: (msg) => msg,
      error: 'Failed to save form'
    });

    try {
      await savePromise;
    } finally {
      setSaving(false);
    }
  };

  // Check if all fields are mapped to CRM
  const areAllFieldsMapped = () => {
    if (!selectedCRMModule) return false;
    
    const allFields = steps.flatMap(step => step.fields);
    const inputFields = allFields.filter(field => 
      field.type !== 'section' && 
      field.type !== 'divider' && 
      field.type !== 'grid_layout'
    );
    
    if (inputFields.length === 0) return false;
    
    return inputFields.every(field => field?.crm_mapping?.property_id && field?.crm_mapping?.property_id !== '');
  };

  const handlePublish = async () => {
    try {
      // Check if CRM module is selected
      if (!selectedCRMModule) {
        toast.error('Please select a CRM module before publishing');
        return;
      }

      // Check for unmapped fields
      const allFields = steps.flatMap(step => step.fields);
      const unmappedFields = allFields.filter(field => 
        field.type !== 'section' && 
        field.type !== 'divider' && 
        field.type !== 'grid_layout' && 
        (!field?.crm_mapping?.property_id || field?.crm_mapping?.property_id === '')
      );

      if (unmappedFields.length > 0) {
        const fieldNames = unmappedFields.map(f => f.label).join(', ');
        toast.error(`Please map all fields to CRM properties before publishing. Unmapped fields: ${fieldNames}`);
        return;
      }

      // Auto-save first
      const formData = {
        title: formTitle,
        description: formDescription,
        fields: allFields,
        steps: steps
      };

      if (formId) {
        await FormService.updateForm(formId, formData);
      }

      setPublishing(true);
      const result = await FormService.publishForm(formId);
      setShareableLink(result.shareable_link);
      setShowPublishModal(false);
      setShowShareModal(true);
      toast.success('Form published successfully!');
      await loadForm();
    } catch (error) {
      console.error('Error publishing form:', error);
      toast.error('Failed to publish form');
    } finally {
      setPublishing(false);
    }
  };

  const copyShareLink = () => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      toast.success('Link copied to clipboard!');
    }
  };

  // Step Management
  const addStep = () => {
    const newStep = {
      id: uuidv4(),
      title: `Step ${steps.length + 1}`,
      fields: []
    };
    setSteps([...steps, newStep]);
    setCurrentStepIndex(steps.length);
  };

  const deleteStep = (stepIndex) => {
    if (steps.length === 1) {
      toast.error('Cannot delete the last step');
      return;
    }
    const newSteps = steps.filter((_, i) => i !== stepIndex);
    setSteps(newSteps);
    if (currentStepIndex >= newSteps.length) {
      setCurrentStepIndex(newSteps.length - 1);
    }
    toast.success('Step deleted');
  };

  const updateStepTitle = (stepIndex, newTitle) => {
    const newSteps = [...steps];
    newSteps[stepIndex].title = newTitle;
    setSteps(newSteps);
  };

  // Field Management
  const addField = (type) => {
    const newField = {
      id: uuidv4(),
      type: type,
      label: `New ${ALL_FIELD_TYPES.find(t => t.value === type)?.label || 'Field'}`,
      placeholder: '',
      required: false,
      options: (type === 'select' || type === 'radio' || type === 'checkbox' || type === 'multiselect') ? ['Option 1', 'Option 2'] : null,
      maxRating: type === 'rating' ? 5 : null,
      columns: type === 'grid' ? 2 : null,
      gridFields: type === 'grid' ? [] : null
    };

    const newSteps = [...steps];
    newSteps[currentStepIndex].fields.push(newField);
    setSteps(newSteps);
    setSelectedField(newField.id);
  };

  const updateField = (fieldId, updates) => {
    const newSteps = [...steps];
    newSteps[currentStepIndex].fields = newSteps[currentStepIndex].fields.map(f =>
      f.id === fieldId ? { ...f, ...updates } : f
    );
    setSteps(newSteps);
  };

  const deleteField = (fieldId) => {
    const newSteps = [...steps];
    newSteps[currentStepIndex].fields = newSteps[currentStepIndex].fields.filter(f => f.id !== fieldId);
    setSteps(newSteps);
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
    // toast.success('Field deleted');
  };

  // DnD Handlers
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  // const handleDragStart = (event) => {
  //   setActiveId(event.active.id);
  // };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data?.current;
    const overData = over.data?.current;

    // Case 1: Dragging a new field from palette or CRM to canvas
    if (activeData?.isNewField) {
      const fieldType = activeData.fieldType;
      const dropPosition = overData?.sortable?.index;
      const crmProperty = activeData?.crmProperty;

      if (crmProperty) {
        // Adding a CRM field with proper labels
        addFieldAtPosition(fieldType, dropPosition, crmProperty);
      } else {
        addFieldAtPosition(fieldType, dropPosition);
      }
      // toast.success('Field added');
      return;
    }

    // Case 2: Dragging into a grid container
    if (overData?.isGridCell) {
      const gridFieldId = overData.gridFieldId;
      const cellIndex = overData.cellIndex;

      moveFieldToGrid(active.id, gridFieldId, cellIndex);
      return;
    }

    // Case 3: Dragging to empty canvas
    if (overData?.isCanvas && activeData?.isNewField) {
      const fieldType = activeData.fieldType;
      addFieldAtPosition(fieldType);
      // toast.success('Field added');
      return;
    }

    // Case 4: Reordering existing fields
    if (active.id !== over.id) {
      const newSteps = [...steps];
      const currentFields = newSteps[currentStepIndex].fields;
      const oldIndex = currentFields.findIndex(f => f.id === active.id);
      const newIndex = currentFields.findIndex(f => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        newSteps[currentStepIndex].fields = arrayMove(currentFields, oldIndex, newIndex);
        setSteps(newSteps);
        toast.success('Field reordered');
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Add field at specific position or end
  const addFieldAtPosition = (fieldType, position = null, crmProperty = null) => {
    const fieldId = uuidv4();

    // If CRM property provided, use its data
    const label = crmProperty ? crmProperty.label :
      fieldType === 'section' ? 'Section Title' :
        fieldType === 'divider' ? '' :
          fieldType === 'grid_layout' ? 'Grid Layout' :
            `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)} Field`;

    const name = crmProperty ? crmProperty.id : `field_${Date.now()}`;
    const placeholder = crmProperty ? `Enter ${crmProperty.label.toLowerCase()}` :
      fieldType === 'section' || fieldType === 'divider' ? '' :
        `Enter ${fieldType}`;

    const newField = {
      id: fieldId,
      type: fieldType,
      label,
      name,
      placeholder,
      required: crmProperty ? crmProperty.required : false,
      // Auto-map CRM field when dragged
      ...(crmProperty && {
        crm_mapping: {
          property_id: crmProperty.id,
          property_label: crmProperty.label,
          property_type: crmProperty.type,
          is_auto_mapped: true
        }
      }),
      ...(fieldType === 'grid_layout' && {
        gridColumns: 2,
        gridFields: [[], []], // Array of arrays for each column
      }),
      ...(fieldType === 'select' && { options: ['Option 1', 'Option 2', 'Option 3'] }),
      ...(fieldType === 'rating' && { maxRating: 5 }),
    };

    const newSteps = [...steps];
    if (position !== null && position !== undefined) {
      newSteps[currentStepIndex].fields.splice(position, 0, newField);
    } else {
      newSteps[currentStepIndex].fields.push(newField);
    }
    setSteps(newSteps);
  };

  // Move field into grid cell
  const moveFieldToGrid = (fieldId, gridFieldId, cellIndex) => {
    const newSteps = [...steps];
    const currentFields = newSteps[currentStepIndex].fields;

    // Find the field being moved
    const fieldIndex = currentFields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;

    const field = currentFields[fieldIndex];

    // Find the grid container
    const gridIndex = currentFields.findIndex(f => f.id === gridFieldId);
    if (gridIndex === -1) return;

    const gridField = currentFields[gridIndex];

    // Remove field from current position
    currentFields.splice(fieldIndex, 1);

    // Add to grid cell
    if (!gridField.gridFields[cellIndex]) {
      gridField.gridFields[cellIndex] = [];
    }
    gridField.gridFields[cellIndex].push(field);

    setSteps(newSteps);
    toast.success('Field moved to grid');
  };

  // Update grid columns
  const updateGridColumns = (gridFieldId, newColumns) => {
    const newSteps = [...steps];
    const gridField = newSteps[currentStepIndex].fields.find(f => f.id === gridFieldId);

    if (gridField && gridField.type === 'grid_layout') {
      const oldColumns = gridField.gridColumns || 2;
      gridField.gridColumns = newColumns;

      // Adjust gridFields array
      if (newColumns > oldColumns) {
        // Add empty arrays for new columns
        for (let i = oldColumns; i < newColumns; i++) {
          gridField.gridFields[i] = [];
        }
      } else if (newColumns < oldColumns) {
        // Move fields from removed columns to last column
        for (let i = newColumns; i < oldColumns; i++) {
          if (gridField.gridFields[i] && gridField.gridFields[i].length > 0) {
            gridField.gridFields[newColumns - 1].push(...gridField.gridFields[i]);
          }
        }
        gridField.gridFields = gridField.gridFields.slice(0, newColumns);
      }

      setSteps(newSteps);
      toast.success(`Updated to ${newColumns} columns`);
    }
  };

  const renderFieldPreview = (field) => {
    if (field.type === 'section') {
      return (
        <div className="py-3">
          <h3 className="text-lg font-semibold text-slate-900">{field.label}</h3>
        </div>
      );
    }

    if (field.type === 'divider') {
      return <hr className="my-4 border-slate-300" />;
    }

    if (field.type === 'grid_layout') {
      const columns = field.gridColumns || 2;
      return (
        <div className="border-2 border-dashed border-indigo-300 rounded-lg p-4 bg-indigo-50/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-indigo-700 flex items-center">
              <Grid3x3 className="h-4 w-4 mr-1" />
              Grid Layout ({columns} columns)
            </h4>
            <select
              value={columns}
              onChange={(e) => updateGridColumns(field.id, parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="text-xs px-2 py-1 border border-indigo-300 rounded bg-white"
            >
              <option value={2}>2 Columns</option>
              <option value={3}>3 Columns</option>
              <option value={4}>4 Columns</option>
            </select>
          </div>
          <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, cellIndex) => (
              <DroppableGridCell key={cellIndex} gridFieldId={field.id} cellIndex={cellIndex}>
                <p className="text-xs text-slate-400 text-center mb-2">Drop fields here</p>
                <div className="space-y-2">
                  {field.gridFields?.[cellIndex]?.map((gridField) => (
                    <div key={gridField.id} className="bg-slate-50 border border-slate-200 rounded p-2 text-xs">
                      <div className="font-medium text-slate-700 mb-1">{gridField.label}</div>
                      <div className="text-slate-500">{gridField.type}</div>
                    </div>
                  ))}
                </div>
              </DroppableGridCell>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2"
          style={{ color: formTheme.textColor }}
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {field.type === 'textarea' ? (
          <textarea
            disabled
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50"
            rows={3}
          />
        ) : field.type === 'select' ? (
          <select disabled className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50">
            <option>Select...</option>
            {field.options?.map((opt, i) => (
              <option key={i}>{opt}</option>
            ))}
          </select>
        ) : field.type === 'multiselect' ? (
          <div className="border border-slate-300 rounded-md p-2 bg-slate-50">
            <div className="text-xs text-slate-500">Multi-select dropdown</div>
          </div>
        ) : field.type === 'rating' ? (
          <div className="flex space-x-1">
            {[...Array(field.maxRating || 5)].map((_, i) => (
              <span key={i} className="text-2xl text-slate-300">⭐</span>
            ))}
          </div>
        ) : field.type === 'grid' ? (
          <div className={`grid gap-3 ${field.columns === 1 ? 'grid-cols-1' :
              field.columns === 2 ? 'grid-cols-2' :
                'grid-cols-3'
            }`}>
            {[...Array(field.columns || 2)].map((_, i) => (
              <div key={i} className="border-2 border-dashed border-slate-300 rounded p-4 text-center text-xs text-slate-400">
                Grid Cell {i + 1}
              </div>
            ))}
          </div>
        ) : (
          <input
            disabled
            type={field.type === 'phone' ? 'tel' : field.type}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50"
          />
        )}
      </div>
    );
  };

  // AI Assistant Handlers
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a prompt for AI');
      return;
    }

    setAiLoading(true);
    const userMessage = { role: 'user', content: aiPrompt };
    setAiConversation(prev => [...prev, userMessage]);

    try {
      // Send comprehensive context including conversation history
      const formContext = {
        currentFields: steps[currentStepIndex].fields,
        allSteps: steps.map(s => ({
          id: s.id,
          title: s.title,
          fieldCount: s.fields.length
        })),
        formTitle,
        formDescription,
        conversationHistory: aiConversation.slice(-4) // Last 4 messages for context
      };
      
      const result = await FormService.generateFormWithAI(aiPrompt, formContext);

      const newSteps = [...steps];
      let assistantMessage = '';

      // Handle different action types
      switch (result.action) {
        case 'REMOVE':
          // Remove specified fields
          if (result.field_ids_to_remove && result.field_ids_to_remove.length > 0) {
            newSteps[currentStepIndex].fields = newSteps[currentStepIndex].fields.filter(
              f => !result.field_ids_to_remove.includes(f.id)
            );
            assistantMessage = result.message || `Removed ${result.field_ids_to_remove.length} field(s)`;
            toast.success(assistantMessage);
          }
          break;

        case 'REORDER':
          // Reorder fields based on AI response
          if (result.field_order && result.field_order.length > 0) {
            const orderedFields = [];
            result.field_order.forEach(fieldId => {
              const field = newSteps[currentStepIndex].fields.find(f => f.id === fieldId);
              if (field) orderedFields.push(field);
            });
            // Add any fields not in the order list at the end
            newSteps[currentStepIndex].fields.forEach(f => {
              if (!result.field_order.includes(f.id)) {
                orderedFields.push(f);
              }
            });
            newSteps[currentStepIndex].fields = orderedFields;
            assistantMessage = result.message || 'Fields reordered successfully';
            toast.success(assistantMessage);
          }
          break;

        case 'ADD_POSITIONAL':
          // Add fields at specific position
          if (result.fields && result.fields.length > 0) {
            const targetIndex = newSteps[currentStepIndex].fields.findIndex(
              f => f.id === result.target_field_id
            );
            if (targetIndex !== -1) {
              const insertIndex = result.position === 'before' ? targetIndex : targetIndex + 1;
              newSteps[currentStepIndex].fields.splice(insertIndex, 0, ...result.fields);
            } else {
              // If target not found, add at end
              newSteps[currentStepIndex].fields.push(...result.fields);
            }
            assistantMessage = result.message || 'Fields added at specified position';
            toast.success(assistantMessage);
          }
          break;

        case 'ADD_MULTI_STEP':
          // Create multi-step form
          if (result.steps && result.steps.length > 0) {
            const formattedSteps = result.steps.map((step, index) => ({
              id: step.id || uuidv4(),
              title: step.title || `Step ${index + 1}`,
              fields: step.fields || []
            }));
            setSteps(formattedSteps);
            setCurrentStepIndex(0);
            assistantMessage = result.message || `Created ${formattedSteps.length}-step form`;
            toast.success(assistantMessage);
          }
          break;

        case 'MODIFY':
          // Modify existing field properties
          if (result.fields_to_modify && result.fields_to_modify.length > 0) {
            result.fields_to_modify.forEach(modification => {
              const field = newSteps[currentStepIndex].fields.find(f => f.id === modification.id);
              if (field) {
                // Update any provided properties
                if (modification.label !== undefined) field.label = modification.label;
                if (modification.placeholder !== undefined) field.placeholder = modification.placeholder;
                if (modification.required !== undefined) field.required = modification.required;
                if (modification.type !== undefined) field.type = modification.type;
                if (modification.name !== undefined) field.name = modification.name;
                
                // Handle label case transformations
                if (modification.labelCase) {
                  switch(modification.labelCase) {
                    case 'uppercase':
                      field.label = field.label.toUpperCase();
                      break;
                    case 'lowercase':
                      field.label = field.label.toLowerCase();
                      break;
                    case 'titlecase':
                      field.label = field.label.split(' ').map(w => 
                        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                      ).join(' ');
                      break;
                  }
                }
              }
            });
            assistantMessage = result.message || result.conversational_reply || 'Fields updated';
            toast.success('Fields modified');
          }
          break;
        
        case 'QUESTION':
        case 'SUGGESTION':
        case 'CHAT':
        case 'NONE':
          // Conversational responses - no form changes
          assistantMessage = result.conversational_reply || result.message || "I'm here to help! What would you like to do?";
          // Don't show success toast for pure conversation
          if (result.suggestions && result.suggestions.length > 0) {
            // Show suggestions in a subtle way
            console.log('AI Suggestions:', result.suggestions);
          }
          break;

        case 'ADD_FIELDS':
        default:
          // Add new fields normally
          if (result.fields && result.fields.length > 0) {
            newSteps[currentStepIndex].fields = [...newSteps[currentStepIndex].fields, ...result.fields];
            assistantMessage = result.message || 'Fields added successfully';
            toast.success(assistantMessage);
          }
          break;
      }

      // Update steps if not multi-step action
      if (result.action !== 'ADD_MULTI_STEP') {
        setSteps(newSteps);
      }

      // Add AI response to conversation
      const aiMessage = {
        role: 'assistant',
        content: result.conversational_reply || assistantMessage || result.message || "Done!"
      };
      setAiConversation(prev => [...prev, aiMessage]);
      
      // Show success toast only for actual form changes
      if (result.action && !['CHAT', 'QUESTION', 'SUGGESTION', 'NONE'].includes(result.action)) {
        toast.success('Form updated');
      }

      setAiPrompt('');
    } catch (error) {
      console.error('Error generating with AI:', error);
      toast.error('Failed to execute AI command');
      const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setAiConversation(prev => [...prev, errorMessage]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleVoiceCommand = async () => {
    if (!isRecordingVoice) {
      // Start recording
      setIsRecordingVoice(true);
      toast.success('Voice recording started');
      // TODO: Implement actual voice recording with Web Speech API or Gemini STT
    } else {
      // Stop recording
      setIsRecordingVoice(false);
      toast.success('Voice recording stopped');
      // TODO: Process voice and call AI
    }
  };

  // CRM Property Mapping Handlers
  const loadCRMModules = async () => {
    try {
      const data = await FormService.getCRMModules();
      setCRMModules(data.modules);
    } catch (error) {
      console.error('Error loading CRM modules:', error);
      toast.error('Failed to load CRM modules');
    }
  };

  const loadModuleProperties = async (moduleName) => {
    try {
      const data = await FormService.getModuleProperties(moduleName);
      setCRMProperties(data.properties);
    } catch (error) {
      console.error('Error loading module properties:', error);
      toast.error('Failed to load module properties');
    }
  };

  // CRM is always enabled - no toggle needed

  const handleModuleSelect = async (moduleName) => {
    setSelectedCRMModule(moduleName);
    await loadModuleProperties(moduleName);
    toast.success(`Selected ${moduleName} module`);
  };

  const handleAddPropertyAsField = (property) => {
    // Map CRM property type to form field type
    const typeMapping = {
      'text': 'text',
      'email': 'email',
      'phone': 'tel',
      'number': 'number',
      'textarea': 'textarea',
      'picklist': 'select',
      'boolean': 'checkbox',
      'date': 'date'
    };

    const newField = {
      id: uuidv4(),
      type: typeMapping[property.type] || 'text',
      label: property.label,
      placeholder: `Enter ${property.label.toLowerCase()}`,
      required: property.required,
      options: property.options || undefined,
      crm_mapping: {
        property_id: property.id,
        property_label: property.label,
        property_type: property.type,
        is_auto_mapped: false
      }
    };

    const newSteps = [...steps];
    newSteps[currentStepIndex].fields.push(newField);
    setSteps(newSteps);

    toast.success(`Added ${property.label} field`);
  };

  const handleAutoMapProperties = async () => {
    if (!selectedCRMModule || crmProperties.length === 0) {
      toast.error('Please select a CRM module first');
      return;
    }

    setAutoMappingLoading(true);

    try {
      const currentFields = steps[currentStepIndex]?.fields || [];

      if (currentFields.length === 0) {
        toast.error('No fields to map');
        setAutoMappingLoading(false);
        return;
      }

      const { mappings } = await FormService.autoMapProperties(
        currentFields,
        selectedCRMModule,
        crmProperties
      );

      // Apply mappings to fields
      const newSteps = [...steps];
      mappings.forEach(mapping => {
        const field = newSteps[currentStepIndex].fields.find(f => f.id === mapping.field_id);
        if (field) {
          const property = crmProperties.find(p => p.id === mapping.property_id);
          if (property) {
            field.crm_mapping = {
              property_id: property.id,
              property_label: property.label,
              property_type: property.type,
              confidence: mapping.confidence / 100,
              is_auto_mapped: true
            };
          }
        }
      });

      setSteps(newSteps);
      toast.success(`Auto-mapped ${mappings.length} fields`);
    } catch (error) {
      console.error('Auto-mapping error:', error);
      toast.error('Auto-mapping failed');
    } finally {
      setAutoMappingLoading(false);
    }
  };

  const handleUpdateFieldMapping = (fieldId, propertyId) => {
    const property = crmProperties.find(p => p.id === propertyId);
    if (!property) return;

    const newSteps = [...steps];
    const field = newSteps[currentStepIndex].fields.find(f => f.id === fieldId);

    if (field) {
      if (propertyId === 'none') {
        delete field.crm_mapping;
      } else {
        field.crm_mapping = {
          property_id: property.id,
          property_label: property.label,
          property_type: property.type,
          is_auto_mapped: false
        };
      }
      setSteps(newSteps);
    }
  };

  // Handler for AI mapping individual CRM property
  const handleAIMapSingleProperty = async (property) => {
    const currentFields = steps[currentStepIndex]?.fields || [];

    if (currentFields.length === 0) {
      toast.error('No form fields available to map');
      return;
    }

    try {
      // Use AI to find best matching field
      const { mappings } = await FormService.autoMapProperties(
        currentFields,
        selectedCRMModule,
        [property] // Map only this single property
      );

      if (mappings.length > 0) {
        const mapping = mappings[0];
        const newSteps = [...steps];
        const field = newSteps[currentStepIndex].fields.find(f => f.id === mapping.field_id);

        if (field) {
          field.crm_mapping = {
            property_id: property.id,
            property_label: property.label,
            property_type: property.type,
            confidence: mapping.confidence / 100,
            is_auto_mapped: true
          };
          setSteps(newSteps);
          toast.success(`Mapped ${property.label} to ${field.label}`);
        }
      } else {
        toast.error(`No suitable field found for ${property.label}`);
      }
    } catch (error) {
      console.error('Single property mapping error:', error);
      toast.error('AI mapping failed');
    }
  };

  // AI Form Creator Functions
  const startAIFormConversation = () => {
    const initialMessage = {
      role: 'assistant',
      content: "Hi! I'm here to help you create the perfect form. Let's start with a simple question:\n\nWhat is the main purpose of your form?",
      options: [
        { label: "📋 Contact/Lead Collection", value: "contact" },
        { label: "📝 Survey/Feedback", value: "survey" },
        { label: "📅 Event Registration", value: "event" },
        { label: "💼 Job Application", value: "job" },
        { label: "✨ Custom Form", value: "custom" }
      ]
    };
    setAiFormConversation([initialMessage]);

    // Initialize metadata
    setAiFormMetadata({
      purpose: '',
      fields: [],
      layout: '1-column',
      theme: formTheme,
      conversationHistory: []
    });
  };

  const handleAIFormOption = async (option) => {
    // Add user's selection to conversation
    const userMessage = {
      role: 'user',
      content: option.label
    };
    setAiFormConversation(prev => [...prev, userMessage]);

    // Update metadata
    const updatedMetadata = {
      ...aiFormMetadata,
      purpose: option.value,
      conversationHistory: [...(aiFormMetadata.conversationHistory || []), option]
    };
    setAiFormMetadata(updatedMetadata);

    // AI responds based on selection
    setTimeout(() => {
      let aiResponse;

      if (option.value === 'contact') {
        aiResponse = {
          role: 'assistant',
          content: "Perfect! A contact form. Let me help you build it step by step.\n\nFirst, how many fields would you like?",
          options: [
            { label: "📝 Basic (3-4 fields)", value: "basic_contact", fields: ['name', 'email', 'phone'] },
            { label: "📋 Standard (5-6 fields)", value: "standard_contact", fields: ['name', 'email', 'phone', 'company'] },
            { label: "📄 Detailed (7+ fields)", value: "detailed_contact", fields: ['name', 'email', 'phone', 'company', 'message', 'textarea'] },
            { label: "🎨 Custom - Let me choose", value: "custom_contact" }
          ]
        };
      } else if (option.value === 'survey') {
        aiResponse = {
          role: 'assistant',
          content: "Perfect! A survey form. What type of questions do you need?",
          options: [
            { label: "⭐ Rating & Feedback", value: "rating_survey", fields: ['rating', 'feedback'] },
            { label: "✅ Multiple Choice Questions", value: "mcq_survey", fields: ['multiple_choice'] },
            { label: "📝 Open-ended Questions", value: "openended_survey", fields: ['textarea'] },
            { label: "🎨 Mix of all", value: "mixed_survey" }
          ]
        };
      } else if (option.value === 'event') {
        aiResponse = {
          role: 'assistant',
          content: "Excellent! Event registration form. Here's what I recommend:",
          options: [
            { label: "✅ Basic (Name, Email, # of Attendees)", value: "basic_event", fields: ['name', 'email', 'number'] },
            { label: "✅ Detailed (+ Phone, Company, Dietary)", value: "detailed_event", fields: ['name', 'email', 'phone', 'company', 'select'] },
            { label: "🎨 Custom fields", value: "custom_event" }
          ]
        };
      } else if (option.value === 'job') {
        aiResponse = {
          role: 'assistant',
          content: "Job application form! Let's make it professional:",
          options: [
            { label: "✅ Basic Application", value: "basic_job", fields: ['name', 'email', 'phone', 'resume'] },
            { label: "✅ Detailed Application (+ Experience, Skills)", value: "detailed_job", fields: ['name', 'email', 'phone', 'textarea', 'select'] },
            { label: "🎨 Custom application", value: "custom_job" }
          ]
        };
      } else {
        // Handle field selection options - Ask about validations first
        if (option.fields) {
          // Store fields temporarily and ask about validations
          const fieldsToAdd = option.fields;
          setAiFormMetadata(prev => ({ ...prev, pendingFields: fieldsToAdd }));

          aiResponse = {
            role: 'assistant',
            content: "Great choice! Now, should any of these fields be required?\n\n(Required fields must be filled before form submission)",
            options: [
              { label: "✅ Yes - Make email and name required", value: "require_essential", fieldsToAdd },
              { label: "✅ Yes - Make all fields required", value: "require_all", fieldsToAdd },
              { label: "⭕ No - All fields optional", value: "no_required", fieldsToAdd },
              { label: "🎨 Let me choose individually", value: "custom_required", fieldsToAdd }
            ]
          };

          setAiFormConversation(prev => [...prev, aiResponse]);
          return;
        }

        // Handle validation options
        if (option.fieldsToAdd) {
          const fieldsConfig = {
            fields: option.fieldsToAdd,
            validationMode: option.value
          };
          generateFormFromAI(fieldsConfig);
          return;
        }

        aiResponse = {
          role: 'assistant',
          content: "No problem! Let's build it step by step. What's the first field you'd like to add?",
          options: [
            { label: "📝 Text Input", value: "add_text" },
            { label: "📧 Email", value: "add_email" },
            { label: "📱 Phone", value: "add_phone" },
            { label: "🏢 Company/Organization", value: "add_company" },
            { label: "💬 Message/Comments", value: "add_textarea" },
            { label: "✅ Done adding fields", value: "finish_form" }
          ]
        };
      }

      setAiFormConversation(prev => [...prev, aiResponse]);
    }, 800);
  };

  const handleAIFormUserInput = async (input) => {
    // Add user message
    const userMessage = {
      role: 'user',
      content: input
    };
    setAiFormConversation(prev => [...prev, userMessage]);

    // Store in metadata
    setAiFormMetadata(prev => ({
      ...prev,
      conversationHistory: [...(prev.conversationHistory || []), { type: 'user_input', content: input }]
    }));

    // Process AI response using Gemini
    try {
      const response = await FormService.processAIFormRequest(input, aiFormMetadata);

      const aiResponse = {
        role: 'assistant',
        content: response.message
      };

      if (response.options) {
        aiResponse.options = response.options;
      }

      if (response.shouldGenerateForm) {
        generateFormFromAI(response);
        return;
      }

      setAiFormConversation(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI Form Creator error:', error);
      const errorResponse = {
        role: 'assistant',
        content: "I understand! Would you like to:\n\n1. Add more fields\n2. Choose a layout\n3. Generate the form now",
        options: [
          { label: "➕ Add more fields", value: "add_more" },
          { label: "🎨 Choose layout", value: "choose_layout" },
          { label: "✅ Generate form", value: "generate_now" }
        ]
      };
      setAiFormConversation(prev => [...prev, errorResponse]);
    }
  };

  const generateFormFromAI = (data) => {
    toast.loading('Generating your form...');

    setTimeout(() => {
      const newFields = [];
      const fieldTypes = data.fields || [];
      const validationMode = data.validationMode || 'no_required';

      fieldTypes.forEach((fieldType, index) => {
        const fieldId = uuidv4();

        // Determine if field should be required
        let isRequired = false;
        if (validationMode === 'require_all') {
          isRequired = true;
        } else if (validationMode === 'require_essential') {
          isRequired = ['name', 'email', 'phone'].includes(fieldType);
        }

        let field = {
          id: fieldId,
          type: fieldType,
          label: '',
          name: '',
          required: isRequired,
          placeholder: ''
        };

        // Set appropriate labels
        switch (fieldType) {
          case 'name':
            field = { ...field, type: 'text', label: 'Full Name', name: 'full_name', placeholder: 'Enter your full name' };
            break;
          case 'email':
            field = { ...field, type: 'email', label: 'Email Address', name: 'email', placeholder: 'your@email.com' };
            break;
          case 'phone':
            field = { ...field, type: 'phone', label: 'Phone Number', name: 'phone', placeholder: '+1 (555) 000-0000' };
            break;
          case 'company':
            field = { ...field, type: 'text', label: 'Company/Organization', name: 'company', placeholder: 'Company name', required: false };
            break;
          case 'message':
          case 'textarea':
            field = { ...field, type: 'textarea', label: 'Message', name: 'message', placeholder: 'Your message here...', required: false };
            break;
          case 'rating':
            field = { ...field, type: 'rating', label: 'Rating', name: 'rating', maxRating: 5, required: false };
            break;
          case 'number':
            field = { ...field, type: 'number', label: 'Number of Attendees', name: 'attendees', placeholder: '1' };
            break;
          case 'select':
            field = { ...field, type: 'select', label: 'Please Select', name: 'selection', options: ['Option 1', 'Option 2', 'Option 3'] };
            break;
          default:
            field = { ...field, type: 'text', label: `Field ${index + 1}`, name: `field_${index + 1}` };
        }

        newFields.push(field);
      });

      // Add fields to current step
      const newSteps = [...steps];
      newSteps[currentStepIndex].fields = [...newSteps[currentStepIndex].fields, ...newFields];
      setSteps(newSteps);

      // Update metadata
      setAiFormMetadata(prev => ({
        ...prev,
        fields: newFields,
        generatedAt: new Date().toISOString()
      }));

      toast.dismiss();
      toast.success(`Added ${newFields.length} fields to your form!`);

      // Close AI Form Creator
      setShowAIFormCreator(false);
      setAiFormConversation([]);

      // Show success message
      const finalMessage = {
        role: 'assistant',
        content: `✨ Form created successfully! I've added ${newFields.length} fields. You can now customize them or add more fields as needed.`
      };
      setAiFormConversation([finalMessage]);
    }, 1500);
  };

  const selectedFieldData = steps[currentStepIndex]?.fields.find(f => f.id === selectedField);
  const currentFields = steps[currentStepIndex]?.fields || [];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="px-3 md:px-6 py-2 md:py-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-2 md:space-y-0">
            <div className="flex items-center space-x-2 md:space-x-4 flex-1 w-full md:w-auto">

              <button
                onClick={() => navigate('/form-builder')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600" />
              </button>
              <div className="flex-1">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="text-base md:text-lg font-semibold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Form Title"
                />
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="text-xs md:text-sm text-slate-500 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Form description (optional)"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 w-full md:w-auto justify-end overflow-x-auto">
              {/* <button
                onClick={() => setLeftPanelTab('crm')}
                className="px-2 md:px-3 py-2 border bg-blue-50 border-blue-300 text-blue-700 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center flex-shrink-0"
              >
                <SettingsIcon className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">CRM ON</span>
              </button> */}
              <button
                onClick={() => setShowLayoutPanel(true)}
                className="px-2 md:px-3 py-2 border border-slate-300 rounded-md text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center flex-shrink-0"
                title="Form Layout"
              >
                <Grid3x3 className="h-4 w-4 md:mr-1" />
                <span className="hidden lg:inline">Layout</span>
              </button>
              <button
                onClick={() => setShowThemePanel(true)}
                className="px-2 md:px-3 py-2 border border-slate-300 rounded-md text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center flex-shrink-0"
                title="Theme"
              >
                <Sparkles className="h-4 w-4 md:mr-1" />
                <span className="hidden lg:inline">Theme</span>
              </button>
              <button
                onClick={() => {
                  setShowPreview(!showPreview);
                  setCurrentPreviewStep(0); // Reset to first step when entering preview
                }}
                className="px-2 md:px-3 py-2 border border-slate-300 rounded-md text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center flex-shrink-0"
              >
                <Eye className="h-4 w-4 md:inline md:mr-1" />
                <span className="hidden md:inline">{showPreview ? 'Edit' : 'Preview'}</span>
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2 md:px-3 py-2 bg-indigo-600 text-white rounded-md text-xs md:text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center"
              >
                <Save className="h-4 w-4 md:inline md:mr-1" />
                <span className="hidden md:inline">{saving ? 'Saving...' : 'Save'}</span>
              </button>
              {formId && (
                <>
                  <button
                    onClick={() => setShowPublishModal(true)}
                    disabled={publishing}
                    className="px-2 md:px-3 py-2 bg-green-600 text-white rounded-md text-xs md:text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors hidden md:block"
                  >
                    Publish
                  </button>
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-2 md:px-3 py-2 border border-slate-300 rounded-md text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center"
                  >
                    <Share2 className="h-4 w-4 md:inline md:mr-1" />
                    <span className="hidden md:inline">Share</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {!showPreview ? (
            <>
              {/* Left Panel - Fields Palette & Steps */}
              <div className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col overflow-hidden max-h-64 md:max-h-none">
                {/* Tab Switcher */}
                <div className="border-b border-slate-200 flex">
                  <button
                    onClick={() => setLeftPanelTab('fields')}
                    className={`flex-1 px-2 md:px-3 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors ${leftPanelTab === 'fields'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    <List className="h-4 w-4 inline mr-1" />
                    <span className="hidden sm:inline text-xs md:text-sm">Fields</span>
                  </button>
                  <button
                    onClick={() => setLeftPanelTab('steps')}
                    className={`flex-1 px-2 md:px-3 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors ${leftPanelTab === 'steps'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    <Layers className="h-4 w-4 inline mr-1" />
                    <span className="hidden sm:inline text-xs md:text-sm">Steps</span>
                  </button>
                  <button
                    onClick={() => setLeftPanelTab('crm')}
                    className={`flex-1 px-2 md:px-3 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors ${leftPanelTab === 'crm'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    <SettingsIcon className="h-4 w-4 inline mr-1" />
                    <span className="hidden sm:inline text-xs md:text-sm">CRM</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                  {leftPanelTab === 'fields' ? (
                    <div className="space-y-4 md:space-y-6">
                      {/* Basic Fields - Drag to Add */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">
                          Basic Fields
                          <span className="ml-2 text-indigo-600">← Drag to add</span>
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                          {FIELD_CATEGORIES.basic.map((field) => (
                            <DraggableFieldItem key={field.value} field={field} />
                          ))}
                        </div>
                      </div>

                      {/* Advanced Fields - Drag to Add */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">
                          Advanced Fields
                          <span className="ml-2 text-indigo-600">← Drag to add</span>
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                          {FIELD_CATEGORIES.advanced.map((field) => (
                            <DraggableFieldItem key={field.value} field={field} />
                          ))}
                        </div>
                      </div>

                      {/* Layout Elements - Drag to Add */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 md:mb-3">
                          Layout Elements
                          <span className="ml-2 text-indigo-600">← Drag to add</span>
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                          {FIELD_CATEGORIES.layout.map((field) => (
                            <DraggableFieldItem key={field.value} field={field} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : leftPanelTab === 'steps' ? (
                    /* Steps Manager */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-900">Form Steps</h3>
                        <button
                          onClick={addStep}
                          className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors"
                        >
                          <Plus className="h-3 w-3 inline mr-1" />
                          Add Step
                        </button>
                      </div>
                      {steps.map((step, index) => (
                        <div
                          key={step.id}
                          onClick={() => setCurrentStepIndex(index)}
                          className={`p-3 border-2 rounded-md cursor-pointer transition-colors ${currentStepIndex === index
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={step.title}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateStepTitle(index, e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm font-medium text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                {step.fields.length} field{step.fields.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {steps.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteStep(index);
                                }}
                                className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Enhanced CRM Tab with Search & AI Mapping */
                    <div className="space-y-4">
                      {/* CRM Object Search */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-700 mb-2">Search CRM Objects</h3>
                        <input
                          type="text"
                          placeholder="Search Lead, Contact, Deal..."
                          value={crmSearchQuery}
                          onChange={(e) => setCrmSearchQuery(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Filtered Module Selector */}
                      {/* {crmSearchQuery && crmSearchQuery.length !== 0 && (<> */}
                        <div>
                          <h3 className="text-xs font-semibold text-slate-700 mb-2">CRM Objects</h3>
                          <div className="space-y-2">
                            {crmModules
                              .filter(module =>
                                module.label.toLowerCase().includes(crmSearchQuery.toLowerCase())
                              )
                              .map((module) => (
                                <button
                                  key={module.value}
                                  onClick={() => handleModuleSelect(module.value)}
                                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${selectedCRMModule === module.value
                                      ? 'border-indigo-500 bg-indigo-50'
                                      : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <span className="text-2xl">{module.icon}</span>
                                    <div className="flex-1">
                                      <span className="font-medium text-sm block">{module.label}</span>
                                      <span className="text-xs text-slate-500">{module.value}</span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      {/* </>)} */}


                      {/* Global AI Auto-Map Button */}
                      {selectedCRMModule && currentFields.length > 0 && (
                        <button
                          onClick={handleAutoMapProperties}
                          disabled={autoMappingLoading}
                          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold text-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 shadow-lg"
                        >
                          <Sparkles className="h-5 w-5" />
                          <span>{autoMappingLoading ? 'AI Mapping All Fields...' : 'AI Auto-Map All Fields'}</span>
                        </button>
                      )}

                      {/* CRM Properties - Drag to Add */}
                      {selectedCRMModule && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold text-slate-700">
                              {selectedCRMModule.charAt(0).toUpperCase() + selectedCRMModule.slice(1)} Fields
                              <span className="ml-2 text-indigo-600">← Drag to add</span>
                            </h3>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{crmProperties.length} fields</span>
                          </div>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {crmProperties.map((property) => (
                              <DraggableCRMProperty
                                key={property.id}
                                property={property}
                                onAIMap={handleAIMapSingleProperty}
                                onDetailView={(prop) => {
                                  setSelectedFieldForMapping(prop);
                                  setShowFieldDetailView(true);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {!selectedCRMModule && (
                        <div className="text-center py-12 text-slate-500">
                          <SettingsIcon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                          <p className="text-sm font-medium">Select a CRM object above</p>
                          <p className="text-xs mt-1">Choose an object to view its fields and mappings</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Center Panel - Form Canvas */}
              <div className="flex-1 overflow-y-auto bg-slate-50 p-3 md:p-6">
                <div className="max-w-3xl mx-auto">
                  {/* Step Indicator */}
                  {steps.length > 1 && (
                    <div className="bg-white rounded-lg shadow-sm p-3 md:p-4 mb-4 md:mb-6">
                      <div className="flex items-center justify-between overflow-x-auto">
                        {steps.map((step, index) => (
                          <React.Fragment key={step.id}>
                            <div
                              onClick={() => setCurrentStepIndex(index)}
                              className={`flex items-center space-x-1 md:space-x-2 cursor-pointer flex-shrink-0 ${index === currentStepIndex ? 'text-indigo-600' : 'text-slate-400'
                                }`}
                            >
                              <div
                                className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold ${index === currentStepIndex
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-200 text-slate-600'
                                  }`}
                              >
                                {index + 1}
                              </div>
                              <span className="text-xs md:text-sm font-medium hidden sm:inline truncate max-w-20 md:max-w-none">{step.title}</span>
                            </div>
                            {index < steps.length - 1 && (
                              <div className="flex-1 h-0.5 bg-slate-200 mx-1 md:mx-2 min-w-4" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Form Canvas with Theme */}
                  <div
                    className="rounded-lg shadow-sm p-4 md:p-8 min-h-96"
                    style={{
                      backgroundColor: formTheme.cardBackgroundColor,
                      fontFamily: formTheme.fontFamily
                    }}
                  >
                    {currentFields.length === 0 ? (
                      <DroppableCanvas stepIndex={currentStepIndex}>
                        <div className="text-center py-12 md:py-16">
                          <Grid3x3 className="h-12 w-12 md:h-16 md:w-16 mx-auto text-slate-300 mb-4" />
                          <p className="text-slate-500 text-xs md:text-sm">Drag fields here</p>
                          <p className="text-slate-400 text-xs mt-2">Start building your form</p>
                        </div>
                      </DroppableCanvas>
                    ) : (
                      <SortableContext
                        items={currentFields.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className={`${formLayout === '2-column' ? 'grid grid-cols-2 gap-4' :
                            formLayout === '3-column' ? 'grid grid-cols-3 gap-4' :
                              'space-y-4'
                          }`}>
                          {currentFields.map((field) => (
                            <SortableFieldItem
                              key={field.id}
                              field={field}
                              isSelected={selectedField === field.id}
                              onSelect={setSelectedField}
                              onDelete={deleteField}
                              renderPreview={renderFieldPreview}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}

                    {/* Step Navigation Buttons Preview */}
                    {steps.length > 1 && (
                      <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
                        <button
                          disabled={currentStepIndex === 0}
                          className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-4 w-4 inline mr-1" />
                          Previous
                        </button>
                        <button
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                        >
                          {currentStepIndex === steps.length - 1 ? 'Submit' : 'Next'}
                          {currentStepIndex < steps.length - 1 && <ChevronRight className="h-4 w-4 inline ml-1" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Panel - Field Properties */}
              {selectedFieldData && (
                <div className="hidden lg:block w-80 bg-white border-l border-slate-200 overflow-y-auto">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
                    <h3 className="font-semibold text-slate-900">Field Properties</h3>
                    <button
                      onClick={() => setSelectedField(null)}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Field Label */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Field Label</label>
                      <input
                        type="text"
                        value={selectedFieldData.label}
                        onChange={(e) => updateField(selectedField, { label: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    {/* Field Type Selector */}
                    {selectedFieldData.type !== 'section' && selectedFieldData.type !== 'divider' && selectedFieldData.type !== 'grid_layout' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Field Type</label>
                        <select
                          value={selectedFieldData.type}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const updates = { type: newType };
                            // Reset type-specific properties
                            if (newType === 'select' || newType === 'radio' || newType === 'checkbox') {
                              updates.options = selectedFieldData.options || ['Option 1', 'Option 2'];
                            } else if (newType === 'rating') {
                              updates.maxRating = 5;
                            }
                            updateField(selectedField, updates);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="text">Text</option>
                          <option value="email">Email</option>
                          <option value="tel">Phone</option>
                          <option value="number">Number</option>
                          <option value="textarea">Text Area</option>
                          <option value="select">Dropdown (Select)</option>
                          <option value="radio">Radio Buttons</option>
                          <option value="checkbox">Checkboxes</option>
                          <option value="date">Date</option>
                          <option value="time">Time</option>
                          <option value="file">File Upload</option>
                          <option value="rating">Rating</option>
                        </select>
                      </div>
                    )}

                    {/* CRM Mapping Section */}
                    {console.log(selectedFieldData)}
                    {selectedFieldData.type !== 'section' && selectedFieldData.type !== 'divider' && selectedFieldData.type !== 'grid_layout' && selectedCRMModule && (
                      <div className="border-t pt-4">
                        <h4 className="text-xs font-semibold text-slate-700 uppercase mb-3">CRM Mapping</h4>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Map to {selectedCRMModule.charAt(0).toUpperCase() + selectedCRMModule.slice(1)} Field
                          </label>
                          <select
                            value={selectedFieldData?.crm_mapping?.property_id || ''}
                            onChange={(e) => {
                              const propertyId = e.target.value;
                              const property = crmProperties.find(p => p.id === propertyId);
                              console.log(property,"property")
                              updateField(selectedField, { 
                                crm_mapping:{
                                  property_id: propertyId,
                                property_label: property?.label,
                               id: selectedFieldData.id,
                                is_auto_mapped:false,
                                property_type:property.type
                                }
                              });
                            }}
                            className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                              !selectedFieldData?.crm_mapping?.property_id ? 'border-red-300 bg-red-50' : 'border-slate-300'
                            }`}
                          >
                            <option value="">-- Select CRM Field --</option>
                            {crmProperties.map(prop => (
                              <option key={prop.id} value={prop.id}>
                                {prop.label} ({prop.type})
                              </option>
                            ))}
                          </select>
                          {!selectedFieldData?.crm_mapping?.property_id && (
                            <p className="text-xs text-red-600 mt-1">⚠️ Required for publishing</p>
                          )}
                          {selectedFieldData?.crm_mapping?.property_id && (
                            <p className="text-xs text-green-600 mt-1">✓ Mapped to {selectedFieldData?.crm_mapping?.property_label}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Field Name/ID */}
                    {selectedFieldData.type !== 'section' && selectedFieldData.type !== 'divider' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Field Name</label>
                        <input
                          type="text"
                          value={selectedFieldData.name}
                          onChange={(e) => updateField(selectedField, { name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">Used as field identifier in form data</p>
                      </div>
                    )}

                    {/* Placeholder */}
                    {selectedFieldData.type !== 'section' && selectedFieldData.type !== 'divider' && selectedFieldData.type !== 'grid_layout' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Placeholder</label>
                        <input
                          type="text"
                          value={selectedFieldData.placeholder || ''}
                          onChange={(e) => updateField(selectedField, { placeholder: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    )}

                    {/* Label Case Transform */}
                    {selectedFieldData.type !== 'divider' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Label Style</label>
                        <select
                          value={selectedFieldData.labelCase || 'normal'}
                          onChange={(e) => {
                            const caseValue = e.target.value;
                            let transformedLabel = selectedFieldData.label;
                            if (caseValue === 'uppercase') {
                              transformedLabel = selectedFieldData.label.toUpperCase();
                            } else if (caseValue === 'lowercase') {
                              transformedLabel = selectedFieldData.label.toLowerCase();
                            } else if (caseValue === 'capitalize') {
                              transformedLabel = selectedFieldData.label.split(' ').map(w =>
                                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                              ).join(' ');
                            }
                            updateField(selectedField, { labelCase: caseValue, label: transformedLabel });
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="normal">Normal</option>
                          <option value="uppercase">UPPERCASE</option>
                          <option value="lowercase">lowercase</option>
                          <option value="capitalize">Capitalize Each Word</option>
                        </select>
                      </div>
                    )}

                    {selectedFieldData.type !== 'section' && selectedFieldData.type !== 'divider' && selectedFieldData.type !== 'grid' && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="required"
                          checked={selectedFieldData.required}
                          onChange={(e) => updateField(selectedField, { required: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="required" className="text-sm text-slate-700">Required field</label>
                      </div>
                    )}

                    {(selectedFieldData.type === 'select' || selectedFieldData.type === 'radio' ||
                      selectedFieldData.type === 'checkbox' || selectedFieldData.type === 'multiselect') && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">Options</label>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {selectedFieldData.options?.map((option, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => {
                                    const newOptions = [...selectedFieldData.options];
                                    newOptions[index] = e.target.value;
                                    updateField(selectedField, { options: newOptions });
                                  }}
                                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <button
                                  onClick={() => {
                                    const newOptions = selectedFieldData.options.filter((_, i) => i !== index);
                                    updateField(selectedField, { options: newOptions });
                                  }}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              const newOptions = [...(selectedFieldData.options || []), `Option ${(selectedFieldData.options?.length || 0) + 1}`];
                              updateField(selectedField, { options: newOptions });
                            }}
                            className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            + Add Option
                          </button>
                        </div>
                      )}

                    {selectedFieldData.type === 'rating' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Maximum Rating</label>
                        <select
                          value={selectedFieldData.maxRating || 5}
                          onChange={(e) => updateField(selectedField, { maxRating: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="3">3 Stars</option>
                          <option value="5">5 Stars</option>
                          <option value="10">10 Stars</option>
                        </select>
                      </div>
                    )}

                    {selectedFieldData.type === 'grid' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Number of Columns</label>
                        <select
                          value={selectedFieldData.columns || 2}
                          onChange={(e) => updateField(selectedField, { columns: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="1">1 Column</option>
                          <option value="2">2 Columns</option>
                          <option value="3">3 Columns</option>
                        </select>
                        <p className="mt-2 text-xs text-slate-500">Grid layout creates responsive columns for organizing fields</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Full Preview Mode - With Theme & Layout Support */
            <div
              className="flex-1 overflow-y-auto py-8 px-4"
              style={{
                backgroundColor: formTheme.backgroundColor,
                fontFamily: formTheme.fontFamily
              }}
            >
              <div className="max-w-3xl mx-auto">
                {/* Multi-step Progress Indicator */}
                {steps.length > 1 && (
                  <div
                    className="rounded-lg shadow-sm p-6 mb-6"
                    style={{ backgroundColor: formTheme.cardBackgroundColor }}
                  >
                    <div className="flex items-center justify-between">
                      {steps.map((step, index) => (
                        <React.Fragment key={step.id}>
                          <div className="flex flex-col items-center">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                              style={{
                                backgroundColor: index === currentPreviewStep
                                  ? formTheme.primaryColor
                                  : index < currentPreviewStep
                                    ? formTheme.buttonColor
                                    : '#e2e8f0',
                                color: index <= currentPreviewStep ? '#ffffff' : '#64748b',
                                transform: index === currentPreviewStep ? 'scale(1.1)' : 'scale(1)'
                              }}
                            >
                              {index < currentPreviewStep ? '✓' : index + 1}
                            </div>
                            <span
                              className="text-xs mt-2 font-medium"
                              style={{
                                color: index === currentPreviewStep ? formTheme.primaryColor : '#64748b'
                              }}
                            >
                              {step.title}
                            </span>
                          </div>
                          {index < steps.length - 1 && (
                            <div
                              className="flex-1 h-1 mx-2 rounded transition-all"
                              style={{
                                backgroundColor: index < currentPreviewStep ? formTheme.buttonColor : '#e2e8f0'
                              }}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                {/* Form Card with Theme & Layout */}
                <div
                  className="rounded-lg shadow-sm p-8"
                  style={{ backgroundColor: formTheme.cardBackgroundColor }}
                >
                  <h1
                    className="text-3xl font-bold mb-2"
                    style={{ color: formTheme.textColor }}
                  >{formTitle}</h1>
                  {formDescription && (
                    <p className="mb-6" style={{ color: '#64748b' }}>{formDescription}</p>
                  )}

                  {/* Current Step Title (for multi-step forms) */}
                  {steps.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <h2
                        className="text-xl font-semibold mb-4"
                        style={{ color: formTheme.primaryColor }}
                      >
                        {steps[currentPreviewStep]?.title}
                      </h2>
                    </div>
                  )}

                  {/* Current Step Fields with Layout */}
                  <div className={`space-y-6 ${formLayout === '2-column' ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' :
                      formLayout === '3-column' ? 'md:grid md:grid-cols-3 md:gap-4 md:space-y-0' :
                        ''
                    }`}>
                    {steps[currentPreviewStep]?.fields.map((field) => (
                      <div key={field.id}>
                        {renderFieldPreview(field)}
                      </div>
                    ))}
                  </div>

                  {/* Navigation Buttons with Theme */}

                  <div className={`flex pt-6 border-t border-slate-200 ${currentPreviewStep === 0 ? 'justify-end' : 'justify-between'
                    }`}>
                    {currentPreviewStep > 0 && (
                      <button
                        type="button"
                        onClick={() => setCurrentPreviewStep(prev => Math.max(prev - 1, 0))}
                        className="px-6 py-2 border rounded-md text-sm font-medium transition-colors"
                        style={{
                          borderColor: '#cbd5e1',
                          color: formTheme.textColor,
                          backgroundColor: 'transparent'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <ChevronLeft className="h-4 w-4 inline mr-1" />
                        {formTheme.previousButtonText}
                      </button>
                    )}

                    {currentPreviewStep < steps.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentPreviewStep(prev => Math.min(prev + 1, steps.length - 1))}
                        className="px-6 py-2 rounded-md text-sm font-medium transition-colors"
                        style={{ 
                          backgroundColor: formTheme.primaryColor,
                          color: formTheme.buttonTextColor
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        {formTheme.nextButtonText}
                        <ChevronRight className="h-4 w-4 inline ml-1" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="px-8 py-3 rounded-md font-medium transition-colors"
                        style={{ 
                          backgroundColor: formTheme.buttonColor,
                          color: formTheme.buttonTextColor
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        {formTheme.submitButtonText}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drag Overlay for visual feedback */}
        <DragOverlay>
          {activeId ? (
            <div className="border-2 border-indigo-500 bg-indigo-50 rounded-lg p-4 shadow-2xl opacity-90">
              <div className="flex items-start space-x-3">
                <GripVertical className="h-5 w-5 text-slate-400" />
                <div className="flex-1">
                  {currentFields.find(f => f.id === activeId) &&
                    renderFieldPreview(currentFields.find(f => f.id === activeId))}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Green ai button*/}
      {/* {!showPreview && !showAIFormCreator && (
        <button
          onClick={() => setShowAIFormCreator(true)}
          className="fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white rounded-full shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-110 flex items-center justify-center z-50"
          title="AI Form Creator"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}  */}

      {/* AI Assistant Floating Button */}
      {!showPreview && !showAIFormCreator && (
        <button
          onClick={() => setShowAIPanel(!showAIPanel)}
          className={`fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 flex items-center justify-center z-50 ${showAIPanel ? 'rotate-180' : 'rotate-0'
            }`}
          title="AI Assistant"
        >
          <Sparkles className={`h-6 w-6 transition-transform duration-300 ${showAIPanel ? 'scale-0' : 'scale-100'}`} />
          <X className={`h-6 w-6 absolute transition-transform duration-300 ${showAIPanel ? 'scale-100' : 'scale-0'}`} />
        </button>
      )}

      {/* AI Assistant Panel - Conversational */}
      {showAIPanel && (
        <div className="fixed right-6 bottom-24 w-[420px] h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-40 animate-slide-up">
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm animate-pulse">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold">Form Builder AI</h3>
                <p className="text-xs text-purple-100">Your conversational assistant</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIPanel(false)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-white" style={{ height: 'calc(100% - 180px)' }}>
            {aiConversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="h-10 w-10 text-indigo-600" />
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-purple-600" />
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Hi! I'm your Form Builder AI 👋</h4>
                  <p className="text-sm text-slate-600 mb-6 max-w-xs mx-auto">
                    I'm here to help you build amazing forms! Just chat with me naturally - ask questions, request changes, or brainstorm ideas.
                  </p>
                  <div className="space-y-2 text-xs text-slate-600 w-full max-w-sm">
                    <p className="font-semibold text-slate-700 mb-3">Try asking me:</p>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                      💡 "What kind of form should I create?"
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                      ✨ "Add email and phone fields"
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                      🎨 "How can I make this better?"
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                      📋 "Help me create a contact form"
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {aiConversation.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl shadow-sm ${msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                        }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {aiLoading && (
              <div className="flex items-center space-x-3 mt-4 p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-sm text-slate-600">AI is thinking...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="px-4 sm:px-5 py-4 border-t border-slate-200 bg-white sm:rounded-b-2xl">
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !aiLoading && aiPrompt.trim() && handleAIGenerate()}
                placeholder="Type your request here..."
                disabled={aiLoading}
                className="flex-1 px-3 sm:px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all"
              />
              <button
                onClick={handleVoiceCommand}
                className={`p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 ${isRecordingVoice
                    ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-105'
                  }`}
                title="Voice Command"
              >
                {isRecordingVoice ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                className="p-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl flex-shrink-0"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 flex items-center flex-wrap">
              <span className="inline-flex items-center">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Press Enter to send
              </span>
              <span className="mx-2 hidden sm:inline">•</span>
              <span className="hidden sm:inline">Use 🎤 for voice commands</span>
            </p>
        </div>
      </div>
)}

{/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Publish Form</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to publish this form? Once published, it will be accessible via a public link.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || !areAllFieldsMapped()}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  areAllFieldsMapped() 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                } disabled:opacity-50`}
                title={!areAllFieldsMapped() ? 'Map all fields to CRM before publishing' : ''}
              >
                {publishing ? 'Publishing...' : 'Yes, Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Form Creator - Conversational Interface */}
      {showAIFormCreator && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white px-6 py-5 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">AI Form Creator</h3>
                  <p className="text-sm text-emerald-100">Let's build your form together</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAIFormCreator(false);
                  setAiFormConversation([]);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
              {aiFormConversation.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h4 className="text-xl font-bold text-slate-900 mb-2">Let's Create Your Form!</h4>
                  <p className="text-slate-600 mb-6">I'll ask you a few questions to understand what you need.</p>
                  <button
                    onClick={() => startAIFormConversation()}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg"
                  >
                    Start Conversation
                  </button>
                </div>
              )}

              {aiFormConversation.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === 'user'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                        : 'bg-white border border-slate-200 text-slate-900'
                      }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex items-center space-x-2 mb-2">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-600">AI Assistant</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                    {/* Show suggested options if available */}
                    {message.options && message.options.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {message.options.map((option, optIndex) => (
                          <button
                            key={optIndex}
                            onClick={() => handleAIFormOption(option)}
                            className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm transition-colors"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {aiFormConversation.length > 0 && !aiFormConversation[aiFormConversation.length - 1].options && (
                <div className="flex justify-center">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            {aiFormConversation.length > 0 && (
              <div className="border-t bg-white px-6 py-4 rounded-b-2xl">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    placeholder="Type your response..."
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        handleAIFormUserInput(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    onClick={(e) => {
                      const input = e.target.previousSibling;
                      if (input.value.trim()) {
                        handleAIFormUserInput(input.value);
                        input.value = '';
                      }
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Field Detail View Modal */}
      {showFieldDetailView && selectedFieldForMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{selectedFieldForMapping.label}</h3>
                <p className="text-sm text-indigo-100">CRM Field Details</p>
              </div>
              <button
                onClick={() => {
                  setShowFieldDetailView(false);
                  setSelectedFieldForMapping(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Field Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Field Name</p>
                  <p className="text-sm font-medium text-slate-900">{selectedFieldForMapping.id}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Data Type</p>
                  <p className="text-sm font-medium text-slate-900">{selectedFieldForMapping.type}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Required</p>
                  <p className="text-sm font-medium text-slate-900">{selectedFieldForMapping.required ? 'Yes' : 'No'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Custom Field</p>
                  <p className="text-sm font-medium text-slate-900">{selectedFieldForMapping.is_custom ? 'Yes' : 'Standard'}</p>
                </div>
              </div>

              {/* Mapping Info */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-900 mb-3">Mapping Information</h4>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700 mb-2">
                    This field can be used to collect <span className="font-semibold">{selectedFieldForMapping.label}</span> data from your forms.
                  </p>
                  <p className="text-xs text-slate-500">
                    Field Type: {selectedFieldForMapping.type} •
                    {selectedFieldForMapping.required && ' Required Field •'}
                    {selectedFieldForMapping.is_custom && ' Custom Field'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-4">
                <button
                  onClick={() => {
                    handleAddPropertyAsField(selectedFieldForMapping);
                    setShowFieldDetailView(false);
                  }}
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add to Form
                </button>
                <button
                  onClick={() => {
                    handleAIMapSingleProperty(selectedFieldForMapping);
                    setShowFieldDetailView(false);
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-all flex items-center justify-center"
                >
                  <Sparkles className="h-5 w-5 mr-2" />
                  AI Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Customization Panel */}
      {showThemePanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h3 className="text-lg font-bold">Theme Customization</h3>
              <button
                onClick={() => setShowThemePanel(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Background Color</label>
                <input
                  type="color"
                  value={formTheme.backgroundColor}
                  onChange={(e) => setFormTheme({ ...formTheme, backgroundColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Card Background</label>
                <input
                  type="color"
                  value={formTheme.cardBackgroundColor}
                  onChange={(e) => setFormTheme({ ...formTheme, cardBackgroundColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Primary Color</label>
                <input
                  type="color"
                  value={formTheme.primaryColor}
                  onChange={(e) => setFormTheme({ ...formTheme, primaryColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Text Color</label>
                <input
                  type="color"
                  value={formTheme.textColor}
                  onChange={(e) => setFormTheme({ ...formTheme, textColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Button Color</label>
                <input
                  type="color"
                  value={formTheme.buttonColor}
                  onChange={(e) => setFormTheme({ ...formTheme, buttonColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Font Family</label>
                <select
                  value={formTheme.fontFamily}
                  onChange={(e) => setFormTheme({ ...formTheme, fontFamily: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value="Inter, system-ui, sans-serif">Inter</option>
                  <option value="'Roboto', sans-serif">Roboto</option>
                  <option value="'Open Sans', sans-serif">Open Sans</option>
                  <option value="'Lato', sans-serif">Lato</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Poppins', sans-serif">Poppins</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                </select>
              </div>

              {/* Button Labels Customization */}
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-slate-800">Button Labels</h4>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Submit Button Text</label>
                  <input
                    type="text"
                    value={formTheme.submitButtonText}
                    onChange={(e) => setFormTheme({ ...formTheme, submitButtonText: e.target.value })}
                    placeholder="Submit"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Next Button Text</label>
                  <input
                    type="text"
                    value={formTheme.nextButtonText}
                    onChange={(e) => setFormTheme({ ...formTheme, nextButtonText: e.target.value })}
                    placeholder="Next"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Previous Button Text</label>
                  <input
                    type="text"
                    value={formTheme.previousButtonText}
                    onChange={(e) => setFormTheme({ ...formTheme, previousButtonText: e.target.value })}
                    placeholder="Previous"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Button Text Color</label>
                  <input
                    type="color"
                    value={formTheme.buttonTextColor}
                    onChange={(e) => setFormTheme({ ...formTheme, buttonTextColor: e.target.value })}
                    className="w-full h-10 rounded border border-slate-300"
                  />
                  <p className="text-xs text-slate-500 mt-1">Color of text on buttons (default: white)</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center rounded-b-lg">
              <p className="text-xs text-slate-600">Changes apply instantly</p>
              <button
                onClick={() => setShowThemePanel(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layout Options Panel */}
      {showLayoutPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h3 className="text-lg font-bold">Form Layout</h3>
              <button
                onClick={() => setShowLayoutPanel(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 mb-4">Choose how fields are arranged in your form</p>

              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => {
                    setFormLayout('1-column');
                    // toast.success('Layout: 1 Column');
                  }}
                  className={`p-4 border-2 rounded-lg transition-all ${formLayout === '1-column'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="space-y-2 mb-3">
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                  </div>
                  <p className="text-xs font-medium text-center">1 Column</p>
                </button>

                <button
                  onClick={() => {
                    setFormLayout('2-column');
                    // toast.success('Layout: 2 Columns');
                  }}
                  className={`p-4 border-2 rounded-lg transition-all ${formLayout === '2-column'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="grid grid-cols-2 gap-1 mb-3">
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                  </div>
                  <p className="text-xs font-medium text-center">2 Columns</p>
                </button>

                <button
                  onClick={() => {
                    setFormLayout('3-column');
                    // toast.success('Layout: 3 Columns');
                  }}
                  className={`p-4 border-2 rounded-lg transition-all ${formLayout === '3-column'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="grid grid-cols-3 gap-1 mb-3">
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                    <div className="h-2 bg-slate-300 rounded"></div>
                  </div>
                  <p className="text-xs font-medium text-center">3 Columns</p>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center rounded-b-lg">
              <p className="text-xs text-slate-600">Layout applies instantly</p>
              <button
                onClick={() => setShowLayoutPanel(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Share Form</h3>
            <p className="text-slate-600 mb-4">
              Share this public link. No login required.
            </p>
            <div className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={shareableLink}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm bg-slate-50"
              />
              <button
                onClick={copyShareLink}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormEditorPro;
