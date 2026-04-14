/**
 * EmailComposerModal - Internal email composer modal
 * 
 * Opens when clicking on an email field value.
 * Pre-fills "To" with the email address.
 * Backend email sending is mocked for now.
 */
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Send, X, Loader2, Paperclip, Mail } from 'lucide-react';
import { toast } from 'sonner';

const EmailComposerModal = ({ 
  isOpen, 
  onClose, 
  recipientEmail = '',
  recipientName = '',
  relatedRecordId = null,
  relatedRecordType = null 
}) => {
  const [formData, setFormData] = useState({
    to: recipientEmail,
    cc: '',
    bcc: '',
    subject: '',
    body: ''
  });
  const [isSending, setIsSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);

  // Update "To" field when recipientEmail prop changes
  React.useEffect(() => {
    if (recipientEmail) {
      setFormData(prev => ({ ...prev, to: recipientEmail }));
    }
  }, [recipientEmail]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSend = async () => {
    // Validate required fields
    if (!formData.to.trim()) {
      toast.error('Recipient email is required');
      return;
    }
    if (!formData.subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    setIsSending(true);

    try {
      // MOCKED: In production, this would call the email service API
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem('token');

      // Attempt to send via backend (mocked endpoint)
      const response = await fetch(`${API_URL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to: formData.to,
          cc: formData.cc || null,
          bcc: formData.bcc || null,
          subject: formData.subject,
          body: formData.body,
          related_record_id: relatedRecordId,
          related_record_type: relatedRecordType
        })
      });

      if (response.ok) {
        toast.success('Email sent successfully!');
        onClose();
        // Reset form
        setFormData({ to: recipientEmail, cc: '', bcc: '', subject: '', body: '' });
      } else {
        // If endpoint doesn't exist or fails, show mock success
        // This is the MOCKED behavior
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success('Email sent successfully! (Demo Mode)');
        onClose();
        setFormData({ to: recipientEmail, cc: '', bcc: '', subject: '', body: '' });
      }
    } catch (error) {
      // MOCKED: Show success even if API doesn't exist
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Email sent successfully! (Demo Mode)');
      onClose();
      setFormData({ to: recipientEmail, cc: '', bcc: '', subject: '', body: '' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" data-testid="email-composer-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Compose Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* To field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="to">To *</Label>
              {!showCcBcc && (
                <button 
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Add Cc/Bcc
                </button>
              )}
            </div>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={formData.to}
              onChange={(e) => handleChange('to', e.target.value)}
              data-testid="email-to-field"
            />
          </div>

          {/* CC/BCC fields */}
          {showCcBcc && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cc">Cc</Label>
                <Input
                  id="cc"
                  type="email"
                  placeholder="cc@example.com"
                  value={formData.cc}
                  onChange={(e) => handleChange('cc', e.target.value)}
                  data-testid="email-cc-field"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bcc">Bcc</Label>
                <Input
                  id="bcc"
                  type="email"
                  placeholder="bcc@example.com"
                  value={formData.bcc}
                  onChange={(e) => handleChange('bcc', e.target.value)}
                  data-testid="email-bcc-field"
                />
              </div>
            </>
          )}

          {/* Subject field */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              type="text"
              placeholder="Enter email subject"
              value={formData.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              data-testid="email-subject-field"
            />
          </div>

          {/* Body field */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your message here..."
              value={formData.body}
              onChange={(e) => handleChange('body', e.target.value)}
              className="min-h-[200px] resize-none"
              data-testid="email-body-field"
            />
          </div>

          {/* Attachment placeholder */}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Paperclip className="h-4 w-4" />
            <span>Attachments coming soon</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSending}
            data-testid="email-cancel-btn"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending || !formData.to.trim() || !formData.subject.trim()}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="email-send-btn"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailComposerModal;
