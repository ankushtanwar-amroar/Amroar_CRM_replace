import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor, FileText, List, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ChooseScreenFlowMode = () => {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedObject, setSelectedObject] = useState('');
  const [showObjectSelection, setShowObjectSelection] = useState(false);
  
  // Dynamic objects from Object Manager API
  const [objects, setObjects] = useState([]);
  const [objectsLoading, setObjectsLoading] = useState(true);
  
  // Fetch objects from API on mount
  useEffect(() => {
    const fetchObjects = async () => {
      try {
        setObjectsLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_URL}/api/objects`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Transform API response to expected format
        const apiObjects = response.data?.objects || response.data || [];
        const formattedObjects = apiObjects.map(obj => ({
          name: obj.object_name || obj.api_name,
          label: obj.label || obj.object_label || obj.object_name
        }));
        
        // Sort alphabetically by label
        formattedObjects.sort((a, b) => a.label.localeCompare(b.label));
        
        setObjects(formattedObjects);
      } catch (err) {
        console.error('Error fetching objects:', err);
        // Fallback to minimal list if API fails
        setObjects([
          { name: 'lead', label: 'Lead' },
          { name: 'contact', label: 'Contact' },
          { name: 'account', label: 'Account' }
        ]);
      } finally {
        setObjectsLoading(false);
      }
    };
    
    fetchObjects();
  }, []);

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    
    // Basic mode doesn't need object selection
    if (mode === 'basic') {
      setShowObjectSelection(false);
    } else {
      // Record Page and List View modes require object selection
      setShowObjectSelection(true);
    }
  };

  const handleContinue = () => {
    if (selectedMode === 'basic') {
      // Navigate directly for basic mode (no object needed)
      navigate('/flows/new/edit', {
        state: {
          automationType: 'screen-flow',
          flowName: 'New Screen Flow',
          launchMode: 'basic'
        }
      });
    } else if (selectedObject) {
      // Navigate with object and launch mode
      navigate('/flows/new/edit', {
        state: {
          automationType: 'screen-flow',
          flowName: 'New Screen Flow',
          launchMode: selectedMode,
          object: selectedObject
        }
      });
    }
  };

  const canContinue = selectedMode === 'basic' || (selectedMode && selectedObject);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center">
          <button
            onClick={() => navigate('/flows/new')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">New Screen Flow</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Choose Screen Flow Launch Mode
          </h2>
          <p className="text-gray-600 text-lg">
            How will this Screen Flow be launched?
          </p>
        </div>

        {/* Launch Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Basic Mode */}
          <button
            onClick={() => handleModeSelect('basic')}
            className={`group bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-200 text-left ${
              selectedMode === 'basic' ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-4 transition-all ${
                selectedMode === 'basic' ? 'bg-blue-500' : 'bg-gray-100 group-hover:bg-blue-100'
              }`}>
                <Monitor className={`w-8 h-8 ${selectedMode === 'basic' ? 'text-white' : 'text-gray-600 group-hover:text-blue-600'}`} />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${selectedMode === 'basic' ? 'text-blue-600' : 'text-gray-900'}`}>
                Use Anywhere
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Basic (Use Anywhere)
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Place on any app layout or page region. No object required. No system context variables.
              </p>
            </div>
            {selectedMode === 'basic' && (
              <div className="mt-4 text-center text-sm text-blue-600 font-medium">
                ✓ Selected
              </div>
            )}
          </button>

          {/* Record Page Mode */}
          <button
            onClick={() => handleModeSelect('record_detail')}
            className={`group bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-200 text-left ${
              selectedMode === 'record_detail' ? 'border-green-500 shadow-lg' : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-4 transition-all ${
                selectedMode === 'record_detail' ? 'bg-green-500' : 'bg-gray-100 group-hover:bg-green-100'
              }`}>
                <FileText className={`w-8 h-8 ${selectedMode === 'record_detail' ? 'text-white' : 'text-gray-600 group-hover:text-green-600'}`} />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${selectedMode === 'record_detail' ? 'text-green-600' : 'text-gray-900'}`}>
                Record Detail
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Record Detail (Single Record)
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Runs from record detail page. Requires object selection. System auto-creates recordId variable.
              </p>
            </div>
            {selectedMode === 'record_detail' && (
              <div className="mt-4 text-center text-sm text-green-600 font-medium">
                ✓ Selected
              </div>
            )}
          </button>

          {/* List View Mode */}
          <button
            onClick={() => handleModeSelect('list_view')}
            className={`group bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-200 text-left ${
              selectedMode === 'list_view' ? 'border-purple-500 shadow-lg' : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-4 transition-all ${
                selectedMode === 'list_view' ? 'bg-purple-500' : 'bg-gray-100 group-hover:bg-purple-100'
              }`}>
                <List className={`w-8 h-8 ${selectedMode === 'list_view' ? 'text-white' : 'text-gray-600 group-hover:text-purple-600'}`} />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${selectedMode === 'list_view' ? 'text-purple-600' : 'text-gray-900'}`}>
                List View
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                List View (Multiple Records)
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                User selects records in list view. Requires object selection. System creates recordIds collection.
              </p>
            </div>
            {selectedMode === 'list_view' && (
              <div className="mt-4 text-center text-sm text-purple-600 font-medium">
                ✓ Selected
              </div>
            )}
          </button>
        </div>

        {/* Object Selection (shows for Record Page and List View modes) */}
        {showObjectSelection && selectedMode && (
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Object</h3>
            <p className="text-sm text-gray-600 mb-4">
              {selectedMode === 'record_detail' 
                ? 'Choose the object this flow will run on. The recordId will be automatically provided.'
                : 'Choose the object for list view selection. Selected record IDs will be automatically provided.'}
            </p>
            
            {objectsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Loading objects from Object Manager...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                {objects.map((obj) => (
                  <button
                    key={obj.name}
                    onClick={() => setSelectedObject(obj.name)}
                    className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedObject === obj.name
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
            )}
            
            {!objectsLoading && objects.length === 0 && (
              <p className="text-center text-gray-500 py-4">No objects available. Please create objects in the Schema Builder first.</p>
            )}
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className={`px-8 py-3 rounded-lg font-medium transition-all ${
              canContinue
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Continue to Flow Builder
          </button>
        </div>

        {/* Help Text */}
        {!canContinue && selectedMode && (
          <div className="mt-4 text-center text-sm text-gray-500">
            {selectedMode !== 'basic' && !selectedObject && 'Please select an object to continue'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChooseScreenFlowMode;
