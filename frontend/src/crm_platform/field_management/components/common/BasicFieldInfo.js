import React from 'react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { Switch } from '../../../../components/ui/switch';
import { generateApiKey } from '../../utils/fieldUtils';

/**
 * Basic Field Info Form - Common step for all field wizards
 * Handles: Label, API Key, Description, Help Text, Required, Unique, Indexed
 */
const BasicFieldInfo = ({
  label,
  setLabel,
  apiKey,
  setApiKey,
  description,
  setDescription,
  helpText,
  setHelpText,
  isRequired,
  setIsRequired,
  isUnique,
  setIsUnique,
  isIndexed,
  setIsIndexed,
  apiKeySuffix = '', // e.g., '_id' for lookup fields
  showUnique = true,
  errors = {}
}) => {
  const handleLabelChange = (e) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    // Auto-generate API key if it hasn't been manually edited
    if (!apiKey || apiKey === generateApiKey(label, apiKeySuffix)) {
      setApiKey(generateApiKey(newLabel, apiKeySuffix));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Basic Information</h3>
        <p className="text-sm text-gray-500">Define the basic properties of your field</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Field Label */}
        <div className="space-y-2">
          <Label htmlFor="label" className="text-sm font-medium">
            Field Label <span className="text-red-500">*</span>
          </Label>
          <Input
            id="label"
            value={label}
            onChange={handleLabelChange}
            placeholder="e.g., Account Name"
            className={errors.label ? 'border-red-500' : ''}
          />
          {errors.label && (
            <p className="text-xs text-red-500">{errors.label}</p>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-sm font-medium">
            API Key <span className="text-red-500">*</span>
          </Label>
          <Input
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="e.g., account_name"
            className={`font-mono text-sm ${errors.apiKey ? 'border-red-500' : ''}`}
          />
          {errors.apiKey ? (
            <p className="text-xs text-red-500">{errors.apiKey}</p>
          ) : (
            <p className="text-xs text-gray-500">Auto-generated, but you can customize it</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium">
          Description
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this field is used for..."
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Help Text */}
      <div className="space-y-2">
        <Label htmlFor="helpText" className="text-sm font-medium">
          Help Text
        </Label>
        <Input
          id="helpText"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder="Text shown to users when they hover over the field"
        />
        <p className="text-xs text-gray-500">
          This text appears as a tooltip to help users understand the field
        </p>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-6 pt-4 border-t">
        {/* Required */}
        <div className="flex items-center gap-3">
          <Switch
            id="required"
            checked={isRequired}
            onCheckedChange={setIsRequired}
          />
          <div>
            <Label htmlFor="required" className="text-sm font-medium cursor-pointer">
              Required
            </Label>
            <p className="text-xs text-gray-500">Field must have a value</p>
          </div>
        </div>

        {/* Unique */}
        {showUnique && (
          <div className="flex items-center gap-3">
            <Switch
              id="unique"
              checked={isUnique}
              onCheckedChange={setIsUnique}
            />
            <div>
              <Label htmlFor="unique" className="text-sm font-medium cursor-pointer">
                Unique
              </Label>
              <p className="text-xs text-gray-500">No duplicate values allowed</p>
            </div>
          </div>
        )}

        {/* Indexed/Searchable */}
        <div className="flex items-center gap-3">
          <Switch
            id="indexed"
            checked={isIndexed}
            onCheckedChange={setIsIndexed}
          />
          <div>
            <Label htmlFor="indexed" className="text-sm font-medium cursor-pointer">
              Searchable
            </Label>
            <p className="text-xs text-gray-500">Include in search results</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicFieldInfo;
