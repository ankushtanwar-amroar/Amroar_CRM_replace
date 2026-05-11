import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  X,
  Printer,
  Loader2,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { docflowService } from "../services/docflowService";
import { renderContent } from "../utils/contentVariables";

const STORAGE_PREFIX = "docflow.consent.v1";

export const hasAcceptedConsent = (sessionKey) => {
  if (!sessionKey) return false;
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}.${sessionKey}`) === "1";
  } catch {
    return false;
  }
};

export const setAcceptedConsent = (sessionKey) => {
  if (!sessionKey) return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}.${sessionKey}`, "1");
  } catch {}
};

// Phase 81.80 — Hardcoded fallbacks. Used only if the public content config
// endpoint fails (network down, etc.) so the consent UI never blanks out.
const FALLBACK_DISCLOSURE_SECTIONS = [
  {
    title: "ELECTRONIC RECORD AND SIGNATURE DISCLOSURE",
    content: "Please confirm your agreement by selecting the check-box next to ‘I agree to use electronic records and signatures’ before clicking ‘CONTINUE’."
  },
];

const FALLBACK_REVIEW = {
  title: "Review and Continue",
  subtitle: "Electronic Record & Signature Consent",
  body_html: "<p>Please review and agree to the use of electronic records and signatures, then click <strong>\"Continue\"</strong>.</p>",
  footer_html: "",
  disclosure_link_text: "Please read the Electronic Record and Signature Disclosure",
  checkbox_text: "I agree to use electronic records and signatures.",
  error_text: "Please agree to use electronic records and signatures.",
  continue_label: "Continue",
};

const FALLBACK_DISCLOSURE = {
  title: "Agreement to do business",
  subtitle: "Electronic Record & Signature Consent",
  sections: FALLBACK_DISCLOSURE_SECTIONS,
  footer: "",
};

const ConsentScreen = ({ open, sessionKey, onContinue, packageId, documentId, token, recipientName, recipientEmail, documentName, companyName, submitting = false }) => {
  const [agreed, setAgreed] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [showError, setShowError] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [fetching, setFetching] = useState(true);
  const checkboxRef = useRef(null);

  // Phase 81.80 — Dynamic content. Fetch tenant-specific overrides; fall back
  // to defaults if anything goes wrong (network down etc.).
  const [reviewContent, setReviewContent] = useState(FALLBACK_REVIEW);
  const [disclosureContent, setDisclosureContent] = useState(FALLBACK_DISCLOSURE);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ctx = {
      user_name: recipientName,
      email: recipientEmail,
      document_name: documentName,
      company_name: companyName,
    };
    (async () => {
      setFetching(true);
      try {
        const data = await docflowService.getPublicContentConfig({ token, packageId, documentId });
        if (cancelled) return;
        const rc = data?.sections?.review_continue?.content || FALLBACK_REVIEW;
        const cd = data?.sections?.consent_disclosure?.content || FALLBACK_DISCLOSURE;
        setReviewContent(renderContent(rc, ctx));
        setDisclosureContent(renderContent(cd, ctx));
      } catch {
        // Stick with fallbacks.
        setReviewContent(renderContent(FALLBACK_REVIEW, ctx));
        setDisclosureContent(renderContent(FALLBACK_DISCLOSURE, ctx));
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, packageId, documentId, token, recipientName, recipientEmail, documentName, companyName]);

  useEffect(() => {
    if (!open) {
      setAgreed(false);
      setShowError(false);
    }
  }, [open]);

  useEffect(() => {
    if (agreed) setShowError(false);
  }, [agreed]);

  if (!open) return null;

  const handleContinue = () => {
    if (!agreed) {
      setShowError(true);
      checkboxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (continuing || submitting) return;
    setContinuing(true);
    setAcceptedConsent(sessionKey);
    onContinue?.();
  };

  const handlePrint = () => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    
    let sectionsHtml = (disclosureContent.sections || []).map(s => `
      <section style="margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #1a1a1a; margin-bottom: 10px; font-family: sans-serif;">${s.title}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #333; font-family: sans-serif; margin: 0;">${s.content}</p>
      </section>
    `).join("");

    doc.write(`
      <html>
        <head>
          <title>Electronic Record and Signature Disclosure</title>
        </head>
        <body style="padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1 style="font-size: 24px; text-align: center; margin-bottom: 40px; font-family: sans-serif; border-bottom: 2px solid #eee; padding-bottom: 20px;">
            Electronic Record and Signature Disclosure
          </h1>
          ${sectionsHtml}
          <div style="margin-top: 50px; border-top: 1px solid #eee; pt: 20px; font-size: 12px; color: #666; text-align: center; font-family: sans-serif;">
            © ${new Date().getFullYear()} BatonCare. All rights reserved.
          </div>
        </body>
      </html>
    `);
    doc.close();

    // Wait for content to load
    iframe.contentWindow.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };
    
    // Fallback if onload doesn't trigger
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 500);
      }
    }, 1000);
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Electronic Record and Signature Disclosure", pageWidth / 2, 20, { align: "center" });
    
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, 25, pageWidth - margin, 25);
    
    let y = 35;
    
    (disclosureContent.sections || []).forEach((section, index) => {
      // Check for page overflow
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const titleLines = doc.splitTextToSize(section.title.toUpperCase(), contentWidth);
      doc.text(titleLines, margin, y);
      y += (titleLines.length * 6) + 2;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const contentLines = doc.splitTextToSize(section.content, contentWidth);
      
      // Check if content fits, if not, handles page breaks line by line
      contentLines.forEach(line => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin, y);
        y += 5;
      });
      
      y += 10; // Space between sections
    });
    
    doc.save("Electronic_Record_and_Signature_Disclosure.pdf");
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto min-h-[50vh] max-h-[95vh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="border-b border-gray-200 px-5 sm:px-8 py-5 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#2f2350]">
              {showDisclosure ? disclosureContent.title : reviewContent.title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {showDisclosure ? disclosureContent.subtitle : reviewContent.subtitle}
            </p>
          </div>

          <button
            onClick={() => setShowDisclosure(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-8 py-6 flex-1 overflow-y-auto text-[#34284f] scroll-smooth">
          {fetching ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 py-20">
              <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
              <p className="text-gray-500 font-medium animate-pulse">Loading content...</p>
            </div>
          ) : !showDisclosure ? (
            <div className="space-y-6 text-sm sm:text-base leading-8">
              <div
                className="prose prose-sm sm:prose max-w-none [&_p]:my-3 [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: reviewContent.body_html || "" }}
              />

              <div
                className="border-t pt-5 text-sm text-gray-600 leading-7 prose prose-sm max-w-none [&_p]:my-2"
                dangerouslySetInnerHTML={{ __html: reviewContent.footer_html || "" }}
              />

              <button
                onClick={() => setShowDisclosure(true)}
                className="underline font-medium text-[#2f2350] hover:text-indigo-700 text-left"
              >
                {reviewContent.disclosure_link_text}
              </button>

              <div ref={checkboxRef} className="space-y-2">
                <label
                  className={`flex gap-3 items-start border rounded-xl p-4 cursor-pointer transition-all ${
                    showError
                      ? "border-red-300 bg-red-50 ring-2 ring-red-100"
                      : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 h-5 w-5 accent-[#8bc53f] cursor-pointer"
                  />
                  <span className="text-sm sm:text-base leading-relaxed">
                    {reviewContent.checkbox_text}
                    <span className="text-red-500 ml-1">*</span>
                  </span>
                </label>

                {showError && (
                  <p className="text-red-600 text-sm font-medium animate-in fade-in slide-in-from-top-1 px-1">
                    {reviewContent.error_text}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-7 text-sm sm:text-base leading-8">
              {(disclosureContent.sections || []).map((section, idx) => (
                <section key={idx}>
                  <h3 className="font-bold text-lg mb-2">{section.title}</h3>
                  <p className="whitespace-pre-wrap">{section.content}</p>
                </section>
              ))}
              {disclosureContent.footer && (
                <p className="text-xs text-gray-500 mt-6 pt-3 border-t border-gray-100">
                  {disclosureContent.footer}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 sm:px-8 py-5 bg-gray-50 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full sm:w-48 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {showDisclosure && (
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handlePrint}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 transition-all"
                >
                  <Printer size={16} />
                  Print
                </button>

                <button 
                  onClick={handleDownload}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            )}
  
            <button
              onClick={handleContinue}
              disabled={fetching || submitting || continuing}
              className={`w-full sm:w-auto px-8 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm ${
                !fetching && !submitting && !continuing
                  ? "bg-[#8bc53f] text-white hover:bg-[#7ab236] active:scale-[0.98]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {(submitting || continuing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight size={16} />}
              {(submitting || continuing) ? "Processing..." : (reviewContent.continue_label || "Continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentScreen;