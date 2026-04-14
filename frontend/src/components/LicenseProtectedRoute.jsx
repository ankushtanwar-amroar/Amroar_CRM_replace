/**
 * LicenseProtectedRoute - Route wrapper for license enforcement
 * 
 * Wraps routes that require a specific license. If the user doesn't have
 * access, it shows an Access Denied page instead of the component.
 * 
 * Usage:
 * <Route 
 *   path="/flows" 
 *   element={
 *     <LicenseProtectedRoute module="flow_builder">
 *       <FlowBuilderPage />
 *     </LicenseProtectedRoute>
 *   }
 * />
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Lock,
  AlertTriangle,
  ArrowLeft,
  Home,
  Loader,
  ShieldAlert
} from 'lucide-react';
import { Button } from '../components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Access Denied Page Component
 */
const AccessDeniedPage = ({ 
  moduleName, 
  reason, 
  reasonCode,
  onGoBack,
  onGoHome 
}) => {
  // Determine the icon and message based on reason code
  let Icon = Lock;
  let title = 'Access Restricted';
  let description = reason || 'You do not have access to this feature.';
  
  switch (reasonCode) {
    case 'tenant_license_missing':
      Icon = ShieldAlert;
      title = 'Module Not Purchased';
      description = 'Your organization has not purchased this module. Please contact your administrator to enable this feature.';
      break;
    case 'user_license_missing':
      Icon = Lock;
      title = 'License Seat Required';
      description = 'You need a license seat assigned to access this feature. Please contact your administrator.';
      break;
    case 'version_not_supported':
      Icon = AlertTriangle;
      title = 'Version Upgrade Required';
      description = 'This feature requires a newer platform version. Please contact your administrator to upgrade.';
      break;
    case 'permission_missing':
      Icon = Lock;
      title = 'Permission Required';
      description = 'You do not have permission to access this feature. Please contact your administrator.';
      break;
    default:
      break;
  }
  
  return (
    <div 
      className="min-h-[70vh] flex items-center justify-center p-8"
      data-testid="access-denied-page"
    >
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <Icon className="w-10 h-10 text-red-500" />
        </div>
        
        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          {title}
        </h1>
        
        {/* Module Name */}
        {moduleName && (
          <p className="text-lg text-slate-600 mb-4">
            {moduleName}
          </p>
        )}
        
        {/* Description */}
        <p className="text-slate-500 mb-8 leading-relaxed">
          {description}
        </p>
        
        {/* Reason Code Badge */}
        {reasonCode && (
          <div className="mb-8">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              Code: {reasonCode}
            </span>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={onGoBack}
            className="flex items-center gap-2"
            data-testid="access-denied-go-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
          <Button
            onClick={onGoHome}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
            data-testid="access-denied-go-home"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Button>
        </div>
        
        {/* Help Text */}
        <p className="mt-8 text-xs text-slate-400">
          If you believe you should have access, please contact your system administrator.
        </p>
      </div>
    </div>
  );
};

/**
 * License Protected Route Component
 * 
 * Props:
 * - module: Module key to check (e.g., 'flow_builder')
 * - moduleName: Human-readable name for error display
 * - children: Component to render if access is granted
 * - fallback: Custom component to show if access denied
 * - loadingComponent: Custom loading component
 */
const LicenseProtectedRoute = ({ 
  module: moduleKey,
  moduleName,
  children,
  fallback,
  loadingComponent
}) => {
  const navigate = useNavigate();
  const [accessStatus, setAccessStatus] = useState({
    loading: true,
    allowed: false,
    reason: null,
    reasonCode: null
  });
  
  useEffect(() => {
    const checkAccess = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        // Not authenticated, redirect to login
        navigate('/login');
        return;
      }
      
      try {
        const response = await axios.get(
          `${BACKEND_URL}/api/feature-access/check/${moduleKey}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setAccessStatus({
          loading: false,
          allowed: response.data.allowed,
          reason: response.data.reason,
          reasonCode: response.data.reason_code
        });
      } catch (err) {
        console.error('Failed to check feature access:', err);
        // On error, allow access (backend will still enforce)
        setAccessStatus({
          loading: false,
          allowed: true,
          reason: null,
          reasonCode: null
        });
      }
    };
    
    checkAccess();
  }, [moduleKey, navigate]);
  
  // Loading state
  if (accessStatus.loading) {
    if (loadingComponent) {
      return loadingComponent;
    }
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }
  
  // Access denied
  if (!accessStatus.allowed) {
    if (fallback) {
      return fallback;
    }
    return (
      <AccessDeniedPage
        moduleName={moduleName || moduleKey?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        reason={accessStatus.reason}
        reasonCode={accessStatus.reasonCode}
        onGoBack={() => navigate(-1)}
        onGoHome={() => navigate('/')}
      />
    );
  }
  
  // Access granted
  return children;
};

export default LicenseProtectedRoute;
export { AccessDeniedPage };
