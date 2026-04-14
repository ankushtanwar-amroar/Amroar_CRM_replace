/**
 * GitHub Sync Section for Task Detail - Phase 12
 * Shows GitHub issue link or button to create issue
 */
import React, { useState, useEffect } from 'react';
import {
  GitBranch, ExternalLink, Loader2, Link as LinkIcon,
  RefreshCw, CheckCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const GitHubSyncSection = ({ task, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncConfig, setSyncConfig] = useState(null);

  useEffect(() => {
    if (task?.project_id) {
      fetchSyncConfig();
    }
  }, [task?.project_id]);

  const fetchSyncConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects/${task.project_id}/github-sync`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSyncConfig(data.config);
      }
    } catch (error) {
      console.error('Error fetching sync config:', error);
    }
  };

  const handleCreateGitHubIssue = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}/create-github-issue`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Created GitHub Issue #${data.issue_number}`);
        // Update task with GitHub info
        onUpdate({
          ...task,
          github_issue_id: data.issue_id,
          github_issue_number: data.issue_number,
          github_issue_url: data.issue_url
        });
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to create GitHub issue');
      }
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
      toast.error('Failed to create GitHub issue');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToGitHub = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_URL}/api/task-manager/tasks/${task.id}/sync-github?changed_fields=title&changed_fields=description&changed_fields=status`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (res.ok) {
        toast.success('Synced to GitHub');
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing to GitHub:', error);
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Don't show if GitHub sync not enabled for this project
  if (!syncConfig?.is_enabled) {
    return null;
  }

  // Task is linked to GitHub issue
  if (task.github_issue_number) {
    return (
      <div className="bg-slate-50 rounded-lg p-3 border" data-testid="github-sync-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">GitHub Issue</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={task.github_issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm flex items-center gap-1"
            >
              #{task.github_issue_number}
              <ExternalLink className="w-3 h-3" />
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSyncToGitHub}
              disabled={syncing}
              title="Sync changes to GitHub"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle className="w-3 h-3 text-green-500" />
          Linked to {task.github_repo}
          {task.github_synced_at && (
            <span>
              • Last synced {new Date(task.github_synced_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Task not linked - show button to create
  return (
    <div className="bg-slate-50 rounded-lg p-3 border" data-testid="github-sync-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">GitHub</span>
          <Badge variant="outline" className="text-xs">Not linked</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateGitHubIssue}
          disabled={loading}
          data-testid="create-github-issue-btn"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <LinkIcon className="w-4 h-4 mr-1" />
          )}
          Create Issue
        </Button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Create a GitHub issue to track this task in {syncConfig.repository_full_name}
      </p>
    </div>
  );
};

export default GitHubSyncSection;
