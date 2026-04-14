import React from 'react';
import { Zap, Mail, Database, MessageSquare, GitBranch, CheckCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';

const NodePalette = ({ onAddNode }) => {
  const nodeTypes = [
    { type: 'trigger', label: 'Trigger (Start)', icon: Zap, color: 'bg-orange-100 text-orange-600' },
    { type: 'action', label: 'Action', icon: Zap, color: 'bg-blue-100 text-blue-600' },
    { type: 'connector', label: 'Send Email', icon: Mail, color: 'bg-green-100 text-green-600' },
    { type: 'mcp', label: 'CRM Action', icon: Database, color: 'bg-purple-100 text-purple-600' },
    { type: 'ai_prompt', label: 'AI Prompt', icon: MessageSquare, color: 'bg-pink-100 text-pink-600' },
    { type: 'condition', label: 'Condition', icon: GitBranch, color: 'bg-yellow-100 text-yellow-600' },
    { type: 'end', label: 'End', icon: CheckCircle, color: 'bg-gray-100 text-gray-600' },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Add Nodes</h3>
      <div className="space-y-2">
        {nodeTypes.map((node) => {
          const Icon = node.icon;
          return (
            <button
              key={node.type}
              onClick={() => onAddNode(node.type)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all ${node.color}`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{node.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 p-3 bg-slate-50 rounded-lg">
        <p className="text-xs text-slate-600">
          Drag and connect nodes to build your automation flow.
        </p>
      </div>
    </div>
  );
};

export default NodePalette;