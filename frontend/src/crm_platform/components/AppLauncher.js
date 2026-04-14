import React, { useState } from 'react';
import { Grid, List, Search, X } from 'lucide-react';

const AppLauncher = ({ apps, onSelectApp }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredApps = apps.filter(app =>
    app.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectApp = (app) => {
    onSelectApp(app);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-700 rounded transition-colors"
        title="App Launcher"
      >
        <Grid className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-0 left-0 w-96 h-full bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">App Launcher</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredApps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No apps found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {filteredApps.map(app => (
                    <button
                      key={app.id}
                      onClick={() => handleSelectApp(app)}
                      className="flex flex-col items-center p-4 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-3 group-hover:shadow-lg transition-shadow">
                        <List className="w-8 h-8 text-white" />
                      </div>
                      <span className="text-sm text-center font-semibold text-gray-900">{app.label_plural || app.label}</span>
                      <span className="text-xs text-gray-500 mt-1">{app.api_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default AppLauncher;
