import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  X,
  Printer,
} from "lucide-react";
import { jsPDF } from "jspdf";

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

const DISCLOSURE_SECTIONS = [
  {
    title: "ELECTRONIC RECORD AND SIGNATURE DISCLOSURE",
    content: "From time to time, BatonCare (we, us or Company) may be required by law to provide to you certain written notices or disclosures. Described below are the terms and conditions for providing to you such notices and disclosures electronically through the DocuSign system. Please read the information below carefully and thoroughly, and if you can access this information electronically to your satisfaction and agree to this Electronic Record and Signature Disclosure (ERSD), please confirm your agreement by selecting the check-box next to ‘I agree to use electronic records and signatures’ before clicking ‘CONTINUE’ within the DocuSign system."
  },
  {
    title: "Getting Paper Copies",
    content: "At any time, you may request from us a paper copy of any record provided or made available electronically to you by us. You will have the ability to download and print documents we send to you through the DocuSign system during and immediately after the signing session and, if you elect to create a DocuSign account, you may access the documents for a limited period of time (usually 30 days) after such documents are first sent to you. After such time, if you wish for us to send you paper copies of any such documents from our office to you, you will be charged a $0.00 per-page fee. You may request delivery of such paper copies from us by following the procedure described below."
  },
  {
    title: "Withdrawing Your Consent",
    content: "If you decide to receive notices and disclosures from us electronically, you may at any time change your mind and tell us that thereafter you want to receive required notices and disclosures only in paper format. How you must inform us of your decision to receive future notices and disclosure in paper format and withdraw your consent to receive notices and disclosures electronically is described below."
  },
  {
    title: "Consequences of Changing Your Mind",
    content: "If you elect to receive required notices and disclosures only in paper format, it will slow the speed at which we can complete certain steps in transactions with you and delivering services to you because we will need first to send the required notices or disclosures to you in paper format, and then wait until we receive back from you your acknowledgment of your receipt of such paper notices or disclosures. Further, you will no longer be able to use the DocuSign system to receive required notices and consents electronically from us or to sign electronically documents from us."
  },
  {
    title: "All notices and disclosures will be sent to you electronically",
    content: "Unless you tell us otherwise in accordance with the procedures described herein, we will provide electronically to you through the DocuSign system all required notices, disclosures, authorizations, acknowledgements, and other documents that are required to be provided or made available to you during the course of our relationship with you. To reduce the chance of you inadvertently not receiving any notice or disclosure, we prefer to provide all of the required notices and disclosures to you by the same method and to the same address that you have given us. Thus, you can receive all the disclosures and notices electronically or in paper format through the paper mail delivery system. If you do not agree with this process, please let us know as described below. Please also see the paragraph immediately above that describes the consequences of your electing not to receive delivery of the notices and disclosures electronically from us."
  },
  {
    title: "How to Contact BatonCare",
    content: "You may contact us to let us know of your changes as to how we may contact you electronically, to request paper copies of certain information from us, and to withdraw your prior consent to receive notices and disclosures electronically as follows: To contact us by email send messages to: support@batoncare.com"
  },
  {
    title: "To advise BatonCare of your new email address",
    content: "To let us know of a change in your email address where we should send notices and disclosures electronically to you, you must send an email message to us at support@batoncare.com and in the body of such request you must state: your previous email address, your new email address. We do not require any other information from you to change your email address. If you created a DocuSign account, you may update it with your new email address through your account preferences."
  },
  {
    title: "To request paper copies from BatonCare",
    content: "To request delivery from us of paper copies of the notices and disclosures previously provided by us to you electronically, you must send us an email to support@batoncare.com and in the body of such request you must state your email address, full name, mailing address, and telephone number. We will bill you for any fees at that time, if any."
  },
  {
    title: "To withdraw your consent with BatonCare",
    content: "To inform us that you no longer wish to receive future notices and disclosures in electronic format you may: decline to sign a document from within your signing session, and on the subsequent page, select the check-box indicating you wish to withdraw your consent, or you may; send us an email to support@batoncare.com and in the body of such request you must state your email, full name, mailing address, and telephone number. We do not need any other information from you to withdraw consent. The consequences of your withdrawing consent for online documents will be that transactions may take a longer time to process."
  },
  {
    title: "Required hardware and software",
    content: "The minimum system requirements for using the DocuSign system may change over time. The current system requirements are found here: https://support.docusign.com/guides/signer-guide-signing-system-requirements."
  },
  {
    title: "Acknowledging your access and consent to receive and sign documents electronically",
    content: "To confirm to us that you can access this information electronically, which will be similar to other electronic notices and disclosures that we will provide to you, please confirm that you have read this ERSD, and (i) that you are able to print on paper or electronically save this ERSD for your future reference and access; or (ii) that you are able to email this ERSD to an email address where you will be able to print on paper or save it for your future reference and access. Further, if you consent to receiving notices and disclosures exclusively in electronic format as described herein, then select the check-box next to ‘I agree to use electronic records and signatures’ before clicking ‘CONTINUE’ within the DocuSign system. By selecting the check-box next to ‘I agree to use electronic records and signatures’, you confirm that: You can access and read this Electronic Record and Signature Disclosure. You can print on paper this Electronic Record and Signature Disclosure, or save or send this Electronic Record and Disclosure to a location where you can print it, for future reference and access. Until or unless you notify BatonCare as described above, you consent to receive exclusively through electronic means all notices, disclosures, authorizations, acknowledgements, and other documents that are required to be provided or made available to you by BatonCare during the course of your relationship with BatonCare."
  }
];

const ConsentScreen = ({ open, sessionKey, onContinue }) => {
  const [agreed, setAgreed] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [showError, setShowError] = useState(false);
  const checkboxRef = useRef(null);

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
    setAcceptedConsent(sessionKey);
    onContinue?.();
  };

  const handlePrint = () => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    
    let sectionsHtml = DISCLOSURE_SECTIONS.map(s => `
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
    
    DISCLOSURE_SECTIONS.forEach((section, index) => {
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
    <div className="fixed inset-0 z-[9999] bg-[#201046]/95 flex items-center justify-center p-2 sm:p-6 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto min-h-[50vh] max-h-[95vh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="border-b border-gray-200 px-5 sm:px-8 py-5 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#2f2350]">
              {showDisclosure
                ? "Agreement to do business "
                : "Review and Continue"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Electronic Record & Signature Consent
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
          {!showDisclosure ? (
            <div className="space-y-6 text-sm sm:text-base leading-8">
              <p>Dear BatonCare Member,</p>
              <p>
                Thank you for choosing BatonCare, where your health is our
                priority.
              </p>
              <p>
                Please review and agree to the use of electronic records and
                signatures, then click <strong>"Continue"</strong> to begin the
                process of reviewing and signing your documents.
              </p>
              <p>
                Signing will not be complete until you have reviewed the
                agreement and confirmed your signature by clicking{" "}
                <strong>"Finish"</strong>.
              </p>
              <p>
                Once completed, you will receive instructions to create a
                username and password to access the BatonCare portal and manage
                your healthcare needs.
              </p>
              <p>
                Should you have any questions or require assistance, please do
                not hesitate to contact us at{" "}
                <strong>support@batoncare.com</strong> or{" "}
                <strong>(561) 303-0007</strong>.
              </p>
              <p>
                Thank you,
                <br />
                <strong>The BatonCare Team</strong>
              </p>

              <div className="border-t pt-5 text-sm text-gray-600 leading-7">
                <p>
                  You are receiving this email because you opted in via our
                  website or prior communications. To unsubscribe, email
                  "Unsubscribe" to support@batoncare.com.
                </p>
                <p>
                  This email and any attachments may contain confidential or
                  legally protected information intended solely for the use of
                  the individual or entity to whom it is addressed. If you are
                  not the intended recipient, please notify the sender
                  immediately and delete this message. Any unauthorized review,
                  use, disclosure, or distribution is prohibited.
                </p>
                <p>
                  © 2026 BatonCare | 980 North Federal Highway, Suite 110 #1068,
                  Boca Raton, FL 33432 | support@batoncare.com
                </p>
              </div>

              <button
                onClick={() => setShowDisclosure(true)}
                className="underline font-medium text-[#2f2350] hover:text-indigo-700 text-left"
              >
                Please read the Electronic Record and Signature Disclosure
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
                    I agree to use electronic records and signatures.
                    <span className="text-red-500 ml-1">*</span>
                  </span>
                </label>

                {showError && (
                  <p className="text-red-600 text-sm font-medium animate-in fade-in slide-in-from-top-1 px-1">
                    Please agree to use electronic records and signatures.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-7 text-sm sm:text-base leading-8">
              {DISCLOSURE_SECTIONS.map((section, idx) => (
                <section key={idx}>
                  <h3 className="font-bold text-lg mb-2">{section.title}</h3>
                  <p>{section.content}</p>
                </section>
              ))}
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
              className={`w-full sm:w-auto px-8 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm ${
                agreed
                  ? "bg-[#8bc53f] text-white hover:bg-[#7ab236] active:scale-[0.98]"
                  : "bg-[#8bc53f]/80 text-white hover:bg-[#8bc53f] active:scale-[0.98]"
              }`}
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentScreen;