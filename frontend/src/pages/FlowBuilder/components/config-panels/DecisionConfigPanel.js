/**
 * Decision Node Config Panel
 * Extracted from NodeConfigPanel.js - handles decision routing with multiple outcomes
 */
import React from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Button } from '../../../../components/ui/button';
import { Trash2, GripVertical, Plus } from 'lucide-react';
import ResourcePickerField from '../ResourcePickerField';
import SearchableFieldSelect from '../SearchableFieldSelect';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Outcome Item - supports render props pattern
const SortableOutcomeItem = ({ outcome, outcomeIndex, children, id }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {typeof children === 'function' 
        ? children({ dragHandleProps: listeners, isDragging })
        : React.cloneElement(children, { dragHandleProps: listeners, isDragging })
      }
    </div>
  );
};

// Outcome Card Component
const OutcomeCard = ({ 
  outcome, 
  outcomeIndex, 
  config, 
  setConfig, 
  availableFields, 
  flowVariables,
  triggerObject,
  isDefault = false,
  dragHandleProps,
  nodes = []
}) => {
  const conditions = outcome.conditions || [];
  const matchType = outcome.matchType || 'all';

  const updateOutcome = (updates) => {
    const newOutcomes = [...(config.outcomes || [])];
    newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], ...updates };
    setConfig({ ...config, outcomes: newOutcomes });
  };

  const updateCondition = (condIndex, updates) => {
    const newConditions = [...conditions];
    newConditions[condIndex] = { ...newConditions[condIndex], ...updates };
    updateOutcome({ conditions: newConditions });
  };

  const addCondition = () => {
    updateOutcome({ conditions: [...conditions, { field: '', operator: 'equals', value: '' }] });
  };

  const removeCondition = (condIndex) => {
    updateOutcome({ conditions: conditions.filter((_, i) => i !== condIndex) });
  };

  const removeOutcome = () => {
    const newOutcomes = (config.outcomes || []).filter((_, i) => i !== outcomeIndex);
    setConfig({ ...config, outcomes: newOutcomes });
  };

  return (
    <div className={`border-2 rounded-lg bg-white shadow-sm ${isDefault ? 'border-slate-300' : 'border-indigo-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${isDefault ? 'bg-slate-100 border-slate-200' : 'bg-indigo-50 border-indigo-200'}`}>
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            {!isDefault && dragHandleProps && (
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                title="Drag to reorder"
                {...dragHandleProps}
              >
                <GripVertical className="w-5 h-5" />
              </button>
            )}
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isDefault ? 'bg-slate-500 text-white' : 'bg-indigo-600 text-white'}`}>
              {isDefault ? '∞' : outcomeIndex + 1}
            </span>
            <Input
              className="font-semibold text-slate-900 bg-white border-slate-300"
              value={outcome.label || ''}
              onChange={(e) => updateOutcome({ 
                label: e.target.value,
                name: e.target.value.toLowerCase().replace(/\s+/g, '_')
              })}
              placeholder={isDefault ? "Default Outcome" : "Outcome Name"}
            />
          </div>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={removeOutcome}
            className="p-2 text-red-600 hover:bg-red-50 rounded-md"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {isDefault ? (
          <p className="text-sm text-slate-600">
            This path is followed when no other outcomes match.
          </p>
        ) : (
          <>
            {/* Match Type */}
            <div>
              <Label className="text-sm font-medium">Condition Logic</Label>
              <Select
                value={matchType}
                onValueChange={(value) => updateOutcome({ matchType: value })}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All conditions must be true (AND)</SelectItem>
                  <SelectItem value="any">Any condition must be true (OR)</SelectItem>
                  <SelectItem value="custom">Custom logic formula</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Logic Formula */}
            {matchType === 'custom' && (
              <div>
                <Label className="text-sm font-medium">Custom Formula</Label>
                <Input
                  className="w-full mt-1 font-mono"
                  value={outcome.customLogic || ''}
                  onChange={(e) => updateOutcome({ customLogic: e.target.value })}
                  placeholder="e.g., (1 AND 2) OR 3"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Use condition numbers (1, 2, 3...) with AND, OR, NOT
                </p>
              </div>
            )}

            {/* Conditions */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Conditions</Label>
              <div className="space-y-2">
                {conditions.map((condition, condIndex) => (
                  <div key={condIndex} className="p-3 bg-slate-50 rounded-md border border-slate-200">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-slate-400 w-6 pt-2">{condIndex + 1}.</span>
                      
                      {/* Field - Searchable Dropdown */}
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500 mb-1 block">Field</Label>
                        <SearchableFieldSelect
                          value={condition.field || ''}
                          onChange={(value) => updateCondition(condIndex, { field: value })}
                          fields={availableFields || []}
                          placeholder="Search fields..."
                        />
                      </div>
                      
                      {/* Operator */}
                      <div className="w-36">
                        <Label className="text-xs text-slate-500 mb-1 block">Operator</Label>
                        <Select
                          value={condition.operator || 'equals'}
                          onValueChange={(value) => updateCondition(condIndex, { operator: value })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals (=)</SelectItem>
                            <SelectItem value="not_equals">Not Equals (≠)</SelectItem>
                            <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                            <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                            <SelectItem value="greater_or_equal">Greater or Equal (≥)</SelectItem>
                            <SelectItem value="less_or_equal">Less or Equal (≤)</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="starts_with">Starts With</SelectItem>
                            <SelectItem value="ends_with">Ends With</SelectItem>
                            <SelectItem value="is_null">Is Null</SelectItem>
                            <SelectItem value="is_not_null">Is Not Null</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Value - ResourcePickerField */}
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500 mb-1 block">Value</Label>
                        <ResourcePickerField
                          value={condition.value || ''}
                          onChange={(value) => updateCondition(condIndex, { value: value })}
                          nodes={nodes}
                          availableFields={availableFields}
                          flowVariables={flowVariables}
                          placeholder="Type or select value..."
                        />
                      </div>
                      
                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(condIndex)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded mt-5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCondition}
                  className="w-full border-dashed"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Condition
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DecisionConfigPanel = ({
  config,
  setConfig,
  availableFields,
  flowVariables,
  triggerObject,
  nodes = []
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const outcomes = config.outcomes || [];
      const nonDefaultOutcomes = outcomes.filter(o => !o.isDefault);
      const defaultOutcome = outcomes.find(o => o.isDefault);
      
      const oldIndex = nonDefaultOutcomes.findIndex(o => o.name === active.id);
      const newIndex = nonDefaultOutcomes.findIndex(o => o.name === over.id);
      
      const reordered = arrayMove(nonDefaultOutcomes, oldIndex, newIndex);
      const newOutcomes = defaultOutcome ? [...reordered, defaultOutcome] : reordered;
      
      setConfig({ ...config, outcomes: newOutcomes });
    }
  };

  const addOutcome = () => {
    const outcomes = config.outcomes || [];
    const nonDefaultOutcomes = outcomes.filter(o => !o.isDefault);
    const defaultOutcome = outcomes.find(o => o.isDefault);
    const newOutcomeNum = nonDefaultOutcomes.length + 1;
    
    const newOutcome = {
      name: `outcome_${newOutcomeNum}`,
      label: `Outcome ${newOutcomeNum}`,
      conditions: [{ field: '', operator: 'equals', value: '' }],
      matchType: 'all',
      isDefault: false
    };
    
    const newOutcomes = defaultOutcome 
      ? [...nonDefaultOutcomes, newOutcome, defaultOutcome]
      : [...nonDefaultOutcomes, newOutcome];
    
    setConfig({ ...config, outcomes: newOutcomes });
  };

  const outcomes = config.outcomes || [];
  const nonDefaultOutcomes = outcomes.filter(o => !o.isDefault);
  const defaultOutcome = outcomes.find(o => o.isDefault);
  const defaultOutcomeIndex = outcomes.findIndex(o => o.isDefault);

  return (
    <div className="space-y-4">
      {/* Execution Order Alert */}
      <div className="bg-amber-50 border-l-4 border-amber-400 p-3">
        <p className="text-sm font-semibold text-amber-900">⚠️ Outcomes are evaluated in order. First match wins.</p>
        <p className="text-xs text-amber-700 mt-1">
          The flow will execute only ONE outcome path and skip the rest.
        </p>
      </div>

      {/* Decision Name */}
      <div>
        <Label className="text-sm font-medium">Decision Name <span className="text-red-500">*</span></Label>
        <Input
          className="w-full mt-1"
          value={config.label || ''}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          placeholder="e.g., Route by Opportunity Amount"
        />
      </div>

      {/* Description */}
      <div>
        <Label className="text-sm font-medium">Description <span className="text-slate-400">(Optional)</span></Label>
        <Textarea
          className="w-full mt-1"
          value={config.description || ''}
          onChange={(e) => setConfig({ ...config, description: e.target.value })}
          placeholder="Explain what this decision does..."
          rows={2}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200 my-4"></div>

      {/* Outcomes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold text-slate-900">Outcome Paths</Label>
          <p className="text-xs text-slate-500">Drag to reorder • First matching outcome is selected</p>
        </div>
        
        {/* Sortable Outcomes */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={nonDefaultOutcomes.map(o => o.name)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {nonDefaultOutcomes.map((outcome, idx) => {
                const actualIndex = outcomes.findIndex(o => o.name === outcome.name);
                return (
                  <SortableOutcomeItem
                    key={outcome.name}
                    id={outcome.name}
                    outcome={outcome}
                    outcomeIndex={actualIndex}
                  >
                    {({ dragHandleProps }) => (
                      <OutcomeCard
                        outcome={outcome}
                        outcomeIndex={actualIndex}
                        config={config}
                        setConfig={setConfig}
                        availableFields={availableFields}
                        flowVariables={flowVariables}
                        triggerObject={triggerObject}
                        dragHandleProps={dragHandleProps}
                        nodes={nodes}
                      />
                    )}
                  </SortableOutcomeItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Outcome Button */}
        <Button
          type="button"
          variant="outline"
          onClick={addOutcome}
          className="w-full border-dashed border-2 border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Outcome Path
        </Button>

        {/* Default Outcome */}
        {defaultOutcome && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2 font-medium">DEFAULT FALLBACK</p>
            <OutcomeCard
              outcome={defaultOutcome}
              outcomeIndex={defaultOutcomeIndex}
              config={config}
              setConfig={setConfig}
              availableFields={availableFields}
              flowVariables={flowVariables}
              triggerObject={triggerObject}
              isDefault={true}
              nodes={nodes}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DecisionConfigPanel;
