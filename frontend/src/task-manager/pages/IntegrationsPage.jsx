/**
 * Integrations Page - Phase 12 Enhanced
 * Slack and GitHub Bi-directional Sync integrations
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import {
  ArrowLeft,
  MessageSquare,
  GitBranch,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Settings,
  Bell,
  Link,
  Copy,
  RefreshCw,
  Send,
  ExternalLink,
  ArrowRightLeft,
  Shield,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Default status mappings
const DEFAULT_STATUS_MAPPING = {
  todo: 'open',
  in_progress: 'open',
  blocked: 'open',
  pending_approval: 'open',
  done: 'closed'
};

const DEFAULT_REVERSE_MAPPING = {
  open: 'todo',
  closed: 'done'
};

const IntegrationsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'slack');
  const [loading, setLoading] = useState(true);
  
  // Slack state
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackConfig, setSlackConfig] = useState({ is_enabled: false, default_channel: null });
  const [slackUserSettings, setSlackUserSettings] = useState(null);
  const [slackUsers, setSlackUsers] = useState([]);
  const [slackChannels, setSlackChannels] = useState([]);
  const [savingSlack, setSavingSlack] = useState(false);
  
  // GitHub state
  const [githubStatus, setGithubStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectSyncConfigs, setProjectSyncConfigs] = useState({});
  const [showGitHubSetup, setShowGitHubSetup] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [githubSetupStep, setGithubSetupStep] = useState(1);
  const [oauthData, setOauthData] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [savingGitHub, setSavingGitHub] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  
  // GitHub sync form
  const [syncForm, setSyncForm] = useState({
    repository_full_name: '',
    repository_url: '',
    access_token: '',
    is_enabled: true,
    auto_create_task: false,
    auto_close_task: true,
    sync_comments: false,
    status_mapping: DEFAULT_STATUS_MAPPING,
    reverse_status_mapping: DEFAULT_REVERSE_MAPPING
  });

  const fetchSlackStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/slack/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSlackStatus(data);
        setSlackConfig({
          is_enabled: data.config?.is_enabled || false,
          default_channel: data.config?.default_channel || null
        });
      }
    } catch (error) {
      console.error('Error fetching Slack status:', error);
    }
  }, []);

  const fetchSlackUserSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/slack/user-settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSlackUserSettings(data);
      }
    } catch (error) {
      console.error('Error fetching Slack user settings:', error);
    }
  }, []);

  const fetchSlackResources = useCallback(async () => {
    const token = localStorage.getItem('token');
    
    const [usersRes, channelsRes] = await Promise.all([
      fetch(`${API_URL}/api/task-manager/integrations/slack/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch(`${API_URL}/api/task-manager/integrations/slack/channels`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ]);
    
    if (usersRes.ok) {
      const data = await usersRes.json();
      setSlackUsers(data.users || []);
    }
    
    if (channelsRes.ok) {
      const data = await channelsRes.json();
      setSlackChannels(data.channels || []);
    }
  }, []);

  const fetchGitHubStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/github/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGithubStatus(data);
      }
    } catch (error) {
      console.error('Error fetching GitHub status:', error);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
        
        // Fetch sync config for each project
        const configs = {};
        for (const project of data) {
          const configRes = await fetch(`${API_URL}/api/task-manager/projects/${project.id}/github-sync`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (configRes.ok) {
            const configData = await configRes.json();
            if (configData.config) {
              configs[project.id] = configData.config;
            }
          }
        }
        setProjectSyncConfigs(configs);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSlackStatus(),
        fetchSlackUserSettings(),
        fetchGitHubStatus(),
        fetchProjects()
      ]);
      setLoading(false);
    };
    loadData();
  }, [fetchSlackStatus, fetchSlackUserSettings, fetchGitHubStatus, fetchProjects]);

  useEffect(() => {
    if (slackStatus?.connection?.status === 'connected') {
      fetchSlackResources();
    }
  }, [slackStatus, fetchSlackResources]);

  const handleSaveSlackConfig = async () => {
    setSavingSlack(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/slack/config`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackConfig)
      });
      
      if (res.ok) {
        toast.success('Slack configuration saved');
        fetchSlackStatus();
      } else {
        toast.error('Failed to save Slack configuration');
      }
    } catch (error) {
      console.error('Error saving Slack config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleSaveSlackUserSettings = async () => {
    setSavingSlack(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/slack/user-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackUserSettings)
      });
      
      if (res.ok) {
        toast.success('Notification settings saved');
      } else {
        toast.error('Failed to save notification settings');
      }
    } catch (error) {
      console.error('Error saving Slack user settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/integrations/slack/test-notification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        toast.success('Test notification sent! Check your Slack.');
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Error sending test:', error);
      toast.error('Failed to send test notification');
    }
  };

  // GitHub OAuth flow
  const startGitHubOAuth = async (projectId) => {
    setSelectedProject(projectId);
    setGithubSetupStep(1);
    setShowGitHubSetup(true);
    
    try {
      const token = localStorage.getItem('token');
      const redirectUri = `${window.location.origin}/task-manager/integrations?tab=github&oauth=callback`;
      
      const res = await fetch(`${API_URL}/api/task-manager/integrations/github/oauth-url?redirect_uri=${encodeURIComponent(redirectUri)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Open OAuth in new window
        const popup = window.open(data.oauth_url, 'github_oauth', 'width=600,height=700');
        
        // Poll for completion
        const pollInterval = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(pollInterval);
            // Check if we have stored OAuth data
            const storedData = sessionStorage.getItem('github_oauth_data');
            if (storedData) {
              const parsed = JSON.parse(storedData);
              setOauthData(parsed);
              setGithubRepos(parsed.repositories || []);
              setSyncForm(prev => ({ ...prev, access_token: parsed.access_token }));
              setGithubSetupStep(2);
              sessionStorage.removeItem('github_oauth_data');
            }
          }
        }, 500);
      } else {
        toast.error('Failed to start GitHub authorization');
        setShowGitHubSetup(false);
      }
    } catch (error) {
      console.error('OAuth error:', error);
      toast.error('Failed to connect to GitHub');
      setShowGitHubSetup(false);
    }
  };

  // Handle OAuth callback (from URL params)
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      
      if (code && state) {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/task-manager/integrations/github/oauth-callback?code=${code}&state=${state}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (res.ok) {
            const data = await res.json();
            // Store data for parent window
            sessionStorage.setItem('github_oauth_data', JSON.stringify(data));
            // If this is a popup, close it
            if (window.opener) {
              window.close();
            }
          } else {
            toast.error('GitHub authorization failed');
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
        }
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    
    handleOAuthCallback();
  }, []);

  const handleSelectRepo = (repo) => {
    setSyncForm(prev => ({
      ...prev,
      repository_full_name: repo.full_name,
      repository_url: repo.html_url
    }));
    setGithubSetupStep(3);
  };

  const handleSaveGitHubSync = async () => {
    if (!selectedProject) return;
    
    setSavingGitHub(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects/${selectedProject}/github-sync`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(syncForm)
      });
      
      if (res.ok) {
        toast.success('GitHub sync configured successfully');
        setShowGitHubSetup(false);
        fetchProjects();
        resetGitHubSetup();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving GitHub sync:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSavingGitHub(false);
    }
  };

  const handleDisableGitHubSync = async (projectId) => {
    if (!window.confirm('Disable GitHub sync for this project?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects/${projectId}/github-sync`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        toast.success('GitHub sync disabled');
        fetchProjects();
      } else {
        toast.error('Failed to disable sync');
      }
    } catch (error) {
      console.error('Error disabling sync:', error);
      toast.error('Failed to disable sync');
    }
  };

  const fetchSyncLogs = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/projects/${projectId}/github-sync/logs?limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSyncLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching sync logs:', error);
    }
  };

  const resetGitHubSetup = () => {
    setSelectedProject(null);
    setGithubSetupStep(1);
    setOauthData(null);
    setGithubRepos([]);
    setSyncForm({
      repository_full_name: '',
      repository_url: '',
      access_token: '',
      is_enabled: true,
      auto_create_task: false,
      auto_close_task: true,
      sync_comments: false,
      status_mapping: DEFAULT_STATUS_MAPPING,
      reverse_status_mapping: DEFAULT_REVERSE_MAPPING
    });
  };

  const copyWebhookUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Webhook URL copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 pb-8" data-testid="integrations-page">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/task-manager')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Integrations</h1>
            <p className="text-sm text-slate-500">Connect external services</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="slack" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Slack
            </TabsTrigger>
            <TabsTrigger value="github" className="flex items-center gap-2" data-testid="github-tab">
              <GitBranch className="w-4 h-4" />
              GitHub
            </TabsTrigger>
          </TabsList>

          {/* Slack Tab - Same as before */}
          <TabsContent value="slack">
            <div className="space-y-6">
              {/* Connection Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Slack Connection
                  </CardTitle>
                  <CardDescription>
                    Connect your Slack workspace to receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {slackStatus?.connection?.status === 'connected' ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="font-medium text-green-700">Connected</p>
                            <p className="text-sm text-slate-500">
                              Workspace: {slackStatus.connection.team}
                            </p>
                          </div>
                        </>
                      ) : slackStatus?.connection?.status === 'not_configured' ? (
                        <>
                          <AlertCircle className="w-5 h-5 text-amber-500" />
                          <div>
                            <p className="font-medium text-amber-700">Not Configured</p>
                            <p className="text-sm text-slate-500">
                              Set SLACK_BOT_TOKEN in environment
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 text-red-500" />
                          <div>
                            <p className="font-medium text-red-700">Error</p>
                            <p className="text-sm text-slate-500">
                              {slackStatus?.connection?.message || 'Connection failed'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={fetchSlackStatus}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Global Settings */}
              {slackStatus?.connection?.status === 'connected' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Workspace Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Slack Notifications</Label>
                        <p className="text-sm text-slate-500">
                          Allow notifications to be sent to Slack
                        </p>
                      </div>
                      <Switch
                        checked={slackConfig.is_enabled}
                        onCheckedChange={(checked) => 
                          setSlackConfig(prev => ({ ...prev, is_enabled: checked }))
                        }
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Default Channel</Label>
                      <Select
                        value={slackConfig.default_channel || 'none'}
                        onValueChange={(value) => 
                          setSlackConfig(prev => ({ ...prev, default_channel: value === 'none' ? null : value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select default channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {slackChannels.map(channel => (
                            <SelectItem key={channel.id} value={channel.id}>
                              #{channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button onClick={handleSaveSlackConfig} disabled={savingSlack}>
                      {savingSlack && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Workspace Settings
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* User Settings */}
              {slackStatus?.connection?.status === 'connected' && slackUserSettings && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5" />
                      Your Notification Preferences
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Slack for Me</Label>
                        <p className="text-sm text-slate-500">
                          Receive notifications via Slack
                        </p>
                      </div>
                      <Switch
                        checked={slackUserSettings.slack_enabled}
                        onCheckedChange={(checked) => 
                          setSlackUserSettings(prev => ({ ...prev, slack_enabled: checked }))
                        }
                      />
                    </div>
                    
                    {slackUserSettings.slack_enabled && (
                      <>
                        <div className="space-y-2">
                          <Label>Your Slack User</Label>
                          <Select
                            value={slackUserSettings.slack_user_id || ''}
                            onValueChange={(value) => 
                              setSlackUserSettings(prev => ({ ...prev, slack_user_id: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select your Slack account" />
                            </SelectTrigger>
                            <SelectContent>
                              {slackUsers.map(user => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.real_name || user.name} ({user.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="border-t pt-4 mt-4">
                          <p className="text-sm font-medium mb-3">Notify me when:</p>
                          <div className="space-y-3">
                            {[
                              { key: 'notify_task_assigned', label: 'Task is assigned to me' },
                              { key: 'notify_mentioned', label: 'I am @mentioned in a comment' },
                              { key: 'notify_urgent', label: 'My task is marked urgent' },
                              { key: 'notify_overdue', label: 'My task becomes overdue' },
                              { key: 'notify_dependency_unblocked', label: 'A blocking task is completed' },
                            ].map(item => (
                              <div key={item.key} className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">{item.label}</span>
                                <Switch
                                  checked={slackUserSettings[item.key]}
                                  onCheckedChange={(checked) => 
                                    setSlackUserSettings(prev => ({ ...prev, [item.key]: checked }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    
                    <div className="flex items-center gap-2 pt-2">
                      <Button onClick={handleSaveSlackUserSettings} disabled={savingSlack}>
                        {savingSlack && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Save My Preferences
                      </Button>
                      
                      {slackUserSettings.slack_enabled && slackUserSettings.slack_user_id && (
                        <Button variant="outline" onClick={handleSendTestNotification}>
                          <Send className="w-4 h-4 mr-1" />
                          Test
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Slash Commands & Interactive Components - Phase 13 */}
              {slackStatus?.connection?.status === 'connected' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Slash Commands & Interactions
                      <Badge variant="outline" className="ml-2 text-xs">Phase 13</Badge>
                    </CardTitle>
                    <CardDescription>
                      Enable /task commands and interactive modals in Slack
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-blue-900 mb-2">Available Commands</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• <code>/task create</code> - Open task creation modal</li>
                        <li>• <code>/task status TM-123</code> - View task details</li>
                        <li>• <code>/task my</code> - View your open tasks</li>
                        <li>• <code>/task help</code> - Show help</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Slash Commands</Label>
                        <p className="text-sm text-slate-500">
                          Allow /task commands in Slack
                        </p>
                      </div>
                      <Switch
                        checked={true}
                        disabled
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Interactive Components</Label>
                        <p className="text-sm text-slate-500">
                          Allow buttons and dropdowns in Slack messages
                        </p>
                      </div>
                      <Switch
                        checked={true}
                        disabled
                      />
                    </div>

                    <div className="bg-slate-50 p-3 rounded border">
                      <p className="text-sm text-slate-600">
                        <strong>Setup Required:</strong> To use slash commands, configure the following in your Slack App settings:
                      </p>
                      <ul className="text-sm text-slate-500 mt-2 space-y-1">
                        <li>• Request URL: <code className="bg-slate-200 px-1 text-xs">{`${API_URL}/api/task-manager/integrations/slack/slash-command`}</code></li>
                        <li>• Interactivity URL: <code className="bg-slate-200 px-1 text-xs">{`${API_URL}/api/task-manager/integrations/slack/interactive`}</code></li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* GitHub Tab - Enhanced for Phase 12 */}
          <TabsContent value="github">
            <div className="space-y-6">
              {/* GitHub App Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5" />
                    GitHub Bi-directional Sync
                    <Badge variant="outline" className="ml-2 text-xs">Phase 12</Badge>
                  </CardTitle>
                  <CardDescription>
                    Synchronize tasks with GitHub Issues in both directions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {githubStatus?.configured ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="font-medium text-green-700">GitHub App Configured</p>
                            <p className="text-sm text-slate-500">
                              Ready to connect projects
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-amber-500" />
                          <div>
                            <p className="font-medium text-amber-700">Not Configured</p>
                            <p className="text-sm text-slate-500">
                              Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchGitHubStatus}>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Refresh
                    </Button>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 flex items-center gap-2 mb-2">
                      <ArrowRightLeft className="w-4 h-4" />
                      Bi-directional Sync Features
                    </h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• <strong>Task → GitHub:</strong> Create issues from tasks, sync changes</li>
                      <li>• <strong>GitHub → Task:</strong> Auto-create tasks, sync status on close/merge</li>
                      <li>• Configurable status mapping</li>
                      <li>• Optional comment synchronization</li>
                      <li>• Conflict resolution with audit logging</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Project Sync Configurations */}
              <Card>
                <CardHeader>
                  <CardTitle>Project GitHub Connections</CardTitle>
                  <CardDescription>
                    Configure GitHub sync per project (opt-in)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>No projects found. Create a project first.</p>
                    </div>
                  ) : (
                    <Accordion type="single" collapsible className="w-full">
                      {projects.map(project => {
                        const config = projectSyncConfigs[project.id];
                        const isConnected = config?.is_enabled;
                        
                        return (
                          <AccordionItem key={project.id} value={project.id}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
                                <span className="font-medium">{project.name}</span>
                                {isConnected && (
                                  <Badge variant="secondary" className="text-xs">
                                    {config.repository_full_name}
                                  </Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              {isConnected ? (
                                <div className="space-y-4 pt-2">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <p className="text-slate-500">Repository</p>
                                      <a 
                                        href={config.repository_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline flex items-center gap-1"
                                      >
                                        {config.repository_full_name}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                    <div>
                                      <p className="text-slate-500">Sync Status</p>
                                      <p className="text-green-600 font-medium">Active</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-wrap gap-2">
                                    {config.auto_create_task && (
                                      <Badge variant="outline">Auto-create tasks</Badge>
                                    )}
                                    {config.auto_close_task && (
                                      <Badge variant="outline">Auto-close on merge</Badge>
                                    )}
                                    {config.sync_comments && (
                                      <Badge variant="outline">Sync comments</Badge>
                                    )}
                                  </div>
                                  
                                  <div className="bg-slate-50 p-3 rounded">
                                    <p className="text-xs text-slate-500 mb-1">Webhook URL</p>
                                    <div className="flex items-center gap-2">
                                      <code className="text-xs bg-slate-200 px-2 py-1 rounded truncate flex-1">
                                        {config.webhook_url}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyWebhookUrl(config.webhook_url)}
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fetchSyncLogs(project.id)}
                                    >
                                      <Clock className="w-4 h-4 mr-1" />
                                      View Sync Logs
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => handleDisableGitHubSync(project.id)}
                                    >
                                      Disable Sync
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-2">
                                  <p className="text-slate-500 text-sm mb-3">
                                    GitHub sync is not configured for this project.
                                  </p>
                                  <Button
                                    onClick={() => startGitHubOAuth(project.id)}
                                    disabled={!githubStatus?.configured}
                                    data-testid={`connect-github-${project.id}`}
                                  >
                                    <Link className="w-4 h-4 mr-2" />
                                    Connect GitHub Repository
                                  </Button>
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </CardContent>
              </Card>

              {/* Sync Logs Panel */}
              {syncLogs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Recent Sync Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {syncLogs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-2 bg-slate-50 rounded text-sm">
                          <div className={`w-2 h-2 rounded-full mt-1.5 ${
                            log.event_type.includes('error') ? 'bg-red-500' :
                            log.event_type.includes('conflict') ? 'bg-amber-500' : 'bg-green-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{log.description}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(log.created_at).toLocaleString()} • {log.event_type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setSyncLogs([])}
                    >
                      Close
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* How it Works */}
              <Card>
                <CardHeader>
                  <CardTitle>How Bi-directional Sync Works</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm text-slate-600">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-slate-900 mb-2">Task → GitHub</h4>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Click &quot;Create GitHub Issue&quot; on any task</li>
                        <li>Issue created with task details</li>
                        <li>Title/description/status changes sync automatically</li>
                        <li>Comments sync if enabled</li>
                      </ol>
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900 mb-2">GitHub → Task</h4>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>New issue → Optional task creation</li>
                        <li>Issue closed → Task marked done</li>
                        <li>PR merged → Task marked done</li>
                        <li>Use <code className="bg-slate-100 px-1">TM-{'{id}'}</code> to link</li>
                      </ol>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                    <p className="text-amber-800 text-sm flex items-start gap-2">
                      <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>Safety:</strong> Tasks pending approval cannot be modified via GitHub sync.
                        Conflicts are logged with &quot;last-write-wins&quot; strategy.
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* GitHub Setup Dialog */}
      <Dialog open={showGitHubSetup} onOpenChange={(open) => { if (!open) resetGitHubSetup(); setShowGitHubSetup(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect GitHub Repository</DialogTitle>
            <DialogDescription>
              Step {githubSetupStep} of 3: {
                githubSetupStep === 1 ? 'Authorize GitHub' :
                githubSetupStep === 2 ? 'Select Repository' : 'Configure Sync'
              }
            </DialogDescription>
          </DialogHeader>
          
          {githubSetupStep === 1 && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-600">Waiting for GitHub authorization...</p>
              <p className="text-sm text-slate-500 mt-2">
                Complete the authorization in the popup window
              </p>
            </div>
          )}
          
          {githubSetupStep === 2 && (
            <div className="space-y-4 py-4">
              {oauthData?.github_user && (
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">Connected as {oauthData.github_user.login}</p>
                    <p className="text-sm text-green-600">{oauthData.github_user.name}</p>
                  </div>
                </div>
              )}
              
              <div>
                <Label>Select Repository</Label>
                <div className="mt-2 max-h-64 overflow-y-auto border rounded-lg divide-y">
                  {githubRepos.map(repo => (
                    <div
                      key={repo.id}
                      className={`p-3 cursor-pointer hover:bg-slate-50 flex items-center justify-between ${
                        syncForm.repository_full_name === repo.full_name ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleSelectRepo(repo)}
                    >
                      <div>
                        <p className="font-medium">{repo.full_name}</p>
                        <p className="text-xs text-slate-500">{repo.private ? 'Private' : 'Public'}</p>
                      </div>
                      {syncForm.repository_full_name === repo.full_name && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {githubSetupStep === 3 && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Selected Repository</p>
                <p className="font-medium">{syncForm.repository_full_name}</p>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium">Sync Options</h4>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-create tasks from issues</Label>
                    <p className="text-xs text-slate-500">Create task when new issue is opened</p>
                  </div>
                  <Switch
                    checked={syncForm.auto_create_task}
                    onCheckedChange={(v) => setSyncForm(p => ({ ...p, auto_create_task: v }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-close tasks</Label>
                    <p className="text-xs text-slate-500">Update task when issue closed or PR merged</p>
                  </div>
                  <Switch
                    checked={syncForm.auto_close_task}
                    onCheckedChange={(v) => setSyncForm(p => ({ ...p, auto_close_task: v }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Sync comments</Label>
                    <p className="text-xs text-slate-500">Sync task comments to GitHub (optional)</p>
                  </div>
                  <Switch
                    checked={syncForm.sync_comments}
                    onCheckedChange={(v) => setSyncForm(p => ({ ...p, sync_comments: v }))}
                  />
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetGitHubSetup(); setShowGitHubSetup(false); }}>
              Cancel
            </Button>
            {githubSetupStep === 3 && (
              <Button onClick={handleSaveGitHubSync} disabled={savingGitHub}>
                {savingGitHub && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Configuration
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsPage;
