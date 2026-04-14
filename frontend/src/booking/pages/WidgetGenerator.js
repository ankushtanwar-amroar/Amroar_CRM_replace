import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import BookingLayout from '../components/BookingLayout';

const WidgetGenerator = () => {
  const [copied, setCopied] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [theme, setTheme] = useState('light');

  // Get tenant ID from auth
  React.useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.tenant_id) {
      setTenantId(user.tenant_id);
    }
  }, []);

  const generateCode = () => {
    return `<!-- Booking Widget Integration -->
<div id="booking-widget"></div>

<script>
  (function() {
    const script = document.createElement('script');
    script.src = '${window.location.origin}/booking-widget.js';
    script.onload = function() {
      if (window.BookingWidget) {
        const widget = new window.BookingWidget({
          tenantId: '${tenantId}',
          containerId: 'booking-widget',
          theme: '${theme}'
        });
        widget.mount();
      }
    };
    document.head.appendChild(script);
  })();
</script>`;
  };

  const generateIframeCode = () => {
    return `<iframe 
  src="${window.location.origin}/booking/${tenantId}" 
  width="100%" 
  height="800" 
  frameborder="0"
  style="border: none; border-radius: 8px;"
></iframe>`;
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BookingLayout>
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Booking Widget Generator</h1>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tenant ID
              </label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                readOnly
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Theme
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Embedded Script</h2>
            <button
              onClick={() => handleCopy(generateCode())}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Copy and paste this code into your website where you want the booking widget to appear:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
            <code>{generateCode()}</code>
          </pre>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">iFrame Embed</h2>
            <button
              onClick={() => handleCopy(generateIframeCode())}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Alternatively, use this iframe code for a simpler integration:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
            <code>{generateIframeCode()}</code>
          </pre>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Public Booking URL</h3>
          <p className="text-blue-800 mb-3">
            You can also share this direct link with your customers:
          </p>
          <div className="bg-white p-3 rounded border border-blue-300 font-mono text-sm break-all">
            {window.location.origin}/booking/{tenantId}
          </div>
        </div>
        </div>
      </div>
    </BookingLayout>
  );
};

export default WidgetGenerator;
