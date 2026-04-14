/**
 * Survey Builder V2 - Professional Survey Builder matching Form Builder layout
 * Features: Multi-page surveys, AI Assistant, Drag-drop with @dnd-kit
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Save, Eye, ArrowLeft, Share2, Copy,
  GripVertical, X, Sparkles, Mic, MicOff, Send, Settings as SettingsIcon
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
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
import surveyService from '../services/surveyService';
import { v4 as uuidv4 } from 'uuid';

// Question Type Categories
const QUESTION_TYPES = {
  basic: [
    { value: 'short_text', label: 'Short Text', icon: '📝', category: 'basic' },
    { value: 'long_text', label: 'Long Text', icon: '📄', category: 'basic' },
    { value: 'email', label: 'Email', icon: '📧', category: 'basic' },
    { value: 'phone', label: 'Phone', icon: '📱', category: 'basic' },
    { value: 'date', label: 'Date', icon: '📅', category: 'basic' },
  ],
  choice: [
    { value: 'multiple_choice', label: 'Multiple Choice', icon: '⚪', category: 'choice' },
    { value: 'checkbox', label: 'Checkboxes', icon: '☑️', category: 'choice' },
    { value: 'dropdown', label: 'Dropdown', icon: '▼', category: 'choice' },
    { value: 'yes_no', label: 'Yes/No', icon: '✓', category: 'choice' },
  ],
  rating: [
    { value: 'rating', label: 'Star Rating', icon: '⭐', category: 'rating' },
    { value: 'nps', label: 'NPS Score', icon: '📊', category: 'rating' },
    { value: 'likert', label: 'Likert Scale', icon: '📏', category: 'rating' },
  ],
  advanced: [
    { value: 'matrix', label: 'Matrix Grid', icon: '📐', category: 'advanced' },
    { value: 'file_upload', label: 'File Upload', icon: '📎', category: 'advanced' },
    { value: 'page_break', label: 'Page Break', icon: '➖', category: 'advanced' },
  ]
};

const ALL_QUESTION_TYPES = [
  ...QUESTION_TYPES.basic,
  ...QUESTION_TYPES.choice,
  ...QUESTION_TYPES.rating,
  ...QUESTION_TYPES.advanced
];

// Draggable Question Type Item
const DraggableQuestionItem = ({ question }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${question.value}`,
    data: {
      isNewQuestion: true,
      questionType: question.value
    }
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`w-full px-3 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 flex items-center space-x-2 transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="text-base">{question.icon}</span>
      <span className="flex-1 text-left truncate">{question.label}</span>
      <GripVertical className="h-3 w-3 text-slate-400 flex-shrink-0" />
    </div>
  );
};

// Sortable Question Item
const SortableQuestionItem = ({ question, index, onEdit, onDelete, onDuplicate, isSelected }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border-2 rounded-lg p-4 mb-3 ${
        isSelected ? 'border-indigo-500 shadow-lg' : 'border-slate-200 hover:border-slate-300'
      } transition-all`}
      onClick={() => onEdit(index)}
    >
      <div className="flex items-start gap-3">
        <div {...attributes} {...listeners} className="cursor-move mt-1">
          <GripVertical className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-medium text-slate-900">{question.label}</h4>
              {question.description && (
                <p className="text-sm text-slate-600 mt-1">{question.description}</p>
              )}
              <span className="text-xs text-slate-500 mt-1 inline-block">
                {question.type.replace(/_/g, ' ')} • {question.required ? 'Required' : 'Optional'}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(index);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors"
                title="Duplicate"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(index);
                }}
                className="p-1.5 hover:bg-red-50 rounded-md transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </div>
          {/* Preview of options */}
          {question.options?.length > 0 && (
            <div className="space-y-1 mt-2">
              {question.options.slice(0, 3).map((opt, i) => (
                <div key={i} className="text-sm text-slate-600">
                  ○ {opt.label}
                </div>
              ))}
              {question.options.length > 3 && (
                <div className="text-sm text-slate-500">
                  + {question.options.length - 3} more options
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Droppable Canvas Component
const DroppableCanvas = ({ children, isOver }) => {
  const { setNodeRef, isOver: canvasIsOver } = useDroppable({
    id: 'survey-canvas',
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[600px] h-full transition-all duration-200 ${
        canvasIsOver || isOver
          ? 'bg-indigo-50 border-2 border-indigo-300 border-dashed rounded-lg shadow-lg'
          : 'bg-slate-50'
      }`}
    >
      {children}
    </div>
  );
};

const SurveyBuilder = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);

  // Survey State
  const [survey, setSurvey] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Theme & Layout State (Matching Form Builder)
  const [theme, setTheme] = useState({
    backgroundColor: '#f8fafc',
    cardBackgroundColor: '#ffffff',
    primaryColor: '#4f46e5',
    textColor: '#1e293b',
    buttonColor: '#10b981',
    fontFamily: 'Inter, system-ui, sans-serif'
  });
  const [layout, setLayout] = useState('1-column');
  const [showThemePanel, setShowThemePanel] = useState(false);
  
  // Distribution/Expiry State
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  
  // Multi-step support
  const [steps, setSteps] = useState([{ id: 'step_1', title: 'Step 1', questions: [] }]);
  const [currentPreviewStep, setCurrentPreviewStep] = useState(0);

  // AI Assistant State
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiConversation, setAiConversation] = useState([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (surveyId && surveyId !== 'new') {
      loadSurvey();
    }
  }, [surveyId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiConversation]);

  const loadSurvey = async () => {
    try {
      const data = await surveyService.getSurvey(surveyId);
      setSurvey(data);
      setTitle(data.title);
      setDescription(data.description || '');
      
      // Load steps or convert questions
      if (data.steps && data.steps.length > 0) {
        setSteps(data.steps);
        setQuestions(data.steps.flatMap(s => s.questions));
      } else if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setSteps([{ id: 'step_1', title: 'Step 1', questions: data.questions }]);
      }
      
      // Load theme
      if (data.settings?.theme) {
        setTheme(data.settings.theme);
      } else if (data.branding) {
        setTheme({
          backgroundColor: data.branding.backgroundColor || '#f8fafc',
          cardBackgroundColor: data.branding.cardBackgroundColor || '#ffffff',
          primaryColor: data.branding.primaryColor || '#4f46e5',
          textColor: data.branding.textColor || '#1e293b',
          buttonColor: data.branding.buttonColor || '#10b981',
          fontFamily: data.branding.fontFamily || 'Inter, system-ui, sans-serif'
        });
      }
      
      // Load layout
      if (data.settings?.layout) {
        setLayout(data.settings.layout);
      } else if (data.branding?.layout) {
        setLayout(data.branding.layout);
      }
    } catch (error) {
      console.error('Error loading survey:', error);
      toast.error('Failed to load survey');
    }
  };

  const saveSurvey = async () => {
    try {
      setSaving(true);
      
      // Organize questions into steps
      const updatedSteps = [{ id: 'step_1', title: 'Step 1', questions: questions }];
      
      const surveyData = {
        title: title || 'Untitled Survey',
        description,
        questions,
        steps: updatedSteps,
        settings: {
          theme: theme,
          layout: layout
        },
        branding: theme
      };

      if (surveyId === 'new' || !survey) {
        const newSurvey = await surveyService.createSurvey(surveyData);
        navigate(`/survey-builder-v2/builder/${newSurvey.id}`, { replace: true });
        toast.success('Survey created successfully!');
      } else {
        await surveyService.updateSurvey(surveyId, surveyData);
        await loadSurvey();
        toast.success('Survey saved successfully!');
      }
    } catch (error) {
      console.error('Error saving survey:', error);
      toast.error('Failed to save survey');
    } finally {
      setSaving(false);
    }
  };


  // Render preview question (matching public view)
  const renderPreviewQuestion = (question) => {
    switch (question.type) {
      case 'short_text':
      case 'email':
      case 'phone':
        return (
          <input
            type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
            placeholder="Your answer"
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
            disabled
          />
        );

      case 'long_text':
        return (
          <textarea
            placeholder="Your answer"
            className="w-full px-4 py-2 border rounded-lg min-h-[100px]"
            style={{ borderColor: theme.primaryColor + '40' }}
            disabled
          />
        );

      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(question.options || []).map((option) => (
              <label key={option.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  disabled
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {(question.options || []).map((option) => (
              <label key={option.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  disabled
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'dropdown':
        return (
          <select
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
            disabled
          >
            <option value="">Select an option</option>
            {(question.options || []).map((option) => (
              <option key={option.id} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'rating':
        return (
          <div className="flex gap-2">
            {Array.from({ length: question.max_value || 5 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                type="button"
                disabled
                className="w-12 h-12 rounded-full border-2 font-medium"
                style={{
                  borderColor: '#d1d5db',
                  color: theme.textColor
                }}
              >
                ★
              </button>
            ))}
          </div>
        );

      case 'nps':
        return (
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => i).map((num) => (
              <button
                key={num}
                type="button"
                disabled
                className="w-10 h-10 rounded border-2 font-medium"
                style={{
                  borderColor: '#d1d5db',
                  color: theme.textColor
                }}
              >
                {num}
              </button>
            ))}
          </div>
        );

      case 'yes_no':
        return (
          <div className="flex gap-4">
            <button
              type="button"
              disabled
              className="flex-1 py-3 rounded-lg border-2 font-medium"
              style={{
                borderColor: '#d1d5db',
                color: theme.textColor
              }}
            >
              Yes
            </button>
            <button
              type="button"
              disabled
              className="flex-1 py-3 rounded-lg border-2 font-medium"
              style={{
                borderColor: '#d1d5db',
                color: theme.textColor
              }}
            >
              No
            </button>
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
            disabled
          />
        );

      case 'file_upload':
        return (
          <input
            type="file"
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: theme.primaryColor + '40' }}
            disabled
          />
        );

      case 'likert':
        return (
          <div className="space-y-3">
            {(question.likert_labels || ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']).map((label, idx) => (
              <label key={idx} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  disabled
                  className="w-4 h-4"
                  style={{ accentColor: theme.primaryColor }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        );

      case 'matrix':
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 bg-gray-50"></th>
                  {(question.matrix_columns || ['Column 1', 'Column 2']).map((col, idx) => (
                    <th key={idx} className="border p-2 bg-gray-50 text-sm font-medium" style={{ color: theme.textColor }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(question.matrix_rows || ['Row 1', 'Row 2']).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="border p-2 font-medium text-sm" style={{ color: theme.textColor }}>{row}</td>
                    {(question.matrix_columns || ['Column 1', 'Column 2']).map((col, colIdx) => (
                      <td key={colIdx} className="border p-2 text-center">
                        <input
                          type="radio"
                          name={`${question.id}_${row}`}
                          disabled
                          className="w-4 h-4"
                          style={{ accentColor: theme.primaryColor }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'page_break':
        return (
          <div className="border-t-4 border-dashed border-gray-300 py-4 text-center">
            <span className="text-sm text-gray-500 bg-white px-4 py-2 rounded-full border">
              Page Break
            </span>
          </div>
        );

      default:
        return (
          <div className="text-sm italic text-gray-500">
            [{question.type.replace(/_/g, ' ')} preview]
          </div>
        );
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    // Check if it's a new question from palette
    if (active.data.current?.isNewQuestion) {
      const questionType = active.data.current.questionType;
      let insertIndex = questions.length; // default end

      if (over.id === 'survey-canvas') {
        // Dropped on canvas, add to end
        insertIndex = questions.length;
      } else if (over && questions.some(q => q.id === over.id)) {
        // Dropped on existing question, insert before it
        const targetIndex = questions.findIndex(q => q.id === over.id);
        insertIndex = targetIndex;
      }

      addQuestion(questionType, insertIndex);
    } else if (active.id !== over.id) {
      // Reordering existing questions
      setQuestions((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, idx) => ({ ...item, order: idx }));
      });
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const addQuestion = (type, insertIndex = null) => {
    const newQuestion = {
      id: uuidv4(),
      type,
      label: `New ${type.replace(/_/g, ' ')} question`,
      description: '',
      required: false,
      order: insertIndex !== null ? insertIndex : questions.length,
      page: 1,
      options: ['multiple_choice', 'checkbox', 'dropdown'].includes(type)
        ? [
            { id: uuidv4(), label: 'Option 1', value: 'option_1' },
            { id: uuidv4(), label: 'Option 2', value: 'option_2' }
          ]
        : [],
      min_value: type === 'rating' ? 1 : 0,
      max_value: type === 'rating' ? 5 : type === 'nps' ? 10 : 5,
      matrix_rows: type === 'matrix' ? ['Row 1', 'Row 2', 'Row 3'] : [],
      matrix_columns: type === 'matrix' ? ['Column 1', 'Column 2', 'Column 3'] : [],
    };

    if (insertIndex !== null && insertIndex >= 0 && insertIndex <= questions.length) {
      // Insert at specific position
      const newQuestions = [...questions];
      newQuestions.splice(insertIndex, 0, newQuestion);
      // Update order for all questions
      const updatedQuestions = newQuestions.map((q, idx) => ({ ...q, order: idx }));
      setQuestions(updatedQuestions);
      setSelectedQuestionIndex(insertIndex);
    } else {
      // Add to end (fallback)
      setQuestions([...questions, newQuestion]);
      setSelectedQuestionIndex(questions.length);
    }

    toast.success('Question added!');
  };

  const updateQuestion = (index, updates) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], ...updates };
    setQuestions(updated);
  };

  const deleteQuestion = (index) => {
    if (window.confirm('Delete this question?')) {
      setQuestions(questions.filter((_, i) => i !== index));
      setSelectedQuestionIndex(null);
      toast.success('Question deleted');
    }
  };

  const duplicateQuestion = (index) => {
    const newQuestion = {
      ...questions[index],
      id: uuidv4(),
      order: questions.length,
    };
    setQuestions([...questions, newQuestion]);
    toast.success('Question duplicated!');
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;

    const userMessage = aiPrompt.trim();
    setAiConversation([...aiConversation, { role: 'user', content: userMessage }]);
    setAiPrompt('');
    setAiLoading(true);

    try {
      const result = await surveyService.aiCommand(userMessage, surveyId !== 'new' ? surveyId : null);

      let aiResponse = result.message || 'I processed your request!';

      // Handle different actions
      if (result.action === 'add_question' && result.data?.questions) {
        const newQuestions = result.data.questions.map(q => ({
          ...q,
          id: q.id || uuidv4(),
          order: questions.length + (result.data.questions.indexOf(q))
        }));
        setQuestions([...questions, ...newQuestions]);
        aiResponse = `Added ${newQuestions.length} question(s) to your survey!`;
      } else if (result.action === 'create_survey' && result.data) {
        if (result.data.title) setTitle(result.data.title);
        if (result.data.description) setDescription(result.data.description);
        if (result.data.questions) {
          const newQuestions = result.data.questions.map((q, idx) => ({
            ...q,
            id: q.id || uuidv4(),
            order: idx
          }));
          setQuestions(newQuestions);
        }
        aiResponse = result.message || 'Survey structure created!';
      } else if (result.action === 'theme_update' && result.data?.theme) {
        setTheme({...theme, ...result.data.theme});
        aiResponse = result.message || 'Theme updated!';
      } else if (result.action === 'layout_change' && result.data?.layout) {
        setTheme({...theme, layout: result.data.layout});
        aiResponse = result.message || `Layout changed to ${result.data.layout}`;
      } else if (result.action === 'delete_question' && result.data?.question_index !== undefined) {
        setQuestions(questions.filter((_, i) => i !== result.data.question_index));
        aiResponse = result.message || 'Question deleted!';
      } else if (result.action === 'edit_question' && result.data?.question_index !== undefined) {
        const updated = [...questions];
        updated[result.data.question_index] = {...updated[result.data.question_index], ...result.data.updates};
        setQuestions(updated);
        aiResponse = result.message || 'Question updated!';
      }

      setAiConversation((prev) => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('Error with AI:', error);
      setAiConversation((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!survey || !survey.id) {
      toast.error('Please save the survey first');
      return;
    }
    try {
      await saveSurvey();
      const result = await surveyService.publishSurvey(survey.id);
      toast.success(`Survey published! Link: ${window.location.origin}${result.public_url}`);
      await loadSurvey();
    } catch (error) {
      console.error('Error publishing:', error);
      toast.error('Failed to publish survey');
    }
  };


  const handleToggleExpiry = async () => {
    if (!survey || !survey.id) {
      toast.error('Please save the survey first');
      return;
    }
    try {
      const result = await surveyService.toggleSurveyExpiry(survey.id);
      setIsExpired(result.is_expired);
      toast.success(result.is_expired ? 'Survey expired' : 'Survey unexpired');
      await loadSurvey();
    } catch (error) {
      console.error('Error toggling expiry:', error);
      toast.error('Failed to toggle expiry');
    }
  };

  const handleSaveExpiryDate = async () => {
    if (!survey || !survey.id) {
      toast.error('Please save the survey first');
      return;
    }
    try {
      await surveyService.updateSurvey(survey.id, {
        distribution: {
          ...survey.distribution,
          close_date: expiryDate
        }
      });
      toast.success('Expiry date saved');
      setShowExpiryModal(false);
      await loadSurvey();
    } catch (error) {
      console.error('Error saving expiry date:', error);
      toast.error('Failed to save expiry date');
    }
  };


  const renderQuestionEditor = () => {
    if (selectedQuestionIndex === null || !questions[selectedQuestionIndex]) {
      return (
        <div className="flex items-center justify-center h-full text-slate-500">
          <div className="text-center">
            <SettingsIcon className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-sm">Select a question to edit</p>
          </div>
        </div>
      );
    }

    const question = questions[selectedQuestionIndex];

    return (
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Question Label</label>
          <input
            type="text"
            value={question.label}
            onChange={(e) => updateQuestion(selectedQuestionIndex, { label: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter your question"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
          <input
            type="text"
            value={question.description || ''}
            onChange={(e) => updateQuestion(selectedQuestionIndex, { description: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Add helper text"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => updateQuestion(selectedQuestionIndex, { required: e.target.checked })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <label className="text-sm font-medium text-slate-700">Required question</label>
        </div>

        {/* Options for choice-based questions */}
        {['multiple_choice', 'checkbox', 'dropdown'].includes(question.type) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Options</label>
            <div className="space-y-2">
              {(question.options || []).map((option, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) => {
                      const newOptions = [...question.options];
                      newOptions[idx] = {
                        ...option,
                        label: e.target.value,
                        value: e.target.value.toLowerCase().replace(/\s/g, '_')
                      };
                      updateQuestion(selectedQuestionIndex, { options: newOptions });
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    placeholder={`Option ${idx + 1}`}
                  />
                  <button
                    onClick={() => {
                      const newOptions = question.options.filter((_, i) => i !== idx);
                      updateQuestion(selectedQuestionIndex, { options: newOptions });
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newOptions = [
                    ...(question.options || []),
                    {
                      id: uuidv4(),
                      label: `Option ${(question.options?.length || 0) + 1}`,
                      value: `option_${(question.options?.length || 0) + 1}`
                    }
                  ];
                  updateQuestion(selectedQuestionIndex, { options: newOptions });
                }}
                className="w-full px-3 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                + Add Option
              </button>
            </div>
          </div>
        )}

        {/* Rating/NPS config */}
        {['rating', 'nps'].includes(question.type) && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Min Value</label>
              <input
                type="number"
                value={question.min_value || 0}
                onChange={(e) => updateQuestion(selectedQuestionIndex, { min_value: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Max Value</label>
              <input
                type="number"
                value={question.max_value || (question.type === 'rating' ? 5 : 10)}
                onChange={(e) => updateQuestion(selectedQuestionIndex, { max_value: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </div>
        )}

        {/* Matrix configuration */}
        {question.type === 'matrix' && (
          <div className="space-y-4">
            {/* Row Labels */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Row Labels</label>
              <div className="space-y-2">
                {(question.matrix_rows || []).map((row, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={row}
                      onChange={(e) => {
                        const newRows = [...(question.matrix_rows || [])];
                        newRows[idx] = e.target.value;
                        updateQuestion(selectedQuestionIndex, { matrix_rows: newRows });
                      }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      placeholder={`Row ${idx + 1}`}
                    />
                    <button
                      onClick={() => {
                        const newRows = [...(question.matrix_rows || [])];
                        newRows.splice(idx + 1, 0, `Row ${newRows.length + 1}`);
                        updateQuestion(selectedQuestionIndex, { matrix_rows: newRows });
                      }}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="Clone row"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const newRows = (question.matrix_rows || []).filter((_, i) => i !== idx);
                        updateQuestion(selectedQuestionIndex, { matrix_rows: newRows });
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                      title="Delete row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newRows = [
                      ...(question.matrix_rows || []),
                      `Row ${(question.matrix_rows?.length || 0) + 1}`
                    ];
                    updateQuestion(selectedQuestionIndex, { matrix_rows: newRows });
                  }}
                  className="w-full px-3 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                >
                  + Add Row
                </button>
              </div>
            </div>

            {/* Column Labels */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Column Labels</label>
              <div className="space-y-2">
                {(question.matrix_columns || []).map((col, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => {
                        const newCols = [...(question.matrix_columns || [])];
                        newCols[idx] = e.target.value;
                        updateQuestion(selectedQuestionIndex, { matrix_columns: newCols });
                      }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      placeholder={`Column ${idx + 1}`}
                    />
                    <button
                      onClick={() => {
                        const newCols = [...(question.matrix_columns || [])];
                        newCols.splice(idx + 1, 0, `Column ${newCols.length + 1}`);
                        updateQuestion(selectedQuestionIndex, { matrix_columns: newCols });
                      }}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="Clone column"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const newCols = (question.matrix_columns || []).filter((_, i) => i !== idx);
                        updateQuestion(selectedQuestionIndex, { matrix_columns: newCols });
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                      title="Delete column"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newCols = [
                      ...(question.matrix_columns || []),
                      `Column ${(question.matrix_columns?.length || 0) + 1}`
                    ];
                    updateQuestion(selectedQuestionIndex, { matrix_columns: newCols });
                  }}
                  className="w-full px-3 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                >
                  + Add Column
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Toaster position="top-right" />

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <button
                onClick={() => navigate('/survey-builder-v2')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600" />
              </button>
              <div className="flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-semibold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Survey Title"
                />
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm text-slate-500 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Survey description (optional)"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center"
              >
                <Eye className="h-4 w-4 mr-1" />
                {showPreview ? 'Edit' : 'Preview'}
              </button>
              <button
                onClick={saveSurvey}
                disabled={saving}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center"
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              {survey?.id && (
                <>
                  <button
                    onClick={handlePublish}
                    className="px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    Publish
                  </button>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/survey-public/${survey.distribution?.public_link}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Link copied to clipboard!');
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center"
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </button>
                  <button
                    onClick={() => setShowExpiryModal(true)}
                    className="px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    ⏰ Expiry
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
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 flex overflow-hidden">
          {!showPreview ? (
            <>
              {/* Left Panel - Question Types Palette */}
              <div className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Question Types</h3>
                  <p className="text-xs text-slate-500 mt-1">Drag questions to canvas</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Basic Questions */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Basic</h4>
                    <div className="space-y-2">
                      {QUESTION_TYPES.basic.map((q) => (
                        <DraggableQuestionItem key={q.value} question={q} />
                      ))}
                    </div>
                  </div>

                  {/* Choice Questions */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Choice</h4>
                    <div className="space-y-2">
                      {QUESTION_TYPES.choice.map((q) => (
                        <DraggableQuestionItem key={q.value} question={q} />
                      ))}
                    </div>
                  </div>

                  {/* Rating Questions */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Rating</h4>
                    <div className="space-y-2">
                      {QUESTION_TYPES.rating.map((q) => (
                        <DraggableQuestionItem key={q.value} question={q} />
                      ))}
                    </div>
                  </div>

                  {/* Advanced Questions */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Advanced</h4>
                    <div className="space-y-2">
                      {QUESTION_TYPES.advanced.map((q) => (
                        <DraggableQuestionItem key={q.value} question={q} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Canvas - Survey Builder */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                <div className="max-w-3xl mx-auto">
                  <DroppableCanvas isOver={activeId && activeId.startsWith('palette-')}>
                    {questions.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-slate-300">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Plus className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Start Building Your Survey</h3>
                        <p className="text-slate-600 mb-4">Drag question types from the left or use AI assistant</p>
                        <button
                          onClick={() => setShowAIPanel(true)}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all inline-flex items-center"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Ask AI to Create Survey
                        </button>
                      </div>
                    ) : (
                      <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                        {questions.map((question, index) => (
                          <SortableQuestionItem
                            key={question.id}
                            question={question}
                            index={index}
                            onEdit={setSelectedQuestionIndex}
                            onDelete={deleteQuestion}
                            onDuplicate={duplicateQuestion}
                            isSelected={selectedQuestionIndex === index}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </DroppableCanvas>
                </div>
              </div>

              {/* Right Panel - Question Editor / Theme Panel */}
              <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
                <div className="border-b border-slate-200">
                  <div className="flex">
                    <button
                      onClick={() => setShowThemePanel(false)}
                      className={`flex-1 px-4 py-3 text-sm font-medium ${!showThemePanel ? 'bg-white text-slate-900 border-b-2 border-indigo-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                      Question
                    </button>
                    <button
                      onClick={() => setShowThemePanel(true)}
                      className={`flex-1 px-4 py-3 text-sm font-medium ${showThemePanel ? 'bg-white text-slate-900 border-b-2 border-indigo-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                      Theme & Layout
                    </button>
                  </div>
                </div>
                
                {showThemePanel ? (
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Layout Style</label>
                      <select
                        value={layout}
                        onChange={(e) => setLayout(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="1-column">1 Column</option>
                        <option value="2-column">2 Columns</option>
                        <option value="3-column">3 Columns</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Primary Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={theme.primaryColor}
                          onChange={(e) => setTheme({...theme, primaryColor: e.target.value})}
                          className="h-10 w-16 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={theme.primaryColor}
                          onChange={(e) => setTheme({...theme, primaryColor: e.target.value})}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Button Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={theme.buttonColor}
                          onChange={(e) => setTheme({...theme, buttonColor: e.target.value})}
                          className="h-10 w-16 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={theme.buttonColor}
                          onChange={(e) => setTheme({...theme, buttonColor: e.target.value})}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Background Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={theme.backgroundColor}
                          onChange={(e) => setTheme({...theme, backgroundColor: e.target.value})}
                          className="h-10 w-16 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={theme.backgroundColor}
                          onChange={(e) => setTheme({...theme, backgroundColor: e.target.value})}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Card Background</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={theme.cardBackgroundColor}
                          onChange={(e) => setTheme({...theme, cardBackgroundColor: e.target.value})}
                          className="h-10 w-16 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={theme.cardBackgroundColor}
                          onChange={(e) => setTheme({...theme, cardBackgroundColor: e.target.value})}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Text Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={theme.textColor}
                          onChange={(e) => setTheme({...theme, textColor: e.target.value})}
                          className="h-10 w-16 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={theme.textColor}
                          onChange={(e) => setTheme({...theme, textColor: e.target.value})}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Font Family</label>
                      <select
                        value={theme.fontFamily}
                        onChange={(e) => setTheme({...theme, fontFamily: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      >
                        <option value="Inter, system-ui, sans-serif">Inter</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', monospace">Courier New</option>
                      </select>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200">
                      <button
                        onClick={saveSurvey}
                        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        Apply Theme
                      </button>
                    </div>
                  </div>
                ) : (
                  renderQuestionEditor()
                )}
              </div>
            </>
          ) : (
            // Preview Mode - Matches Public View
            <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily }}>
              <div className="max-w-4xl mx-auto">
                <div className="p-8 rounded-lg mb-6" style={{ backgroundColor: theme.cardBackgroundColor }}>
                  <h1 className="text-3xl font-bold mb-2" style={{ color: theme.textColor }}>{title || 'Untitled Survey'}</h1>
                  {description && <p className="text-lg mb-6" style={{ color: theme.textColor + 'cc' }}>{description}</p>}
                  
                  <div className={`space-y-6 ${
                    layout === '2-column' ? 'md:grid md:grid-cols-2 md:gap-6 md:space-y-0' :
                    layout === '3-column' ? 'md:grid md:grid-cols-3 md:gap-6 md:space-y-0' :
                    ''
                  }`}>
                    {questions.map((q, idx) => (
                      <div key={q.id} className="space-y-2">
                        <label className="block font-medium" style={{ color: theme.textColor }}>
                          {idx + 1}. {q.label}
                          {q.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        {q.description && (
                          <p className="text-sm" style={{ color: theme.textColor + 'aa' }}>{q.description}</p>
                        )}
                        {renderPreviewQuestion(q)}
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8">
                    <button
                      style={{ backgroundColor: theme.buttonColor }}
                      className="px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeId && activeId.startsWith('palette-') ? (
            <div className="bg-indigo-100 border-2 border-indigo-400 rounded-lg p-3 shadow-lg">
              <span className="font-medium text-indigo-900">
                {ALL_QUESTION_TYPES.find(q => `palette-${q.value}` === activeId)?.label}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* AI Assistant Floating Button */}
      {!showAIPanel && (
        <button
          onClick={() => setShowAIPanel(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-110 flex items-center justify-center z-50"
          title="AI Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* AI Assistant Panel */}
      {showAIPanel && (
        <div className="fixed right-6 bottom-24 w-[420px] h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-40">
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm animate-pulse">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold">Survey Builder AI</h3>
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
          <div className="flex-1 overflow-y-auto p-5 bg-gradient-to-b from-slate-50 to-white">
            {aiConversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="h-10 w-10 text-indigo-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Hi! I'm your Survey AI 👋</h4>
                <p className="text-sm text-slate-600 mb-6">
                  I can help you create amazing surveys! Just chat naturally with me.
                </p>
                <div className="space-y-2 text-xs text-slate-600 w-full">
                  <p className="font-semibold text-slate-700 mb-3">Try asking me:</p>
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                    💡 "Create a customer satisfaction survey"
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                    ✨ "Add email and phone questions"
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-2 rounded-lg border border-purple-200 text-left">
                    📊 "Add NPS question"
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {aiConversation.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
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
          <div className="px-5 py-4 border-t border-slate-200 bg-white rounded-b-2xl">
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !aiLoading && aiPrompt.trim() && handleAIGenerate()}
                placeholder="Type your request here..."
                disabled={aiLoading}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                className="p-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 shadow-lg"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 flex items-center">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              Press Enter to send
            </p>
          </div>
        </div>
      )}

      {/* Expiry Settings Modal */}
      {showExpiryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold mb-4">Survey Expiry Settings</h3>
            
            {/* Manual Toggle */}
            <div className="mb-6 p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-semibold">Manual Expiry Toggle</h4>
                  <p className="text-sm text-slate-600">Instantly expire or unexpire the survey</p>
                </div>
                <button
                  onClick={handleToggleExpiry}
                  className={`px-4 py-2 rounded-md font-medium transition ${
                    survey?.distribution?.is_expired
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {survey?.distribution?.is_expired ? 'Unexpire' : 'Expire'}
                </button>
              </div>
              {survey?.distribution?.is_expired && (
                <p className="text-sm text-red-600 font-medium">⚠️ Survey is currently expired</p>
              )}
            </div>

            {/* Date/Time Expiry */}
            <div className="mb-6">
              <label className="block font-semibold mb-2">Set Expiry Date & Time</label>
              <p className="text-sm text-slate-600 mb-3">
                Survey will automatically expire at this date/time
              </p>
              <input
                type="datetime-local"
                value={expiryDate || survey?.distribution?.close_date?.slice(0, 16) || ''}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-md"
              />
              {survey?.distribution?.close_date && (
                <p className="text-sm text-slate-600 mt-2">
                  Current expiry: {new Date(survey.distribution.close_date).toLocaleString()}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowExpiryModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExpiryDate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Save Expiry Date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SurveyBuilder;
