import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ArrowLeft, FileSpreadsheet, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';

const ExportBuilder = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/setup')}
              className="text-slate-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Setup
            </Button>
            <div className="h-6 w-px bg-slate-300" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Export Builder</h1>
              <p className="text-sm text-slate-500">Export data to CSV files</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create New Export */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/setup/export-builder/wizard')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                Create New Export
              </CardTitle>
              <CardDescription>
                Start a new data export wizard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Export records from any object to CSV format with custom field selection and filters.
              </p>
              <Button className="w-full bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Start Export Wizard
              </Button>
            </CardContent>
          </Card>

          {/* View Export Jobs */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/setup/jobs')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Export Jobs
              </CardTitle>
              <CardDescription>
                View and manage export jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Monitor export job status, download files, and review export history.
              </p>
              <Button variant="outline" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                View All Jobs
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features Overview */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Export Builder Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ Object Selection</h4>
                <p className="text-xs text-slate-600">Choose any custom object to export</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ Field Selection</h4>
                <p className="text-xs text-slate-600">Pick specific fields for your export</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ Filters</h4>
                <p className="text-xs text-slate-600">Apply filters to export only relevant records</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ CSV Format</h4>
                <p className="text-xs text-slate-600">Download exports in standard CSV format</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ Async Processing</h4>
                <p className="text-xs text-slate-600">Large exports run in background</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">✓ Download History</h4>
                <p className="text-xs text-slate-600">Access exported files anytime</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExportBuilder;
