import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SimpleLightningPageBuilder from '../components/SimpleLightningPageBuilder';
import toast from 'react-hot-toast';

/**
 * Lightning Page Builder Page
 * Route-based page for building custom Lightning layouts
 * Access via: /crm-platform/lightning-builder?object=<objectName>&mode=<detail|new>&pageId=<id>&create=<true|false>
 */
const LightningPageBuilderPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const objectName = searchParams.get('object');
  const pageMode = searchParams.get('mode') || 'detail';  // "detail" or "new"
  const pageId = searchParams.get('pageId');
  const isCreateMode = searchParams.get('create') === 'true';

  useEffect(() => {
    // Redirect if no object specified
    if (!objectName) {
      toast.error('No object specified');
      navigate('/crm-platform');
    }
  }, [objectName, navigate]);

  const handleClose = () => {
    // Navigate back to the previous page or CRM console
    navigate(-1);
  };

  const handleSave = () => {
    toast.success('Page layout saved successfully!');
    // Navigate back after a short delay
    setTimeout(() => {
      navigate(-1);
    }, 1000);
  };

  if (!objectName) {
    return null;
  }

  return (
    <SimpleLightningPageBuilder
      objectName={objectName}
      onClose={handleClose}
      onSave={handleSave}
      initialPageId={pageId}
      pageMode={pageMode}
      isCreateMode={isCreateMode}
    />
  );
};

export default LightningPageBuilderPage;
