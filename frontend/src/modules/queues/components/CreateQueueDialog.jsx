/**
 * Create/Edit Queue Dialog
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Loader2, Plus, Inbox, X, Package } from 'lucide-react';
import { toast } from 'react-hot-toast';
import queueService from '../services/queueService';

const OBJECT_COLORS = {
  lead: 'bg-orange-100 text-orange-700',
  contact: 'bg-purple-100 text-purple-700',
  account: 'bg-blue-100 text-blue-700',
  opportunity: 'bg-green-100 text-green-700',
  case: 'bg-red-100 text-red-700',
  task: 'bg-slate-100 text-slate-700',
  // Default for custom objects
  default: 'bg-indigo-100 text-indigo-700'
};

const getObjectColor = (objectName) => {
  return OBJECT_COLORS[objectName] || OBJECT_COLORS.default;
};

const CreateQueueDialog = ({ open, onOpenChange, editingQueue, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [supportedObjects, setSupportedObjects] = useState([]);
  const [availableObjects, setAvailableObjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAvailableObjects();
    }
  }, [open]);

  useEffect(() => {
    if (editingQueue) {
      setName(editingQueue.name || '');
      setDescription(editingQueue.description || '');
      setEmail(editingQueue.email || '');
      setSupportedObjects(editingQueue.supported_objects || []);
    } else {
      resetForm();
    }
  }, [editingQueue, open]);

  const fetchAvailableObjects = async () => {
    try {
      setLoadingObjects(true);
      const data = await queueService.getAvailableObjects();
      setAvailableObjects(data || []);
    } catch (error) {
      console.error('Error fetching objects:', error);
    } finally {
      setLoadingObjects(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setEmail('');
    setSupportedObjects([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Queue name is required');
      return;
    }

    try {
      setLoading(true);
      const queueData = {
        name: name.trim(),
        description: description.trim() || null,
        email: email.trim() || null,
        supported_objects: supportedObjects
      };

      if (editingQueue) {
        await queueService.updateQueue(editingQueue.id, queueData);
        toast.success('Queue updated successfully');
      } else {
        await queueService.createQueue(queueData);
        toast.success('Queue created successfully');
      }
      
      resetForm();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save queue');
    } finally {
      setLoading(false);
    }
  };

  const toggleObject = (objectName) => {
    setSupportedObjects(prev => {
      if (prev.includes(objectName)) {
        return prev.filter(o => o !== objectName);
      } else {
        return [...prev, objectName];
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {editingQueue ? (
              <>
                <Inbox className="h-5 w-5 text-violet-600" />
                Edit Queue
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-violet-600" />
                Create New Queue
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Queue Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Queue Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Support Queue, Lead Assignment Queue"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              data-testid="queue-name-input"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this queue's purpose"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={loading}
              data-testid="queue-description-input"
            />
          </div>

          {/* Queue Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Queue Email (Optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="support-queue@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              data-testid="queue-email-input"
            />
            <p className="text-xs text-slate-500">
              Email address for this queue (used for email-to-case routing)
            </p>
          </div>

          {/* Supported Objects */}
          <div className="space-y-2">
            <Label>Supported Objects</Label>
            <p className="text-xs text-slate-500 mb-2">
              Select which object types can be routed to this queue
            </p>
            
            {/* Selected Objects */}
            {supportedObjects.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2 border-b mb-3">
                {supportedObjects.map(objName => {
                  const obj = availableObjects.find(o => o.name === objName);
                  return (
                    <Badge
                      key={objName}
                      variant="secondary"
                      className={`pr-1 ${getObjectColor(objName)}`}
                    >
                      {obj?.label || objName}
                      <button
                        type="button"
                        onClick={() => toggleObject(objName)}
                        className="ml-1 hover:bg-black/10 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Available Objects */}
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              {loadingObjects ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : availableObjects.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No objects available
                </p>
              ) : (
                availableObjects.map(obj => {
                  const isSelected = supportedObjects.includes(obj.name);
                  return (
                    <div
                      key={obj.name}
                      className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-violet-50 border border-violet-200' 
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                      onClick={() => toggleObject(obj.name)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="mr-3"
                      />
                      <Package className={`h-4 w-4 mr-2 ${getObjectColor(obj.name).split(' ')[1] || 'text-slate-400'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{obj.label}</p>
                        <p className="text-xs text-slate-500">{obj.api_name || obj.name}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
              disabled={loading || !name.trim()}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="save-queue-btn"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingQueue ? 'Update Queue' : 'Create Queue'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateQueueDialog;
