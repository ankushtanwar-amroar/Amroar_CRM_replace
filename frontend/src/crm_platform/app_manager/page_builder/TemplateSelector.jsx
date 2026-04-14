/**
 * Template Selector
 * 
 * Horizontal bar showing available page templates.
 * Allows switching between different layout configurations.
 */
import React from 'react';
import { LayoutGrid, Columns, PanelLeftClose } from 'lucide-react';

const templates = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Single column layout',
    icon: LayoutGrid,
    preview: (
      <div className="w-full h-full bg-slate-200 rounded" />
    )
  },
  {
    id: 'header_two_column',
    name: 'Header + Two Columns',
    description: 'Header with left/right columns',
    icon: Columns,
    preview: (
      <div className="w-full h-full flex flex-col gap-1">
        <div className="h-3 bg-slate-200 rounded" />
        <div className="flex-1 flex gap-1">
          <div className="flex-1 bg-slate-200 rounded" />
          <div className="flex-1 bg-slate-200 rounded" />
        </div>
      </div>
    )
  },
  {
    id: 'header_sidebar',
    name: 'Header + Sidebar',
    description: 'Header, main area, and sidebar',
    icon: PanelLeftClose,
    preview: (
      <div className="w-full h-full flex flex-col gap-1">
        <div className="h-3 bg-slate-200 rounded" />
        <div className="flex-1 flex gap-1">
          <div className="flex-[2] bg-slate-200 rounded" />
          <div className="flex-1 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }
];

const TemplateSelector = ({ currentTemplate, onTemplateChange }) => {
  return (
    <div 
      className="h-20 bg-white border-b border-slate-200 px-4 flex items-center gap-4 shrink-0"
      data-testid="template-selector"
    >
      <span className="text-sm font-medium text-slate-600">Template:</span>
      
      <div className="flex items-center gap-3">
        {templates.map((template) => {
          const isSelected = currentTemplate === template.id;
          const IconComponent = template.icon;
          
          return (
            <button
              key={template.id}
              onClick={() => onTemplateChange(template.id)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
              data-testid={`template-${template.id}`}
            >
              {/* Template preview thumbnail */}
              <div className={`w-12 h-10 p-1 rounded border ${
                isSelected ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50'
              }`}>
                {template.preview}
              </div>
              
              <div className="text-left">
                <p className={`text-sm font-medium ${
                  isSelected ? 'text-blue-700' : 'text-slate-700'
                }`}>
                  {template.name}
                </p>
                <p className="text-xs text-slate-400">
                  {template.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TemplateSelector;
