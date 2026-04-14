/**
 * Create/Edit Sharing Rule Dialog
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
import { Loader2, Plus, Share2, Filter, UserCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import CriteriaBuilder from './CriteriaBuilder';
import ShareTargetSelector from './ShareTargetSelector';
import sharingRulesService from '../services/sharingRulesService';

const ACCESS_LEVELS = [
  { value: 'read_only', label: 'Read Only', description: 'Users can view records' },
  { value: 'read_write', label: 'Read/Write', description: 'Users can view and edit records' },
];

const CreateSharingRuleDialog = ({ open, onOpenChange, editingRule, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objectName, setObjectName] = useState('');
  const [ruleType, setRuleType] = useState('criteria');
  const [criteria, setCriteria] = useState([]);
  const [ownerCriteria, setOwnerCriteria] = useState({ owner_type: 'role', owner_role_id: '' });
  const [shareWithType, setShareWithType] = useState('role');
  const [shareWithId, setShareWithId] = useState('');
  const [accessLevel, setAccessLevel] = useState('read_only');
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState([]);
  const [roles, setRoles] = useState([]);
  const [availableObjects, setAvailableObjects] = useState([]);
  const [loadingObjects, setLoadingObjects] = useState(false);

  // Reset form to initial state (keep objectName if set by data loading)
  const resetForm = (keepObject = false) => {
    setName('');
    setDescription('');
    if (!keepObject) setObjectName('');
    setRuleType('criteria');
    setCriteria([]);
    setOwnerCriteria({ owner_type: 'role', owner_role_id: '' });
    setShareWithType('role');
    setShareWithId('');
    setAccessLevel('read_only');
    setFields([]);
  };

  // Fetch share targets (roles, groups, etc.)
  const fetchShareTargets = async () => {
    try {
      const data = await sharingRulesService.getShareTargets();
      setRoles(data?.roles || []);
    } catch (err) {
      console.error('Error fetching targets:', err);
    }
  };

  // Load objects, roles, and set form state when dialog opens
  useEffect(() => {
    if (open) {
      // Fetch share targets
      fetchShareTargets();
      
      // Fetch available objects and handle form state
      setLoadingObjects(true);
      sharingRulesService.getAvailableObjects()
        .then(data => {
          const objects = data || [];
          setAvailableObjects(objects);
          
          // Handle form state based on whether we're editing or creating
          if (editingRule) {
            setName(editingRule.name || '');
            setDescription(editingRule.description || '');
            setObjectName(editingRule.object_name || '');
            setRuleType(editingRule.rule_type || 'criteria');
            setCriteria(editingRule.criteria || []);
            setOwnerCriteria(editingRule.owner_criteria || { owner_type: 'role', owner_role_id: '' });
            setShareWithType(editingRule.share_with_type || 'role');
            setShareWithId(editingRule.share_with_id || '');
            setAccessLevel(editingRule.access_level || 'read_only');
          } else {
            // Reset form for new rule and set default object
            resetForm(true);
            if (objects.length > 0) {
              setObjectName(objects[0].name);
            }
          }
        })
        .catch(err => console.error('Error fetching objects:', err))
        .finally(() => setLoadingObjects(false));
    }
  }, [open, editingRule]);

  // Ensure objectName is set when availableObjects loads (for new rules)
  useEffect(() => {
    if (open && !editingRule && availableObjects.length > 0 && !objectName) {
      setObjectName(availableObjects[0].name);
    }
  }, [open, editingRule, availableObjects, objectName]);

  // Load fields when object changes
  useEffect(() => {
    if (objectName) {
      sharingRulesService.getObjectFields(objectName)
        .then(data => setFields(data || []))
        .catch(err => {
          console.error('Error fetching fields:', err);
          setFields([]);
        });
    }
  }, [objectName]);

  const handleObjectChange = (value) => {
    setObjectName(value);
    setCriteria([]); // Reset criteria when object changes
    // Fields will be automatically loaded by the useEffect when objectName changes
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Rule name is required');
      return;
    }

    if (!shareWithId) {
      toast.error('Please select a share target');
      return;
    }

    if (ruleType === 'criteria' && criteria.length === 0) {
      toast.error('Please add at least one criterion');
      return;
    }

    if (ruleType === 'owner' && !ownerCriteria.owner_role_id) {
      toast.error('Please select an owner role');
      return;
    }

    try {
      setLoading(true);
      
      const ruleData = {
        name: name.trim(),
        description: description.trim() || null,
        object_name: objectName,
        rule_type: ruleType,
        criteria: ruleType === 'criteria' ? criteria : null,
        owner_criteria: ruleType === 'owner' ? ownerCriteria : null,
        share_with_type: shareWithType,
        share_with_id: shareWithId,
        access_level: accessLevel,
        is_active: true
      };

      if (editingRule) {
        await sharingRulesService.updateRule(editingRule.id, ruleData);
        toast.success('Sharing rule updated successfully');
      } else {
        await sharingRulesService.createRule(ruleData);
        toast.success('Sharing rule created successfully');
      }
      
      resetForm();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save sharing rule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {editingRule ? (
              <>
                <Share2 className="h-5 w-5 text-blue-600" />
                Edit Sharing Rule
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-blue-600" />
                Create Sharing Rule
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Share Hot Leads with Sales"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                data-testid="rule-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="object">Object *</Label>
              <Select 
                value={objectName} 
                onValueChange={handleObjectChange} 
                disabled={loading || loadingObjects}
              >
                <SelectTrigger id="object" data-testid="object-select">
                  <SelectValue placeholder={loadingObjects ? "Loading..." : "Select object"} />
                </SelectTrigger>
                <SelectContent>
                  {availableObjects.map((obj) => (
                    <SelectItem key={obj.name} value={obj.name}>
                      {obj.label}{obj.is_custom && <span className="text-xs text-slate-400 ml-1">(Custom)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this rule does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Rule Type Selection */}
          <div className="space-y-3">
            <Label>Rule Type</Label>
            <RadioGroup
              value={ruleType}
              onValueChange={setRuleType}
              className="grid grid-cols-2 gap-4"
              disabled={loading}
            >
              <div
                className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  ruleType === 'criteria' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => setRuleType('criteria')}
              >
                <RadioGroupItem value="criteria" id="criteria" />
                <div>
                  <Label htmlFor="criteria" className="font-medium cursor-pointer flex items-center">
                    <Filter className="h-4 w-4 mr-2 text-blue-600" />
                    Criteria-Based
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Share records matching field conditions
                  </p>
                </div>
              </div>
              
              <div
                className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  ruleType === 'owner' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => setRuleType('owner')}
              >
                <RadioGroupItem value="owner" id="owner" />
                <div>
                  <Label htmlFor="owner" className="font-medium cursor-pointer flex items-center">
                    <UserCheck className="h-4 w-4 mr-2 text-green-600" />
                    Owner-Based
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Share records owned by specific roles
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Criteria Builder (for criteria-based rules) */}
          {ruleType === 'criteria' && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <CriteriaBuilder
                criteria={criteria}
                onChange={setCriteria}
                fields={fields}
                disabled={loading}
              />
            </div>
          )}

          {/* Owner Criteria (for owner-based rules) */}
          {ruleType === 'owner' && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="flex items-center space-x-2 text-sm font-medium text-slate-700">
                <UserCheck className="h-4 w-4" />
                <span>Owner Criteria</span>
              </div>
              <p className="text-sm text-slate-500">
                Share records where the owner has this role:
              </p>
              <Select
                value={ownerCriteria.owner_role_id}
                onValueChange={(value) => setOwnerCriteria({ owner_type: 'role', owner_role_id: value })}
                disabled={loading}
              >
                <SelectTrigger data-testid="owner-role-select">
                  <SelectValue placeholder="Select owner role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Share Target Selector */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <ShareTargetSelector
              shareWithType={shareWithType}
              shareWithId={shareWithId}
              onTypeChange={setShareWithType}
              onIdChange={setShareWithId}
              disabled={loading}
            />
          </div>

          {/* Access Level */}
          <div className="space-y-3">
            <Label>Access Level</Label>
            <RadioGroup
              value={accessLevel}
              onValueChange={setAccessLevel}
              className="flex space-x-4"
              disabled={loading}
            >
              {ACCESS_LEVELS.map((level) => (
                <div
                  key={level.value}
                  className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer flex-1 ${
                    accessLevel === level.value 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setAccessLevel(level.value)}
                >
                  <RadioGroupItem value={level.value} id={level.value} />
                  <div>
                    <Label htmlFor={level.value} className="font-medium cursor-pointer">
                      {level.label}
                    </Label>
                    <p className="text-xs text-slate-500">{level.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !shareWithId}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-rule-btn"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSharingRuleDialog;
