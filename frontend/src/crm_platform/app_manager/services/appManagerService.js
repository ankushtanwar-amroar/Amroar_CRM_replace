/**
 * App Manager Service
 * 
 * API client for the App Manager module.
 * Handles apps, pages, navigation, and component data fetching.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL;

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// Apps
export const listApps = async (includeInactive = false) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps?include_inactive=${includeInactive}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch apps');
  return response.json();
};

export const getApp = async (appId) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch app');
  return response.json();
};

export const createApp = async (data) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('Failed to create app');
  return response.json();
};

export const updateApp = async (appId, data) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('Failed to update app');
  return response.json();
};

export const getAppHomePage = async (appId) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}/home`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch home page');
  return response.json();
};

export const getAppNavigation = async (appId) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}/navigation`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch navigation');
  return response.json();
};

export const updateAppNavigation = async (appId, data) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}/navigation`,
    {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('Failed to update navigation');
  return response.json();
};

// Pages
export const getPage = async (pageId) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/pages/${pageId}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch page');
  return response.json();
};

export const listAppPages = async (appId, includeHome = true) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/apps/${appId}/pages?include_home=${includeHome}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch pages');
  return response.json();
};

export const updatePage = async (pageId, data) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/pages/${pageId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('Failed to update page');
  return response.json();
};

export const createPage = async (data) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/pages`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('Failed to create page');
  return response.json();
};

export const deletePage = async (pageId) => {
  const response = await fetch(
    `${API_URL}/api/app-manager/pages/${pageId}`,
    {
      method: 'DELETE',
      headers: getHeaders()
    }
  );
  if (!response.ok) throw new Error('Failed to delete page');
  return response.json();
};

// Component Registry
export const getComponentRegistry = async (category = null) => {
  const url = category 
    ? `${API_URL}/api/app-manager/components/registry?category=${category}`
    : `${API_URL}/api/app-manager/components/registry`;
  const response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) throw new Error('Failed to fetch component registry');
  return response.json();
};

// Component Data Endpoints
export const getTasksDueData = async (config = {}) => {
  const params = new URLSearchParams({
    date_range: config.date_range || 'next_7_days',
    show_overdue: config.show_overdue !== false,
    max_rows: config.max_rows || 10,
    show_completed: config.show_completed || false
  });
  
  const response = await fetch(
    `${API_URL}/api/app-manager/components/data/tasks-due?${params}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
};

export const getPipelineSnapshotData = async (config = {}) => {
  const params = new URLSearchParams({
    object_type: config.object_type || 'opportunity',
    group_by: config.group_by || 'stage',
    display_mode: config.display_mode || 'both',
    date_range: config.date_range || 'this_quarter'
  });
  
  const response = await fetch(
    `${API_URL}/api/app-manager/components/data/pipeline-snapshot?${params}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch pipeline data');
  return response.json();
};

export const getWorkQueueData = async (config = {}) => {
  const params = new URLSearchParams({
    object_type: config.object_type || 'lead',
    inactivity_days: config.inactivity_days || 7,
    max_rows: config.max_rows || 10,
    sort_order: config.sort_order || 'oldest_first'
  });
  
  const response = await fetch(
    `${API_URL}/api/app-manager/components/data/work-queue?${params}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch work queue');
  return response.json();
};

export const getQuickActionsData = async () => {
  const response = await fetch(
    `${API_URL}/api/app-manager/components/data/quick-actions`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch quick actions');
  return response.json();
};

export const getRecentRecordsData = async (config = {}) => {
  const params = new URLSearchParams({
    record_type: config.record_type || 'viewed',
    object_filter: config.object_filter || 'all',
    max_rows: config.max_rows || 10
  });
  
  const response = await fetch(
    `${API_URL}/api/app-manager/components/data/recent-records?${params}`,
    { headers: getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch recent records');
  return response.json();
};

// Seed default Sales app
export const seedDefaultApp = async () => {
  const response = await fetch(
    `${API_URL}/api/app-manager/seed-default-app`,
    { 
      method: 'POST',
      headers: getHeaders() 
    }
  );
  if (!response.ok) throw new Error('Failed to seed default app');
  return response.json();
};

export default {
  listApps,
  getApp,
  getAppHomePage,
  getAppNavigation,
  getPage,
  listAppPages,
  getComponentRegistry,
  getTasksDueData,
  getPipelineSnapshotData,
  getWorkQueueData,
  getQuickActionsData,
  getRecentRecordsData,
  seedDefaultApp
};
