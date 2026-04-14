/**
 * Features Page
 * Shows feature cards for different configuration modules
 * Located at: Setup → Features
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, ArrowRight, Settings } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

const FeaturesPage = () => {
  const navigate = useNavigate();

  const featureCards = [
    {
      id: 'search-config',
      title: 'Search Configuration',
      description: 'Configure which objects and fields appear in global search results. Control searchability and display priorities.',
      icon: Search,
      color: 'indigo',
      path: '/setup/features/configure-search',
      available: true,
    },
    {
      id: 'notification-config',
      title: 'Notification Configuration',
      description: 'Manage notification preferences, email templates, and alert settings for your organization.',
      icon: Bell,
      color: 'amber',
      path: '/setup/features/notifications',
      available: false, // Coming soon
    },
  ];

  const getColorClasses = (color, available) => {
    if (!available) {
      return {
        bg: 'bg-slate-100',
        iconBg: 'bg-slate-200',
        iconText: 'text-slate-400',
        border: 'border-slate-200',
        hover: '',
      };
    }
    
    const colors = {
      indigo: {
        bg: 'bg-indigo-50',
        iconBg: 'bg-indigo-100',
        iconText: 'text-indigo-600',
        border: 'border-indigo-200',
        hover: 'hover:border-indigo-400 hover:shadow-md',
      },
      amber: {
        bg: 'bg-amber-50',
        iconBg: 'bg-amber-100',
        iconText: 'text-amber-600',
        border: 'border-amber-200',
        hover: 'hover:border-amber-400 hover:shadow-md',
      },
    };
    return colors[color] || colors.indigo;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <Settings className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Features</h1>
            <p className="text-sm text-slate-500">Configure platform features and modules</p>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {featureCards.map((feature) => {
          const Icon = feature.icon;
          const colors = getColorClasses(feature.color, feature.available);
          
          return (
            <Card
              key={feature.id}
              className={`relative overflow-hidden transition-all cursor-pointer ${colors.border} ${colors.hover} ${
                !feature.available ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              onClick={() => feature.available && navigate(feature.path)}
              data-testid={`feature-card-${feature.id}`}
            >
              {/* Coming Soon Badge */}
              {!feature.available && (
                <div className="absolute top-3 right-3">
                  <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
                    Coming Soon
                  </span>
                </div>
              )}
              
              <CardHeader className="pb-2">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.iconBg}`}>
                    <Icon className={`h-6 w-6 ${colors.iconText}`} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-slate-800">
                      {feature.title}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <CardDescription className="text-sm text-slate-600 mb-4">
                  {feature.description}
                </CardDescription>
                
                {feature.available && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`p-0 h-auto font-medium ${colors.iconText} hover:bg-transparent`}
                  >
                    Configure
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Click on any available feature card to access its configuration page. 
          More features will be added in future updates.
        </p>
      </div>
    </div>
  );
};

export default FeaturesPage;
