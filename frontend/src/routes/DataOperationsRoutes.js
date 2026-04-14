import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ImportBuilder from './pages/Setup/ImportBuilder/ImportWizard';
import ExportBuilder from './pages/Setup/ExportBuilder/ExportWizard';
import JobList from './pages/Setup/Jobs/JobList';
import ImportJobDetail from './pages/Setup/Jobs/ImportJobDetail';
import ExportJobDetail from './pages/Setup/Jobs/ExportJobDetail';

// Add these routes to your existing App.js routing
const DataOperationsRoutes = () => (
  <>
    <Route path="/setup/import-builder" element={<ImportBuilder />} />
    <Route path="/setup/import-builder/:jobId" element={<ImportBuilder />} />
    <Route path="/setup/export-builder" element={<ExportBuilder />} />
    <Route path="/setup/export-builder/:jobId" element={<ExportBuilder />} />
    <Route path="/setup/jobs" element={<JobList />} />
    <Route path="/setup/jobs/import/:jobId" element={<ImportJobDetail />} />
    <Route path="/setup/jobs/export/:jobId" element={<ExportJobDetail />} />
  </>
);

export default DataOperationsRoutes;
