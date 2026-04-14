import React, { createContext, useContext, useState, useCallback } from 'react';

const ConsoleContext = createContext();

export const useConsole = () => {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error('useConsole must be used within ConsoleProvider');
  }
  return context;
};

/**
 * Safe version of useConsole that returns null if outside provider
 * Use this in components that may be rendered in different contexts
 */
export const useConsoleSafe = () => {
  return useContext(ConsoleContext);
};

export const ConsoleProvider = ({ children }) => {
  const [primaryTabs, setPrimaryTabs] = useState([]);
  const [activePrimaryTabId, setActivePrimaryTabId] = useState(null);
  const [subtabsByPrimaryTab, setSubtabsByPrimaryTab] = useState({});
  const [activeSubtabIds, setActiveSubtabIds] = useState({});

  // Open a primary tab
  const openPrimaryTab = useCallback((tab) => {
    const existingTab = primaryTabs.find(t => t.id === tab.id);
    if (existingTab) {
      setActivePrimaryTabId(tab.id);
      return;
    }

    const newTab = {
      id: tab.id || `tab-${Date.now()}`,
      title: tab.title,
      type: tab.type, // 'record', 'list', 'custom'
      objectType: tab.objectType,
      recordId: tab.recordId,
      publicId: tab.publicId,
      icon: tab.icon,
      closeable: tab.closeable !== false,
      ...tab
    };

    setPrimaryTabs(prev => [...prev, newTab]);
    setActivePrimaryTabId(newTab.id);
    setSubtabsByPrimaryTab(prev => ({ ...prev, [newTab.id]: [] }));
    setActiveSubtabIds(prev => ({ ...prev, [newTab.id]: null }));
  }, [primaryTabs]);

  // Open a subtab under a primary tab
  const openSubtab = useCallback((primaryTabId, subtab) => {
    const existingSubtabs = subtabsByPrimaryTab[primaryTabId] || [];
    const existingSubtab = existingSubtabs.find(t => t.id === subtab.id);
    
    if (existingSubtab) {
      setActiveSubtabIds(prev => ({ ...prev, [primaryTabId]: subtab.id }));
      return;
    }

    const newSubtab = {
      id: subtab.id || `subtab-${Date.now()}`,
      title: subtab.title,
      type: subtab.type,
      objectType: subtab.objectType,
      recordId: subtab.recordId,
      publicId: subtab.publicId,
      icon: subtab.icon,
      closeable: subtab.closeable !== false,
      ...subtab
    };

    setSubtabsByPrimaryTab(prev => ({
      ...prev,
      [primaryTabId]: [...(prev[primaryTabId] || []), newSubtab]
    }));
    setActiveSubtabIds(prev => ({ ...prev, [primaryTabId]: newSubtab.id }));
  }, [subtabsByPrimaryTab]);

  // Close a primary tab
  const closePrimaryTab = useCallback((tabId) => {
    setPrimaryTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (activePrimaryTabId === tabId && filtered.length > 0) {
        setActivePrimaryTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
    setSubtabsByPrimaryTab(prev => {
      const updated = { ...prev };
      delete updated[tabId];
      return updated;
    });
    setActiveSubtabIds(prev => {
      const updated = { ...prev };
      delete updated[tabId];
      return updated;
    });
  }, [activePrimaryTabId]);

  // Close a subtab
  const closeSubtab = useCallback((primaryTabId, subtabId) => {
    setSubtabsByPrimaryTab(prev => {
      const subtabs = prev[primaryTabId] || [];
      const filtered = subtabs.filter(t => t.id !== subtabId);
      
      if (activeSubtabIds[primaryTabId] === subtabId && filtered.length > 0) {
        setActiveSubtabIds(prevActive => ({
          ...prevActive,
          [primaryTabId]: filtered[filtered.length - 1].id
        }));
      } else if (filtered.length === 0) {
        setActiveSubtabIds(prevActive => ({
          ...prevActive,
          [primaryTabId]: null
        }));
      }
      
      return { ...prev, [primaryTabId]: filtered };
    });
  }, [activeSubtabIds]);

  // Open record as primary tab
  const openRecordAsPrimary = useCallback((objectType, recordId, publicId, title) => {
    openPrimaryTab({
      id: `record-${objectType}-${recordId}`,
      title: title || publicId || recordId,
      type: 'record',
      objectType,
      recordId,
      publicId,
      icon: 'file-text'
    });
  }, [openPrimaryTab]);

  // Open record as subtab
  const openRecordAsSubtab = useCallback((objectType, recordId, publicId, title) => {
    if (!activePrimaryTabId) {
      openRecordAsPrimary(objectType, recordId, publicId, title);
      return;
    }
    
    openSubtab(activePrimaryTabId, {
      id: `record-${objectType}-${recordId}`,
      title: title || publicId || recordId,
      type: 'record',
      objectType,
      recordId,
      publicId,
      icon: 'file-text'
    });
  }, [activePrimaryTabId, openPrimaryTab, openSubtab]);

  const value = {
    primaryTabs,
    activePrimaryTabId,
    subtabsByPrimaryTab,
    activeSubtabIds,
    openPrimaryTab,
    openSubtab,
    closePrimaryTab,
    closeSubtab,
    openRecordAsPrimary,
    openRecordAsSubtab,
    setActivePrimaryTabId,
    setActiveSubtabIds
  };

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
};
