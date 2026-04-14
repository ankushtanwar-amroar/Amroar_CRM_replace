import React, { useState } from 'react';
import { Monitor, Smartphone, FileText, AlertTriangle, Info } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

export default function InboxView({ subject, htmlContent, plainTextContent, spamHints = [] }) {
  const [viewMode, setViewMode] = useState('desktop');

  // Generate plain text if not provided
  const generatedPlainText = plainTextContent || htmlToPlainText(htmlContent);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* View Mode Tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex space-x-2">
            <Button
              variant={viewMode === 'desktop' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('desktop')}
            >
              <Monitor className="h-4 w-4 mr-2" />
              Desktop
            </Button>
            <Button
              variant={viewMode === 'mobile' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('mobile')}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile
            </Button>
            <Button
              variant={viewMode === 'plaintext' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('plaintext')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Plain Text
            </Button>
          </div>

          {spamHints.length > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {spamHints.length} deliverability hint{spamHints.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="flex gap-6">
          {/* Email Preview */}
          <div className="flex-1">
            <Card className="overflow-hidden">
              {/* Email Client Header */}
              <div className="bg-slate-100 border-b px-4 py-3">
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-2">
                  <span>From:</span>
                  <span className="text-slate-700">Sales Team &lt;sales@company.com&gt;</span>
                </div>
                <div className="flex items-center space-x-2 text-slate-500 text-xs mb-2">
                  <span>To:</span>
                  <span className="text-slate-700">{'{{FirstName}} {{LastName}}'} &lt;{'{{Email}}'}&gt;</span>
                </div>
                <div className="font-semibold text-slate-900">{subject || '(No subject)'}</div>
              </div>

              {/* Email Body */}
              <CardContent
                className={`p-0 bg-white ${viewMode === 'mobile' ? 'max-w-[375px] mx-auto' : ''}`}
              >
                {viewMode === 'plaintext' ? (
                  <pre className="p-6 whitespace-pre-wrap font-mono text-sm text-slate-700">
                    {generatedPlainText || '(No content)'}
                  </pre>
                ) : (
                  <div
                    className={`p-6 prose prose-sm max-w-none ${viewMode === 'mobile' ? 'text-sm' : ''}`}
                    dangerouslySetInnerHTML={{ __html: htmlContent || '<p class="text-slate-400">(No content)</p>' }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Spam Hints Sidebar */}
          {spamHints.length > 0 && (
            <div className="w-72">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                    Deliverability Hints
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {spamHints.map((hint, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg text-sm ${
                        hint.type === 'warning'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      <div className="flex items-start">
                        {hint.type === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Info className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{hint.message}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to convert HTML to plain text
function htmlToPlainText(html) {
  if (!html) return '';

  let text = html;
  
  // Remove style and script tags
  text = text.replace(/<style[^>]*>.*?<\/style>/gis, '');
  text = text.replace(/<script[^>]*>.*?<\/script>/gis, '');
  
  // Replace common HTML elements
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  
  // Extract href from links
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  text = textarea.value;
  
  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}
