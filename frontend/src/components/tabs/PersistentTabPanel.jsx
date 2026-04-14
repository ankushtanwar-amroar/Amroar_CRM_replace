/**
 * PersistentTabPanel - Keeps tab content mounted when switching
 * 
 * Instead of conditionally rendering tabs which causes unmount/remount,
 * this component keeps all tab content in the DOM but visually hides inactive tabs.
 * 
 * Benefits:
 * - Prevents unnecessary re-renders
 * - Preserves component state (scroll position, form inputs)
 * - Enables instant tab switching
 * - Maintains cached data in components
 */
import React, { memo, useRef } from 'react';

/**
 * Persistent Tab Panel
 * Renders content but hides it when not active
 */
export const PersistentTabPanel = memo(({ 
  isActive, 
  children, 
  tabId,
  preserveMount = true,
  className = '',
}) => {
  const hasBeenActive = useRef(false);
  
  // Track if this panel has ever been active - update ref synchronously
  // to avoid the render-before-effect race condition
  if (isActive && !hasBeenActive.current) {
    hasBeenActive.current = true;
  }

  // Don't render at all if never been active and preserveMount is false
  // IMPORTANT: Check isActive FIRST to ensure we render active tabs immediately
  if (!isActive && !preserveMount && !hasBeenActive.current) {
    return null;
  }

  // If preserveMount is true, always render but hide when inactive
  // This keeps the component mounted for instant switching
  return (
    <div
      data-tab-id={tabId}
      className={`persistent-tab-panel ${className}`}
      style={{
        display: isActive ? 'block' : 'none',
        height: isActive ? 'auto' : '0',
        overflow: isActive ? 'visible' : 'hidden',
        visibility: isActive ? 'visible' : 'hidden',
        position: isActive ? 'relative' : 'absolute',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
      aria-hidden={!isActive}
      role="tabpanel"
    >
      {children}
    </div>
  );
});

PersistentTabPanel.displayName = 'PersistentTabPanel';

/**
 * Tab Panel Container
 * Manages multiple persistent tab panels
 */
export const PersistentTabContainer = memo(({
  tabs,
  activeTabId,
  renderTabContent,
  className = '',
  maxCachedTabs = 10,  // Maximum number of tabs to keep mounted
}) => {
  // Track which tabs have been opened (for lazy mounting)
  const mountedTabs = useRef(new Set());
  const tabOrderRef = useRef([]);

  // Update mounted tabs list
  useEffect(() => {
    if (activeTabId && !mountedTabs.current.has(activeTabId)) {
      mountedTabs.current.add(activeTabId);
      tabOrderRef.current = [activeTabId, ...tabOrderRef.current.filter(id => id !== activeTabId)];
      
      // Enforce max cached tabs - unmount oldest
      if (tabOrderRef.current.length > maxCachedTabs) {
        const tabsToUnmount = tabOrderRef.current.slice(maxCachedTabs);
        tabsToUnmount.forEach(id => mountedTabs.current.delete(id));
        tabOrderRef.current = tabOrderRef.current.slice(0, maxCachedTabs);
      }
    }
  }, [activeTabId, maxCachedTabs]);

  return (
    <div className={`persistent-tab-container ${className}`}>
      {tabs.map(tab => {
        const shouldMount = mountedTabs.current.has(tab.id);
        const isActive = tab.id === activeTabId;
        
        // Only render if the tab has been opened at least once
        if (!shouldMount && !isActive) {
          return null;
        }
        
        return (
          <PersistentTabPanel
            key={tab.id}
            tabId={tab.id}
            isActive={isActive}
            preserveMount={true}
          >
            {renderTabContent(tab)}
          </PersistentTabPanel>
        );
      })}
    </div>
  );
});

PersistentTabContainer.displayName = 'PersistentTabContainer';

/**
 * Hook for managing persistent tab state
 */
export const usePersistentTabs = (initialActiveId = null) => {
  const [activeTabId, setActiveTabId] = React.useState(initialActiveId);
  const mountedTabsRef = useRef(new Set());
  
  const activateTab = React.useCallback((tabId) => {
    mountedTabsRef.current.add(tabId);
    setActiveTabId(tabId);
  }, []);
  
  const isTabMounted = React.useCallback((tabId) => {
    return mountedTabsRef.current.has(tabId);
  }, []);
  
  return {
    activeTabId,
    activateTab,
    isTabMounted,
    mountedTabs: mountedTabsRef.current,
  };
};

export default PersistentTabPanel;
