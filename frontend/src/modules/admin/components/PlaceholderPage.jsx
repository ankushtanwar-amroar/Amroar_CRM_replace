/**
 * Placeholder Page Component
 * Used for admin sections not yet implemented
 */
import React from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Construction } from 'lucide-react';

const PlaceholderPage = ({ title, description, icon: Icon = Construction }) => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-1">{description}</p>
      </div>

      <Card className="border-dashed border-2 border-slate-200">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <Icon className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700">Coming Soon</h2>
          <p className="text-slate-500 text-center max-w-md mt-2">
            This feature is currently under development. Check back soon for updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlaceholderPage;
