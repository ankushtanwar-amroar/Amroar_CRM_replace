import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Sparkles, Wand2, Lightbulb, RefreshCw, ArrowRight
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL;

export default function AIWriteView({ onGenerate, relatedObject }) {
  const [purpose, setPurpose] = useState('');
  const [tone, setTone] = useState('professional');
  const [cta, setCta] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleGenerate = async () => {
    if (!purpose) {
      toast.error('Please describe the purpose of the email');
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API}/api/email-templates/ai/generate`,
        {
          purpose,
          tone,
          cta: cta || null,
          related_object: relatedObject,
          additional_context: additionalContext || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.error) {
        toast.error(res.data.error);
        return;
      }

      setPreview(res.data);
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate email');
    } finally {
      setGenerating(false);
    }
  };

  const handleUseEmail = () => {
    if (preview) {
      onGenerate(preview);
    }
  };

  const templates = [
    { name: 'Introduction', purpose: 'Introduce myself and my company to a new lead' },
    { name: 'Follow-up', purpose: 'Follow up on a previous conversation or meeting' },
    { name: 'Meeting Request', purpose: 'Request a meeting to discuss potential partnership' },
    { name: 'Product Demo', purpose: 'Invite to a product demonstration' },
    { name: 'Thank You', purpose: 'Thank the recipient for their time or business' },
    { name: 'Check-in', purpose: 'Check in with a prospect who went silent' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="h-5 w-5 mr-2 text-indigo-600" />
                AI Email Writer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Purpose *</Label>
                <Textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Describe what you want to achieve with this email...\n\nExample: Introduce my company's CRM solution to a new lead and schedule a demo call"
                  rows={4}
                />
              </div>

              <div>
                <Label>Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Call to Action (optional)</Label>
                <Input
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="e.g., Schedule a call, Reply to this email"
                />
              </div>

              <div>
                <Label>Additional Context (optional)</Label>
                <Textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any additional details or requirements..."
                  rows={2}
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !purpose}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Email
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center">
                <Lightbulb className="h-4 w-4 mr-2 text-amber-500" />
                Quick Start Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <Button
                    key={t.name}
                    variant="outline"
                    size="sm"
                    className="justify-start h-auto py-2 px-3"
                    onClick={() => setPurpose(t.purpose)}
                  >
                    <span className="text-xs">{t.name}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {preview ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-slate-500">Subject</Label>
                    <p className="font-medium text-slate-900">{preview.subject}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Body</Label>
                    <div
                      className="prose prose-sm max-w-none mt-2 p-4 bg-white border rounded-lg"
                      dangerouslySetInnerHTML={{ __html: preview.body }}
                    />
                  </div>
                  <div className="flex space-x-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleGenerate}
                      disabled={generating}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate
                    </Button>
                    <Button
                      onClick={handleUseEmail}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Use This Email
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Sparkles className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-sm">Describe your email purpose and click Generate</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
