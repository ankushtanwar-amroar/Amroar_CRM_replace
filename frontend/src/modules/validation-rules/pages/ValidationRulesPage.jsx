import React, { useState } from 'react';
import { Shield, Plus, RefreshCw, Edit, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import CreateValidationRuleDialog from '../components/CreateValidationRuleDialog';
import { useValidationRules } from '../hooks/useValidationRules';
import { toast } from 'react-hot-toast';

const ValidationRulesPage = ({ objectName }) => {
  const { rules, objectFields, parentFieldGroups, loading, createRule, updateRule, deleteRule, refresh } = useValidationRules(objectName);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const handleCreate = () => {
    setEditingRule(null);
    setShowDialog(true);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowDialog(true);
  };

  const handleSave = async (ruleData) => {
    if (editingRule) {
      await updateRule(editingRule.id, ruleData);
    } else {
      await createRule(ruleData);
    }
  };

  const handleDelete = async (ruleId) => {
    if (window.confirm('Delete this validation rule?')) {
      try {
        await deleteRule(ruleId);
        toast.success('Rule deleted');
      } catch (error) {
        toast.error('Failed to delete');
      }
    }
  };

  const handleToggleActive = async (rule) => {
    try {
      await updateRule(rule.id, { ...rule, is_active: !rule.is_active });
      toast.success(`Rule ${rule.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Validation Rules</h1>
            <p className="text-sm text-slate-500">Define rules for {objectName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Rule Name</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Error Message</TableHead>
              <TableHead className="text-center w-24">Active</TableHead>
              <TableHead className="text-right w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No validation rules. Click New Rule to create one.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="font-medium">{rule.rule_name}</div>
                    {rule.description && <div className="text-xs text-slate-500">{rule.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rule.conditions.length} condition{rule.conditions.length > 1 ? 's' : ''}
                    {rule.conditions.length > 1 && (
                      <Badge variant="outline" className="ml-2 text-xs">{rule.logic_operator}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{rule.error_message}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={rule.is_active} onCheckedChange={() => handleToggleActive(rule)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} className="text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">How Validation Rules Work</p>
        <p>When the rule's condition is <strong>TRUE</strong>, the save is <strong>blocked</strong> and the error message is shown.</p>
        <p className="mt-2 text-blue-700">
          <strong>To require a field:</strong> Use condition <code className="bg-blue-100 px-1 rounded">Field "Is Empty"</code> - this blocks save when the field is blank.
        </p>
        {Object.keys(parentFieldGroups).length > 0 && (
          <p className="mt-2">You can reference parent lookup fields like <code className="bg-blue-100 px-1 rounded">Account.Industry</code> in your conditions.</p>
        )}
      </div>

      <CreateValidationRuleDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        fields={objectFields}
        parentFieldGroups={parentFieldGroups}
        onSave={handleSave}
        editRule={editingRule}
        objectName={objectName}
        objectLabel={objectName?.charAt(0).toUpperCase() + objectName?.slice(1)}
      />
    </div>
  );
};

export default ValidationRulesPage;