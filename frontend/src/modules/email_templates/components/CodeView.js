import React, { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Code, Wand2, Copy, Download, Upload, Check
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

export default function CodeView({ htmlContent, onChange, onMakeEditable }) {
  const [localHtml, setLocalHtml] = useState(htmlContent);
  const fileInputRef = useRef(null);

  const handleApply = () => {
    onChange(localHtml);
    toast.success('HTML applied');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localHtml);
      toast.success('HTML copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([localHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email-template.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setLocalHtml(content);
        onChange(content);
        toast.success('HTML file loaded');
      }
    };
    reader.readAsText(file);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLocalHtml(text);
      toast.success('HTML pasted from clipboard');
    } catch (error) {
      toast.error('Failed to paste. Please use Ctrl+V');
    }
  };

  React.useEffect(() => {
    setLocalHtml(htmlContent);
  }, [htmlContent]);

  return (
    <div className="h-full flex">
      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">HTML Source</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex-1 p-4 bg-slate-900">
          <Textarea
            value={localHtml}
            onChange={(e) => setLocalHtml(e.target.value)}
            onBlur={handleApply}
            placeholder="Paste your HTML here..."
            className="w-full h-full min-h-[500px] font-mono text-sm bg-slate-800 text-green-400 border-slate-700 resize-none"
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-white border-l p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center">
              <Wand2 className="h-4 w-4 mr-2 text-indigo-600" />
              Convert HTML
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Paste your existing HTML email and convert it to editable blocks.
            </p>
            <Button
              onClick={onMakeEditable}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={!localHtml.trim()}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Make this editable
            </Button>
            <p className="text-xs text-slate-500">
              This will convert your HTML into draggable blocks you can edit visually.
              Complex sections will be preserved as custom HTML blocks.
            </p>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none p-4 bg-white border rounded max-h-64 overflow-auto"
              dangerouslySetInnerHTML={{ __html: localHtml }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
