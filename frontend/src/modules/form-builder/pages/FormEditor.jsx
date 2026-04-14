/**
 * Form Editor with Drag-and-Drop and AI Voice Assistant
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Plus, Trash2, Save, Eye, ArrowLeft, Mic, MicOff, 
  Sparkles, GripVertical, Settings as SettingsIcon, Share2 
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import * as FormService from '../services/formBuilderService';
import { v4 as uuidv4 } from 'uuid';

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: '📝' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'phone', label: 'Phone', icon: '📱' },
  { value: 'number', label: 'Number', icon: '🔢' },
  { value: 'textarea', label: 'Text Area', icon: '📄' },
  { value: 'select', label: 'Dropdown', icon: '▼' },
  { value: 'multiselect', label: 'Multi-Select', icon: '☑️' },
  { value: 'checkbox', label: 'Checkbox', icon: '✓' },
  { value: 'radio', label: 'Radio Buttons', icon: '⚪' },
  { value: 'date', label: 'Date Picker', icon: '📅' },
  { value: 'file', label: 'File Upload', icon: '📎' },
  { value: 'image', label: 'Image Upload', icon: '🖼️' },
  { value: 'signature', label: 'Signature', icon: '✍️' },
  { value: 'rating', label: 'Rating', icon: '⭐' },
  { value: 'section', label: 'Section Header', icon: '🔖' },
  { value: 'divider', label: 'Divider', icon: '➖' },
  { value: 'grid', label: 'Grid Layout', icon: '📐' }
];

const FormEditor = () => {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [formTitle, setFormTitle] = useState('Untitled Form');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareableLink, setShareableLink] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (formId) {
      loadForm();
    }
  }, [formId]);

  const loadForm = async () => {
    try {
      const form = await FormService.getForm(formId);
      setFormTitle(form.title);
      setFormDescription(form.description || '');
      setFields(form.fields || []);
      // Set shareable link if form is published
      if (form.is_published && form.public_url) {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
        setShareableLink(`${window.location.origin}/form/${formId}`);
      }
    } catch (error) {
      console.error('Error loading form:', error);
      alert('Failed to load form');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = {
        title: formTitle,
        description: formDescription,
        fields: fields
      };

      if (formId) {
        await FormService.updateForm(formId, formData);
        alert('Form saved successfully!');
      } else {
        const newForm = await FormService.createForm(formData);
        navigate(`/form-builder/editor/${newForm.id}`);
        alert('Form created successfully!');
      }
    } catch (error) {
      console.error('Error saving form:', error);
      alert('Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  const addField = (type) => {
    const newField = {
      id: uuidv4(),
      type: type,
      label: `New ${FIELD_TYPES.find(t => t.value === type)?.label || 'Field'}`,
      placeholder: '',
      required: false,
      options: (type === 'select' || type === 'radio' || type === 'checkbox' || type === 'multiselect') ? ['Option 1', 'Option 2'] : null,
      order: fields.length,
      // Rating specific
      maxRating: type === 'rating' ? 5 : null,
      // Grid specific
      columns: type === 'grid' ? 2 : null,
      gridFields: type === 'grid' ? [] : null
    };
    setFields([...fields, newField]);
    setSelectedField(newField.id);
  };

  const updateField = (fieldId, updates) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const deleteField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(fields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedFields = items.map((field, index) => ({
      ...field,
      order: index
    }));
    setFields(updatedFields);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      alert('Please enter a prompt for the AI');
      return;
    }

    setAiLoading(true);
    setAiResponse('');
    try {
      const result = await FormService.generateFormWithAI(aiPrompt, fields);
      if (result.fields && result.fields.length > 0) {
        setFields([...fields, ...result.fields]);
        setAiResponse(result.suggestion || 'Fields added successfully!');
        setAiPrompt('');
      }
    } catch (error) {
      console.error('Error generating with AI:', error);
      alert('Failed to generate form with AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handlePublish = async () => {
    // Auto-save before publishing
    try {
      const formData = {
        title: formTitle,
        description: formDescription,
        fields: fields
      };

      if (formId) {
        await FormService.updateForm(formId, formData);
      }

      // Now publish
      setPublishing(true);
      const result = await FormService.publishForm(formId);
      setShareableLink(result.shareable_link);
      setShowPublishModal(false);
      setShowShareModal(true);
      alert('Form published successfully!');
      // Reload form to update published status
      await loadForm();
    } catch (error) {
      console.error('Error publishing form:', error);
      alert('Failed to publish form');
    } finally {
      setPublishing(false);
    }
  };

  const copyShareLink = () => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      alert('Link copied to clipboard!');
    }
  };

  const selectedFieldData = fields.find(f => f.id === selectedField);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/form-builder')}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600" />
              </button>
              <div>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="text-xl font-bold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0"
                  placeholder="Form Title"
                />
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="text-sm text-slate-500 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Form description (optional)"
                />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4 inline mr-2" />
                {showPreview ? 'Edit' : 'Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4 inline mr-2" />
                {saving ? 'Saving...' : 'Save Form'}
              </button>
              {formId && (
                <>
                  <button
                    onClick={() => setShowPublishModal(true)}
                    disabled={publishing}
                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    <Eye className="h-4 w-4 inline mr-2" />
                    {publishing ? 'Publishing...' : 'Publish'}
                  </button>
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Share2 className="h-4 w-4 inline mr-2" />
                    Share
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPreview ? (
        // Preview Mode
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{formTitle}</h2>
            {formDescription && <p className="text-slate-600 mb-6">{formDescription}</p>}
            
            <div className="space-y-6">
              {fields.map((field) => {
                // Section Header - just display as h3
                if (field.type === 'section') {
                  return (
                    <h3 key={field.id} className="text-lg font-semibold text-slate-900 mt-6 mb-2">
                      {field.label}
                    </h3>
                  );
                }
                
                // Divider - just display as hr
                if (field.type === 'divider') {
                  return <hr key={field.id} className="my-6 border-slate-300" />;
                }
                
                // Regular fields
                return (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    
                    {field.type === 'textarea' ? (
                      <textarea
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        rows={4}
                      />
                    ) : field.type === 'select' ? (
                      <select className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="">Select...</option>
                        {field.options?.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'multiselect' ? (
                      <div className="border border-slate-300 rounded-md p-2 space-y-2">
                        {field.options?.map((opt, i) => (
                          <label key={i} className="flex items-center">
                            <input type="checkbox" className="mr-2" />
                            <span className="text-sm text-slate-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : field.type === 'radio' ? (
                      <div className="space-y-2">
                        {field.options?.map((opt, i) => (
                          <label key={i} className="flex items-center">
                            <input type="radio" name={field.id} className="mr-2" />
                            <span className="text-sm text-slate-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : field.type === 'checkbox' ? (
                      <div className="space-y-2">
                        {field.options?.map((opt, i) => (
                          <label key={i} className="flex items-center">
                            <input type="checkbox" className="mr-2" />
                            <span className="text-sm text-slate-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : field.type === 'rating' ? (
                      <div className="flex items-center space-x-1">
                        {[...Array(field.maxRating || 5)].map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            className="text-2xl text-slate-300 hover:text-yellow-400 transition-colors"
                          >
                            ⭐
                          </button>
                        ))}
                      </div>
                    ) : field.type === 'grid' ? (
                      <div className={`grid gap-4 ${
                        field.columns === 1 ? 'grid-cols-1' :
                        field.columns === 2 ? 'grid-cols-2' :
                        'grid-cols-3'
                      }`}>
                        {field.gridFields?.map((gf, i) => (
                          <div key={i}>
                            <input
                              type="text"
                              placeholder={`Grid field ${i + 1}`}
                              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            
            <button className="mt-8 w-full px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700">
              Submit
            </button>
          </div>
        </div>
      ) : (
        // Editor Mode
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Field Types & AI */}
          <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
            {/* AI Assistant */}
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center">
                  <Sparkles className="h-4 w-4 mr-2 text-indigo-600" />
                  AI Assistant
                </h3>
              </div>
              
              <div className="space-y-3">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe the form you want to create... e.g., 'Add email and phone fields'"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
                <button
                  onClick={handleAIGenerate}
                  disabled={aiLoading}
                  className="w-full px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {aiLoading ? 'Generating...' : 'Generate with AI'}
                </button>
                {aiResponse && (
                  <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                    {aiResponse}
                  </div>
                )}
              </div>
            </div>

            {/* Field Types */}
            <div className="p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Add Fields</h3>
              <div className="grid grid-cols-2 gap-2">
                {FIELD_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => addField(type.value)}
                    className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 text-left"
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Center Panel - Form Builder */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm p-6 min-h-96">
                {fields.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Plus className="h-12 w-12 mx-auto mb-4" />
                    <p>Add fields from the left panel or use AI to generate your form</p>
                  </div>
                ) : (
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="form-fields">
                      {(provided, snapshot) => (
                        <div 
                          {...provided.droppableProps} 
                          ref={provided.innerRef} 
                          className={`space-y-3 min-h-[200px] ${snapshot.isDraggingOver ? 'bg-indigo-50' : ''}`}
                        >
                          {fields.map((field, index) => (
                            <Draggable key={field.id} draggableId={field.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`border rounded-lg p-4 bg-white ${
                                    selectedField === field.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'
                                  } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                  onClick={() => setSelectedField(field.id)}
                                >
                                  <div className="flex items-start justify-between">
                                    <div {...provided.dragHandleProps} className="mr-3 mt-1 cursor-grab active:cursor-grabbing">
                                      <GripVertical className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-2">
                                        <input
                                          type="text"
                                          value={field.label}
                                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                                          className="font-medium text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                            {FIELD_TYPES.find(t => t.value === field.type)?.label}
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteField(field.id);
                                            }}
                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                      <input
                                        type={field.type === 'textarea' ? 'text' : field.type}
                                        placeholder={field.placeholder || 'Placeholder'}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                                        disabled
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Field Properties */}
          {selectedFieldData && (
            <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Field Settings</h3>
                <button onClick={() => setSelectedField(null)} className="text-slate-400 hover:text-slate-600">
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
                  <input
                    type="text"
                    value={selectedFieldData.label}
                    onChange={(e) => updateField(selectedField, { label: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Placeholder</label>
                  <input
                    type="text"
                    value={selectedFieldData.placeholder || ''}
                    onChange={(e) => updateField(selectedField, { placeholder: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedFieldData.required}
                    onChange={(e) => updateField(selectedField, { required: e.target.checked })}
                    className="mr-2"
                  />
                  <label className="text-sm font-medium text-slate-700">Required Field</label>
                </div>

                {(selectedFieldData.type === 'select' || selectedFieldData.type === 'radio' || selectedFieldData.type === 'checkbox' || selectedFieldData.type === 'multiselect') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Options</label>
                    {selectedFieldData.options?.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2 mb-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...selectedFieldData.options];
                            newOptions[index] = e.target.value;
                            updateField(selectedField, { options: newOptions });
                          }}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                        />
                        <button
                          onClick={() => {
                            const newOptions = selectedFieldData.options.filter((_, i) => i !== index);
                            updateField(selectedField, { options: newOptions });
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newOptions = [...(selectedFieldData.options || []), `Option ${(selectedFieldData.options?.length || 0) + 1}`];
                        updateField(selectedField, { options: newOptions });
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      + Add Option
                    </button>
                  </div>
                )}

                {selectedFieldData.type === 'rating' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Maximum Rating</label>
                    <select
                      value={selectedFieldData.maxRating || 5}
                      onChange={(e) => updateField(selectedField, { maxRating: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                    </select>
                  </div>
                )}

                {selectedFieldData.type === 'grid' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Grid Columns</label>
                    <select
                      value={selectedFieldData.columns || 2}
                      onChange={(e) => updateField(selectedField, { columns: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="1">1 Column</option>
                      <option value="2">2 Columns</option>
                      <option value="3">3 Columns</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Publish Confirmation Modal */}
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
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Yes, Publish'}
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
              Share this public link with anyone. No login required.
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
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

export default FormEditor;
