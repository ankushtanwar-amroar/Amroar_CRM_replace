/**
 * AccessBundlesPage - Main page for managing access bundles
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Plus,
  Loader2,
  Edit,
  Trash2,
  Users,
  Lock,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { useAccessBundles } from '../hooks/useAccessBundles';
import CreateBundleDialog from '../components/CreateBundleDialog';
import AssignBundleDialog from '../components/AssignBundleDialog';
import accessBundleService from '../services/accessBundleService';

const AccessBundlesPage = () => {
  const navigate = useNavigate();
  const { bundles, loading, refetch } = useAccessBundles();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [assigningBundle, setAssigningBundle] = useState(null);
  const [deletingBundle, setDeletingBundle] = useState(null);
  const [expandedBundle, setExpandedBundle] = useState(null);

  const handleEdit = (bundle) => {
    setEditingBundle(bundle);
    setCreateDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingBundle) return;

    try {
      await accessBundleService.delete(deletingBundle.id);
      refetch();
    } catch (err) {
      console.error('Error deleting bundle:', err);
      alert(err.response?.data?.detail || 'Failed to delete bundle');
    } finally {
      setDeletingBundle(null);
    }
  };

  const handleAssignSuccess = () => {
    refetch();
    // Also refresh the assigning bundle to get updated assigned users
    if (assigningBundle) {
      accessBundleService.getById(assigningBundle.id)
        .then(data => setAssigningBundle(data))
        .catch(console.error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="permission-bundles-page">
      {/* Header with Back Button */}
      <div className="flex justify-between">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            data-testid="back-to-setup-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Setup</span>
          </button>
          <div className="h-8 w-px bg-slate-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Permission Bundles</h1>
              <p className="text-sm text-slate-500">Group multiple permission sets for easy assignment to users</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditingBundle(null);
              setCreateDialogOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="create-bundle-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Bundle
          </Button>
        </div>
      </div>

      {/* Action Button */}


      {/* Bundle Cards */}
      {bundles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No Permission Bundles</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Create bundles to group permission sets together for easier user assignment.
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="outline"
              className="border-purple-300 text-purple-600 hover:bg-purple-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Bundle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {bundles.map((bundle) => (
            <Card
              key={bundle.id}
              className={`transition-shadow ${expandedBundle === bundle.id ? 'shadow-lg ring-2 ring-purple-200' : 'hover:shadow-md'
                }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${bundle.is_active
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                      : 'bg-slate-200'
                      }`}>
                      <Package className={`h-6 w-6 ${bundle.is_active ? 'text-white' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {bundle.name}
                        {!bundle.is_active && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-500">
                            Inactive
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-slate-500">
                        {bundle.description || 'No description'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-700">
                      {bundle.permission_sets?.length || 0}
                    </div>
                    <div className="text-xs text-purple-600">Permission Sets</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">
                      {bundle.assigned_user_count || 0}
                    </div>
                    <div className="text-xs text-blue-600">Assigned Users</div>
                  </div>
                </div>

                {/* Permission Sets Preview */}
                {bundle.permission_sets?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedBundle(
                        expandedBundle === bundle.id ? null : bundle.id
                      )}
                      className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${expandedBundle === bundle.id ? 'rotate-90' : ''
                        }`} />
                      Included Permission Sets
                    </button>

                    {expandedBundle === bundle.id && (
                      <div className="mt-2 space-y-1">
                        {bundle.permission_sets.map((ps) => (
                          <div
                            key={ps.id}
                            className="flex items-center gap-2 text-sm p-2 bg-slate-50 rounded"
                          >
                            <Lock className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-700">{ps.role_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Load full bundle data for assignment
                      accessBundleService.getById(bundle.id)
                        .then(data => setAssigningBundle(data))
                        .catch(console.error);
                    }}
                    className="flex-1"
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(bundle)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeletingBundle(bundle)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
        <p className="font-medium mb-1">ℹ️ About Access Bundles</p>
        <p>
          Access Bundles let you group multiple permission sets together. When you assign a bundle
          to a user, they receive all the permissions from the included permission sets. This makes
          it easy to manage complex access requirements.
        </p>
      </div>

      {/* Dialogs */}
      <CreateBundleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        editingBundle={editingBundle}
        onSuccess={() => {
          refetch();
          setEditingBundle(null);
        }}
      />

      <AssignBundleDialog
        open={!!assigningBundle}
        onOpenChange={(open) => !open && setAssigningBundle(null)}
        bundle={assigningBundle}
        onSuccess={handleAssignSuccess}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBundle} onOpenChange={(open) => !open && setDeletingBundle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Access Bundle?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBundle?.name}"? This will remove the bundle
              from all assigned users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Bundle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccessBundlesPage;
