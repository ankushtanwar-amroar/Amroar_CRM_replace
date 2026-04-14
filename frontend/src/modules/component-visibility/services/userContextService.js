/**
 * User Context Provider
 * Provides user context for visibility rule evaluation
 */

// Cache for user context
let cachedUserContext = null;
let contextLoadPromise = null;

/**
 * Get user context from localStorage/auth state
 */
export const getUserContext = () => {
  // Return cached if available
  if (cachedUserContext) {
    return cachedUserContext;
  }
  
  try {
    // Try to get from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      cachedUserContext = {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
        profile: user.profile || 'standard_user',
        isAdmin: user.is_admin || user.isAdmin || false,
        permissions: user.permissions || {},
      };
      return cachedUserContext;
    }
  } catch (e) {
    console.warn('Failed to parse user context:', e);
  }
  
  return null;
};

/**
 * Clear cached user context (call on logout)
 */
export const clearUserContext = () => {
  cachedUserContext = null;
  contextLoadPromise = null;
};

/**
 * Update user context
 */
export const setUserContext = (context) => {
  cachedUserContext = context;
};

/**
 * Check if user has a specific role
 */
export const hasRole = (role) => {
  const context = getUserContext();
  if (!context) return false;
  return context.role === role;
};

/**
 * Check if user has a specific permission
 */
export const hasPermission = (permission) => {
  const context = getUserContext();
  if (!context || !context.permissions) return false;
  return context.permissions[permission] === true;
};

/**
 * Check if user is admin
 */
export const isAdmin = () => {
  const context = getUserContext();
  return context?.isAdmin === true;
};

export default getUserContext;
