import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles, Upload, FileText, Edit, CheckCircle, Link2, Webhook, Clock, ShieldCheck, Loader2, AlertCircle, Bot, Mic, MicOff, Square, ChevronDown, GitBranch, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { docflowService } from '../services/docflowService';
import MultiPageVisualBuilder from '../components/MultiPageVisualBuilder';
import ConnectionTab from '../components/ConnectionTab';
import IntegrationTab from '../components/IntegrationTab';
import ValidationPanel from '../components/ValidationPanel';
import TemplateLogsTab from '../components/TemplateLogsTab';
import RecipientsRoutingTab from '../components/RecipientsRoutingTab';
import ClueBotPanel from '../components/ClueBotPanel';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TemplateEditor = () => {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const isEditMode = !!templateId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [mode, setMode] = useState('upload');
  const [templateData, setTemplateData] = useState({
    name: '',
    description: '',
    template_type: 'custom',
    source: 'manual',
    html_content: '',
    ai_prompt: '',
    file_url: '',
    crm_connection: {},
    webhook_config: {},
    ai_connection: '',
    routing_mode: 'sequential',
    recipients: []
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [mergeFields, setMergeFields] = useState([]);
  const [activeTab, setActiveTab] = useState('details');
  const [validationResult, setValidationResult] = useState(null);
  const [isValidated, setIsValidated] = useState(false);
  // Non-zero value triggers ValidationPanel auto-run; zero = opened manually.
  const [autoRunValidationToken, setAutoRunValidationToken] = useState(0);
  const [uploadedPdfFile, setUploadedPdfFile] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [fieldPlacements, setFieldPlacements] = useState([]);
  const [crmObjects, setCrmObjects] = useState([]);
  const [crmFields, setCrmFields] = useState([]);
  const [cluebotOpen, setCluebotOpen] = useState(false);
  const [cluebotEnabled, setCluebotEnabled] = useState(null); // null = loading
  const [industry, setIndustry] = useState('IT Services');
  const [selectedDocType, setSelectedDocType] = useState(null);

  // Version control state
  const [versionHistory, setVersionHistory] = useState([]);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = React.useRef(null);
  const lastProcessedIndexRef = React.useRef(0);
  const baseTextRef = React.useRef('');

  // Initialize Web Speech API (uses Google servers in Chrome)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let newFinal = '';
        let currentInterim = '';

        for (let i = lastProcessedIndexRef.current; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            newFinal += event.results[i][0].transcript + ' ';
            lastProcessedIndexRef.current = i + 1;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        // Append only NEW final text to the base
        if (newFinal) {
          baseTextRef.current = (baseTextRef.current + ' ' + newFinal).trim();
          setAiPrompt(baseTextRef.current);
        } else if (currentInterim) {
          // Show interim as a live preview (not committed yet)
          setAiPrompt(baseTextRef.current + (baseTextRef.current ? ' ' : '') + currentInterim);
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== 'aborted') {
          toast.error(
            event.error === 'not-allowed' ? 'Microphone access denied'
            : event.error === 'no-speech' ? 'No speech detected — try again'
            : `Voice error: ${event.error}`
          );
        }
        setIsRecording(false);
      };

      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        // Reset tracking state for new session
        lastProcessedIndexRef.current = 0;
        baseTextRef.current = aiPrompt || '';
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        toast.error('Microphone unavailable');
      }
    }
  };
  const [basePrompt, setBasePrompt] = useState('');

  // Fetch CluBot policy status
  useEffect(() => {
    let cancelled = false;
    docflowService.cluebotPolicyStatus()
      .then(data => { if (!cancelled) setCluebotEnabled(data?.enabled ?? false); })
      .catch(() => { if (!cancelled) setCluebotEnabled(false); });
    return () => { cancelled = true; };
  }, []);
  const [contentBlocks, setContentBlocks] = useState([]);
  const [selectedText, setSelectedText] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [highlightBlockId, setHighlightBlockId] = useState(null);

  const INDUSTRY_MAP = {
    'IT Services': [
      { label: 'NDA', prompt: 'Create a Mutual Non-Disclosure Agreement for the IT services industry. Include: parties, purpose, confidential info definition, exclusions, obligations, permitted use, data protection, law-required disclosure, return/destruction, no IP transfer, no obligation to proceed, term, remedies, governing law, signature block.' },
      { label: 'Master Service Agreement', prompt: 'Create a Master Services Agreement for an IT services company (consulting, development, support). Include: scope framework, SOW mechanism, roles, fees/payment, change requests, client dependencies, confidentiality, IP ownership/licensing, data security, warranties, liability, indemnity, termination, dispute resolution.' },
      { label: 'Statement of Work', prompt: 'Create a Statement of Work for an IT services engagement. Include: project title/objective, scope, deliverables, assumptions, exclusions, milestones/timeline, client responsibilities, acceptance criteria, fees/billing, change control, risks, termination conditions.' },
      { label: 'SaaS Agreement', prompt: 'Create a SaaS Agreement for a B2B software platform. Include: subscription scope, access rights, license limits, availability/SLA, support, data ownership, customer responsibilities, acceptable use, confidentiality, security, fees/renewal, liability, termination.' },
      { label: 'DPA', prompt: 'Create a Data Processing Agreement for an IT/SaaS provider. Include: controller/processor relationship, processing nature/purpose, data categories, subject categories, instructions, personnel confidentiality, security measures, subprocessors, breach notification, audit cooperation, data return/deletion.' },
      { label: 'Support Agreement', prompt: 'Create a Support and Maintenance Agreement for IT services. Include: services covered, support hours, severity levels, response/resolution targets, maintenance windows, client cooperation, fees, access requirements, confidentiality, liability, renewal/termination.' },
      { label: 'Vendor Agreement', prompt: 'Create a Vendor Agreement for purchasing IT goods/services. Include: products/services, performance expectations, pricing/payment, confidentiality, compliance, warranties, liability, termination, dispute resolution.' },
      { label: 'Contractor Agreement', prompt: 'Create an Independent Contractor Agreement for IT services. Include: role/services, compensation, confidentiality, IP ownership, term/termination, compliance expectations, return of property, dispute language.' }
    ],
    'Healthcare': [
      { label: 'BAA', prompt: 'Create a Business Associate Agreement for a healthcare service provider. Include: HIPAA compliance context, permitted/required uses, safeguards, reporting breaches, subcontractor obligations, access/amendment assistance, return/destruction of PHI, term/termination, governing law.' },
      { label: 'Patient Consent', prompt: 'Create a healthcare patient consent form. Include: patient/provider details, purpose, description of consent, risks/limitations, privacy statement, voluntary acknowledgment, right to withdraw, signature/date, witness section.' },
      { label: 'Medical Services Agreement', prompt: 'Create a Medical Services Agreement for healthcare organizations. Include: scope, service standards, personnel expectations, compliance/licensing, patient confidentiality, record handling, fees/payment, audit obligations, indemnity, insurance, termination.' },
      { label: 'Records Release', prompt: 'Create a patient authorization for release of medical records. Include: patient ID, recipient, records to be released, purpose, delivery method, expiration, revocation rights, re-disclosure risk notice, signature/date.' },
      { label: 'Telehealth Consent', prompt: 'Create a telehealth consent form. Include: virtual consultations explanation, technology limitations, privacy/confidentiality notice, emergency limitations, consent acknowledgment, withdrawal rights, signature/date.' },
      { label: 'Vendor Agreement', prompt: 'Create a Vendor Agreement for healthcare supplies/services. Include: products/services, quality standards, compliance with healthcare laws, pricing, confidentiality, warranties, liability, termination.' },
      { label: 'NDA', prompt: 'Create a Non-Disclosure Agreement for healthcare contexts (protected info focus). Include: parties, PHI handling, purpose, obligations, security measures, breach notification, term, governing law.' }
    ],
    'Finance': [
      { label: 'Loan Agreement', prompt: 'Create a commercial Loan Agreement. Include: lender/borrower details, principal, purpose, disbursement, interest, repayment schedule, prepayment, default events, remedies, governing law, signatures.' },
      { label: 'Financial Services Agreement', prompt: 'Create a Financial Services Agreement for advisory or processing. Include: scope, limitations, fees, client responsibilities, confidentiality, data security, compliance boundaries, disclaimers, liability, termination, dispute resolution.' },
      { label: 'Client Onboarding Form', prompt: 'Create a financial client onboarding form draft. Include: identity details, contact info, service selection, declarations, data privacy notice, consent, document checklist placeholder, signature block.' },
      { label: 'Advisory Agreement', prompt: 'Create an Investment or Financial Advisory Agreement. Include: advisor appointment, scope, client responsibility for decisions, fee structure, confidentiality, conflict disclosure, risk disclaimer, liability, termination.' },
      { label: 'Merchant Agreement', prompt: 'Create a Merchant or Payment Processing Agreement. Include: services, onboarding requirements, transaction scope, fees/settlement, chargeback handling, compliance, data security, suspension rights, warranties, termination.' },
      { label: 'NDA', prompt: 'Create an NDA for financial discussions (M&A, investment, strategy). Include: parties, confidential info (financial focus), purpose, obligations, permitted use, security, term, remedies, governing law.' },
      { label: 'Vendor Agreement', prompt: 'Create a Vendor Agreement for financial sector. Include: products/services, service levels, security compliance, pricing, confidentiality, bank-level data protection, warranties, termination.' }
    ],
    'General': [
      { label: 'Vendor Agreement', prompt: 'Create a general business Vendor Agreement. Include: parties, products/services, delivery, pricing, confidentiality, compliance, warranties, liability, termination.' },
      { label: 'Contractor Agreement', prompt: 'Create a general Independent Contractor Agreement. Include: role/services, compensation, confidentiality, IP ownership, term, termination, return of property, dispute language.' },
      { label: 'NDA', prompt: 'Create a standard Mutual Non-Disclosure Agreement. Include: parties, purpose, confidential info, obligations, permitted use, return/destruction, term, governing law.' },
      { label: 'Statement of Work', prompt: 'Create a general Statement of Work. Include: project objective, scope, deliverables, timeline, milestones, responsibilities, fees, change control.' },
      { label: 'Terms & Conditions', prompt: 'Create business Terms and Conditions for B2B. Include: services/products, pricing, payment, acceptable use, confidentiality, IP, disclaimer, liability, termination, governing law.' },
      { label: 'Partnership Agreement', prompt: 'Create a general Business Partnership Agreement. Include: partners, purpose, capital contributions, profit/loss sharing, management/voting, dissolution, dispute resolution, governing law.' }
    ]
  };

  const INDUSTRIES = Object.keys(INDUSTRY_MAP);

  // Only show full tabs in edit mode (after template has been created/uploaded)
  const TABS = isEditMode ? [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'visual', label: 'Visual Builder', icon: Edit },
    { id: 'connection', label: 'Connection', icon: Link2 },
    { id: 'integration', label: 'Integration', icon: Webhook },
    { id: 'validation', label: 'Validation', icon: CheckCircle },
    { id: 'logs', label: 'Logs', icon: Clock },
  ] : [
    { id: 'details', label: 'Details', icon: FileText },
  ];

  useEffect(() => {
    if (isEditMode) {
      loadTemplate();
    }
    loadCrmObjects();
  }, [templateId]);

  const loadTemplate = async () => {
    // ── Session cache: hydrate instantly from prior visit (keyed by template id)
    //    After hydrate we still refresh in background (see below) so data is never stale.
    let hydratedFromCache = false;
    try {
      const cacheRaw = sessionStorage.getItem(`docflow_tpl_cache:${templateId}`);
      if (cacheRaw) {
        const cached = JSON.parse(cacheRaw);
        if (cached?.templateData) {
          setTemplateData(cached.templateData);
          if (cached.templateData.is_validated) setIsValidated(true);
          if (Array.isArray(cached.fieldPlacements)) setFieldPlacements(cached.fieldPlacements);
          if (Array.isArray(cached.contentBlocks)) setContentBlocks(cached.contentBlocks);
          hydratedFromCache = true;
          setLoading(false); // Paint shell immediately from cache
        }
      }
    } catch (_cacheErr) { /* ignore cache errors */ }

    try {
      if (!hydratedFromCache) setLoading(true);

      // ── Phase 1: critical path — template metadata only. Blocks shell render.
      const data = await docflowService.getTemplate(templateId);
      setTemplateData(data);
      if (data.is_validated) setIsValidated(true);

      // Shell renders NOW. Everything below is background/non-blocking.
      setLoading(false);

      // ── Phase 4 (start EARLY, runs in parallel with Phase 2): PDF blob.
      //     Heaviest network operation; displays its own skeleton in the viewer area.
      const pdfPromise = (async () => {
        if (!(data.file_url || data.s3_key || data.pdf_file_path || data.pdf_filename)) return;
        setPdfLoading(true);
        try {
          let pdfUrlToLoad = null;
          if (data.file_type === 'docx') {
            if (data.uploaded_pdf_url) {
              pdfUrlToLoad = data.uploaded_pdf_url;
            } else {
              try {
                const genRes = await fetch(`${API_URL}/api/docflow/templates/${templateId}/generate-pdf`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                if (genRes.ok) {
                  const genData = await genRes.json();
                  pdfUrlToLoad = genData.pdf_url;
                }
              } catch (genErr) {
                console.warn('DOCX to PDF conversion not available:', genErr);
              }
            }
          }
          const urlToFetch = pdfUrlToLoad || data.file_url;
          let blob;
          if (urlToFetch) {
            const response = await fetch(urlToFetch, { method: 'GET', mode: 'cors' });
            if (response.ok) blob = await response.blob();
          }
          if (!blob) {
            blob = await docflowService.getTemplatePDF(templateId);
          }
          if (blob && (data.file_type === 'pdf' || pdfUrlToLoad)) {
            const file = new File(
              [blob],
              data.original_filename || data.pdf_filename || 'template.pdf',
              { type: 'application/pdf' }
            );
            setUploadedPdfFile(file);
          }
        } catch (pdfError) {
          console.error('Error loading template file:', pdfError);
          toast.error('Failed to load template file');
        } finally {
          setPdfLoading(false);
        }
      })();
      // Fire but do NOT await — fails-safe via finally/catch inside.
      void pdfPromise;

      // ── Phase 2: independent secondary data — run in parallel, don't await serially.
      const [_versionsRes, fieldsRes, blocksRes] = await Promise.allSettled([
        docflowService.getTemplateVersions(templateId)
          .then(vData => { setVersionHistory(vData.versions || []); return vData; })
          .catch(vErr => { console.warn('Could not load version history:', vErr); return null; }),
        docflowService.getFieldPlacements(templateId)
          .then(fieldData => {
            const fps = fieldData?.field_placements || [];
            if (fieldData?.field_placements) setFieldPlacements(fps);
            return fps;
          })
          .catch(fieldError => {
            console.warn('Field placements endpoint failed, using template payload:', fieldError);
            const fps = data.field_placements || [];
            if (fps.length) setFieldPlacements(fps);
            return fps;
          }),
        docflowService.getContentBlocks(templateId || data.id)
          .then(blockData => {
            const blocks = blockData?.content_blocks || [];
            if (blocks.length > 0) {
              setContentBlocks(blocks);
              if (!data.html_content) {
                const reconstructedHtml = blocks.map(b => {
                  if (b.type === 'heading') return `<h${b.level || 2}>${b.content || ''}</h${b.level || 2}>`;
                  if (b.type === 'paragraph') return `<p>${b.content || ''}</p>`;
                  if (b.type === 'list') {
                    const tag = b.ordered ? 'ol' : 'ul';
                    return `<${tag}>${(b.items || []).map(i => `<li>${i}</li>`).join('')}</${tag}>`;
                  }
                  if (b.type === 'table') return b.html || '';
                  if (b.type === 'divider') return '<hr/>';
                  return `<p>${b.content || ''}</p>`;
                }).join('\n');
                setTemplateData(prev => ({ ...prev, html_content: reconstructedHtml }));
              }
            }
            return blocks;
          })
          .catch(blockErr => { console.warn('Content blocks not available:', blockErr); return []; }),
        parseFields(templateId).catch(parseErr => { console.warn('parseFields failed:', parseErr); return null; }),
      ]);

      // ── Update session cache with freshly loaded data ─────────────────
      try {
        const cachedFieldPlacements = fieldsRes?.status === 'fulfilled' ? fieldsRes.value : [];
        const cachedBlocks = blocksRes?.status === 'fulfilled' ? blocksRes.value : [];
        sessionStorage.setItem(
          `docflow_tpl_cache:${templateId}`,
          JSON.stringify({
            templateData: data,
            fieldPlacements: cachedFieldPlacements,
            contentBlocks: cachedBlocks,
          })
        );
      } catch (_saveErr) { /* quota — ignore */ }

      // ── Phase 3: CRM fields (depends on metadata) — also non-blocking.
      if (data.crm_connection?.object_name) {
        loadCrmFields(data.crm_connection.object_name).catch(() => {});
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
      setLoading(false);
    }
  };

  const loadCrmObjects = async () => {
    try {
      const data = await docflowService.getCrmObjects();
      setCrmObjects(data.objects || data || []);
    } catch (err) {
      console.error('Error loading CRM objects:', err);
    }
  };

  const loadCrmFields = async (objectName) => {
    try {
      const data = await docflowService.getCrmObjectFields(objectName);
      setCrmFields(data.fields || []);
    } catch (err) {
      console.error('Error loading CRM fields:', err);
    }
  };

  // Reset validation when template content changes (for edit mode)
  const invalidateValidation = () => {
    if (isValidated) {
      setIsValidated(false);
      setValidationResult(null);
    }
  };

  // Track changes that should invalidate validation
  const handleTemplateDataChange = (updates) => {
    setTemplateData(prev => ({ ...prev, ...updates }));
    // Invalidate validation when key fields change
    if (updates.field_placements || updates.recipients || updates.crm_connection || updates.html_content) {
      invalidateValidation();
    }
  };

  const handleFieldPlacementsChange = (newPlacements) => {
    console.log('[TemplateEditor] handleFieldPlacementsChange called with', newPlacements?.length, 'fields');
    console.log('[TemplateEditor] Previous field count:', fieldPlacements?.length);
    setFieldPlacements(newPlacements);
    invalidateValidation();
  };

  const parseFields = async (id) => {
    try {
      const result = await docflowService.parseTemplateFields(id);
      setMergeFields(result.merge_fields || []);
    } catch (error) {
      console.error('Error parsing fields:', error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // STRICT FILE TYPE VALIDATION - Only PDF and DOCX allowed
    const allowedTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'  // .doc support
    ];
    const allowedExtensions = ['.pdf', '.docx', '.doc'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      toast.error('Unsupported file type. Please upload PDF or DOC/DOCX only.');
      e.target.value = ''; // Reset input
      return;
    }
    
    // Block image files explicitly
    if (file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(fileExtension)) {
      toast.error('Image files are not supported. Please upload PDF or DOC/DOCX only.');
      e.target.value = '';
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error('File size exceeds 100MB limit.');
      return;
    }

    try {
      setGenerating(true);
      const fileToUpload = file;

      const result = await docflowService.uploadTemplatePDF(
        fileToUpload,
        templateData.name || file.name.replace('.docx', '').replace('.pdf', ''),
        templateData.description || '',
        templateData.template_type || 'contract'
      );

      if (result.success) {
        setTemplateData(prev => ({ ...prev, ...result.template }));
        // Only set as PDF file for react-pdf if the uploaded file is actually a PDF
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          setUploadedPdfFile(fileToUpload);
        }
        setActiveTab('visual');
        toast.success('File uploaded successfully! Converting to editable blocks...');
        navigate(`/setup/docflow/templates/${result.template.id}`);

        // Auto-convert to editable blocks via backend (PDF or DOCX handled server-side)
        try {
          const convResult = await docflowService.convertToBlocks(result.template.id);
          if (convResult.content_blocks?.length) {
            setContentBlocks(convResult.content_blocks);
            toast.success(`Document converted: ${convResult.content_blocks.length} editable blocks extracted`);
          }
        } catch (convErr) {
          console.warn('Document conversion to blocks failed (non-critical):', convErr);
        }
      } else {
        toast.error(result.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    } finally {
      setGenerating(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!selectedDocType && !aiPrompt.trim()) {
      toast.error('Please select a document type or enter a prompt');
      return;
    }
    try {
      setGenerating(true);
      const result = await docflowService.aiGenerateTemplate(aiPrompt, industry, selectedDocType, basePrompt);
      if (result.success) {
        const newTemplateData = {
          ...templateData,
          name: result.suggested_name || templateData.name || 'Untitled Template',
          description: result.description || templateData.description,
          html_content: result.html,
          source: 'ai_generated',
          ai_prompt: aiPrompt,
          template_type: selectedDocType?.toLowerCase() || templateData.template_type,
          status: 'draft',
        };

        // Auto-convert HTML to content blocks
        let blocks = [];
        if (result.html) {
          try {
            const resp = await fetch(`${API_URL}/api/docflow/templates/convert-html-to-blocks`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({ html: result.html })
            });
            if (resp.ok) {
              const blockData = await resp.json();
              if (blockData.content_blocks?.length > 0) {
                blocks = blockData.content_blocks;
              }
            }
          } catch (e) {
            console.warn('Could not convert HTML to blocks:', e);
          }
        }

        // Auto-save as draft and redirect to edit page
        try {
          const saveData = {
            ...newTemplateData,
            content_blocks: blocks.length > 0 ? blocks : undefined,
          };
          delete saveData._id;
          const created = await docflowService.createTemplate(saveData);
          if (created?.id) {
            toast.success('Template generated! Redirecting to editor...');
            navigate(`/setup/docflow/templates/${created.id}`);
            return;
          }
        } catch (saveErr) {
          console.error('Failed to auto-save generated template:', saveErr);
        }

        // Fallback: keep data locally if auto-save fails
        setTemplateData(newTemplateData);
        setMergeFields(result.merge_fields || []);
        setContentBlocks(blocks);
        toast.success('Template generated! Click Save to create.');
        setActiveTab('details');
      } else {
        toast.error(result.error || 'Failed to generate template');
      }
    } catch (error) {
      console.error('Error generating template:', error);
      toast.error('Failed to generate template');
    } finally {
      setGenerating(false);
    }
  };

  const handleValidationComplete = (results) => {
    console.log('Validation complete:', results);
    setValidationResult(results);
    setIsValidated(results.valid);
  };

  const handleValidate = async () => {
    setValidating(true);
    setActiveTab('validation');
    // Bump a token so the ValidationPanel knows to auto-run. Using a timestamp
    // ensures every click fires a fresh run (vs opening the tab manually).
    setAutoRunValidationToken(Date.now());
    setTimeout(() => setValidating(false), 500);
  };

  const handleSave = async () => {
    if (!templateData.name?.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    const isDraft = !templateData.status || templateData.status === 'draft';
    const isActive = templateData.status === 'active';

    // ALL templates require validation before saving
    if (!isValidated) {
      toast.error('Please run validation before saving');
      setActiveTab('validation');
      return;
    }
    if (validationResult && validationResult.errors && validationResult.errors.length > 0) {
      toast.error(`Fix ${validationResult.errors.length} validation error(s) before saving`);
      setActiveTab('validation');
      return;
    }

    try {
      setSaving(true);

      if (isEditMode && isDraft) {
        // DRAFT: Save in place + auto-activate
        const saveData = {
          ...templateData,
          field_placements: fieldPlacements,
          content_blocks: contentBlocks.length > 0 ? contentBlocks : undefined,
          status: 'active',
          is_validated: true,
        };
        delete saveData._id;
        await docflowService.updateTemplate(templateId, saveData);
        if (fieldPlacements && fieldPlacements.length > 0) {
          try { await docflowService.updateFieldPlacements(templateId, fieldPlacements); } catch {}
        }
        toast.success('Template saved and activated!');
        setTimeout(() => navigate('/setup/docflow'), 1200);
        return;
      }

      if (isEditMode && isActive) {
        // ACTIVE: Create a new version, redirect to listing
        const saveData = {
          ...templateData,
          field_placements: fieldPlacements,
          content_blocks: contentBlocks.length > 0 ? contentBlocks : undefined,
          status: 'active',
          is_validated: true,
        };
        delete saveData._id;
        const result = await docflowService.createNewVersion(templateId, saveData);
        if (result.success && result.template) {
          const response = result.template;
          const fromVer = templateData.version || 1;
          // Save field placements & content blocks on the new version
          if (fieldPlacements && fieldPlacements.length > 0) {
            try { await docflowService.updateFieldPlacements(response.id, fieldPlacements); } catch {}
          }
          if (contentBlocks && contentBlocks.length > 0) {
            try { await docflowService.updateContentBlocks(response.id, contentBlocks); } catch {}
          }
          toast.success(`New version v${response.version} created from v${fromVer}!`);
          setTimeout(() => navigate('/setup/docflow'), 1200);
        } else {
          toast.error('Failed to create new version');
        }
        return;
      }

      // NEW TEMPLATE: Create it
      const saveData = {
        ...templateData,
        field_placements: fieldPlacements,
        content_blocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        status: 'draft',
      };
      delete saveData._id;
      const response = await docflowService.createTemplate(saveData);
      if (fieldPlacements && fieldPlacements.length > 0) {
        await docflowService.updateFieldPlacements(response.id, fieldPlacements);
      }
      toast.success('Template created as draft');
      setTimeout(() => navigate('/setup/docflow'), 1500);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectionUpdate = (updates) => {
    setTemplateData(prev => ({ ...prev, ...updates }));
    if (updates.crm_connection?.object_name) {
      loadCrmFields(updates.crm_connection.object_name);
    }
  };

  const handleIntegrationUpdate = (updates) => {
    setTemplateData(prev => ({ ...prev, ...updates }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading template...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/setup/docflow')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              data-testid="back-to-dashboard-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-900" data-testid="editor-title">
                  {isEditMode ? 'Edit Template' : 'Create Template'}
                </h1>
                {/* Version Badge */}
                {isEditMode && templateData.version && (
                  <div className="relative">
                    <button
                      onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                      data-testid="version-badge"
                    >
                      <GitBranch className="h-3 w-3" />
                      v{templateData.version}
                      {templateData.is_latest !== false && (
                        <span className="ml-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold uppercase">Latest</span>
                      )}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {/* Version Dropdown */}
                    {showVersionDropdown && versionHistory.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50" data-testid="version-dropdown">
                        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><History className="h-3 w-3" /> Version History</p>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {versionHistory.map(v => (
                            <button
                              key={v.id}
                              onClick={() => {
                                setShowVersionDropdown(false);
                                navigate(`/setup/docflow/templates/${v.id}`);
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors flex items-center justify-between ${v.id === templateId ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                              data-testid={`version-item-${v.version}`}
                            >
                              <div>
                                <span className="font-medium text-gray-900">v{v.version}</span>
                                {v.is_latest && <span className="ml-1.5 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold uppercase">Latest</span>}
                                {v.created_from_version && (
                                  <span className="ml-1.5 text-[9px] text-gray-400">from v{v.created_from_version}</span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400">{v.status}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {isEditMode && templateData.status === 'active' && templateData.created_from_version
                  ? `Editing from v${templateData.created_from_version} — Saving will create a new version`
                  : isEditMode && templateData.status === 'active'
                  ? 'Active — Saving will create a new version'
                  : isEditMode && templateData.status === 'draft'
                  ? 'Draft — Validate and save to activate'
                  : 'Build professional document templates'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEditMode && isValidated && validationResult && validationResult.errors?.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">
                <AlertCircle className="h-3 w-3" />
                Fix Errors to Save
              </div>
            )}
            {isEditMode && !isValidated && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                <AlertCircle className="h-3 w-3" />
                Validation Required
              </div>
            )}
            {isEditMode && cluebotEnabled && (
            <button
              onClick={() => setCluebotOpen(prev => !prev)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg font-medium transition-colors shadow-sm text-sm ${cluebotOpen
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                }`}
              data-testid="cluebot-toggle-btn"
            >
              <Bot className="h-4 w-4" />
              CluBot
            </button>
            )}
            {isEditMode && (
              <button
                onClick={handleValidate}
                disabled={validating}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors shadow-sm"
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Validate
              </button>
            )}
            {isEditMode && (
              <button
                onClick={handleSave}
                disabled={saving || !templateData.name || !isValidated || (validationResult && validationResult.errors?.length > 0)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm ${
                  isValidated && !(validationResult && validationResult.errors?.length > 0)
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
                title={!isValidated ? 'Please run validation first' : ''}
                data-testid="save-btn"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : (isEditMode && templateData.status === 'active') ? 'Save as New Version' : 'Save Template'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {(isEditMode || templateData.html_content || uploadedPdfFile) && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6">
            <nav className="flex space-x-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-3.5 px-4 font-medium text-sm rounded-t-lg transition-all ${activeTab === tab.id
                      ? 'bg-gray-50 text-indigo-600 border-b-2 border-indigo-600 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Phase 76: full-width on wide screens — visual builder needs every
          pixel of horizontal space on 1600/1920/2560px+ monitors. We cap at
          2xl:max-w-[1600px] for content tabs; the visual builder tab uses
          a wider cap so the canvas can expand. */}
      <div className={`${activeTab === 'visual' ? 'max-w-none 2xl:max-w-[1920px]' : 'max-w-7xl'} mx-auto px-4 sm:px-6 py-6`}>
        {/* Tab Content */}
        {/* {activeTab === 'visual' && (isEditMode || uploadedPdfFile) ? ( */}
        {/* Tab Content */}
        {activeTab === 'visual' && (isEditMode || uploadedPdfFile || contentBlocks.length > 0) ? (
          (uploadedPdfFile || contentBlocks.length > 0) ? (
            <MultiPageVisualBuilder
              pdfFile={uploadedPdfFile}
              fields={fieldPlacements}
              onFieldsChange={(fields) => {
                handleFieldPlacementsChange(fields);
                setTemplateData(prev => ({ ...prev, field_placements: fields }));
              }}
              crmObjects={crmObjects}
              crmConnection={templateData.crm_connection}
              templateRecipients={templateData.recipients}
              contentBlocks={contentBlocks}
              onContentBlocksChange={(blocks) => {
                setContentBlocks(blocks);
                invalidateValidation();
              }}
              onTextSelect={(text, blockId) => {
                setSelectedText(text);
                setSelectedBlockId(blockId || '');
              }}
              highlightBlockId={highlightBlockId}
              onConvertToEditable={isEditMode ? async () => {
                try {
                  const result = await docflowService.convertToBlocks(templateId);
                  if (result.content_blocks?.length > 0) {
                    setContentBlocks(result.content_blocks);
                    toast.success(`Converted to ${result.content_blocks.length} editable blocks`);
                  } else {
                    toast.error('No content could be extracted from this document');
                  }
                } catch (err) {
                  console.error('Convert to blocks failed:', err);
                  toast.error('Failed to convert document');
                }
              } : undefined}
            />
          ) : pdfLoading ? (
            /* Skeleton shown while the PDF blob is still being downloaded in the background */
            <div
              className="bg-white rounded-lg border border-gray-200 p-6"
              data-testid="visual-builder-skeleton"
            >
              <div className="flex items-center gap-3 text-indigo-600 mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Loading document…</span>
              </div>
              <div className="space-y-3">
                <div className="h-[420px] w-full rounded-md bg-gradient-to-b from-gray-100 to-gray-50 border border-gray-200 animate-pulse" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-10 rounded-md bg-gray-100 animate-pulse" />
                  <div className="h-10 rounded-md bg-gray-100 animate-pulse" />
                  <div className="h-10 rounded-md bg-gray-100 animate-pulse" />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Upload a PDF to use the Visual Builder</p>
              <button
                onClick={() => setActiveTab('details')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Go to Upload
              </button>
            </div>
          )
        ) : activeTab === 'connection' ? (
          <ConnectionTab
            templateData={templateData}
            onUpdate={handleConnectionUpdate}
          />
        ) : activeTab === 'recipients' ? (
          <RecipientsRoutingTab
            templateData={templateData}
            fieldPlacements={fieldPlacements}
            onUpdate={(updates) => setTemplateData(prev => ({ ...prev, ...updates }))}
          />
        ) : activeTab === 'integration' ? (
          <IntegrationTab
            templateData={templateData}
            onUpdate={handleIntegrationUpdate}
          />
        ) : activeTab === 'validation' ? (
          <ValidationPanel
            templateId={templateId}
            templateData={templateData}
            fieldPlacements={fieldPlacements}
            onValidationComplete={handleValidationComplete}
            autoRunToken={autoRunValidationToken}
          />
        ) : activeTab === 'logs' && isEditMode ? (
          <TemplateLogsTab templateId={templateId} />
        ) : (
          /* Details Tab */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Template Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={templateData.name}
                      onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter template name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={templateData.description}
                      onChange={(e) => setTemplateData({ ...templateData, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Describe your template"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Type</label>
                    <select
                      value={templateData.template_type}
                      onChange={(e) => setTemplateData({ ...templateData, template_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="quotation">Quotation</option>
                      <option value="nda">NDA</option>
                      <option value="invoice">Invoice</option>
                      <option value="contract">Contract</option>
                      <option value="proposal">Proposal</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* AI Generator */}
              {/* {!isEditMode && (<> */}


                <div className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden mb-8">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI Document Generator
                    </h3>
                    <p className="text-indigo-100 text-sm mt-1">Generate complete, industry-specific documents in seconds.</p>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Industry Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">Select Industry</label>
                      <div className="flex flex-wrap gap-2">
                        {INDUSTRIES.map(ind => (
                          <button
                            key={ind}
                            onClick={() => {
                              setIndustry(ind);
                              setSelectedDocType(null);
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                              industry === ind
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-100'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            {ind}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Document Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">What document do you need?</label>
                      <div className="flex flex-wrap gap-2">
                        {INDUSTRY_MAP[industry].map(type => (
                          <button
                            key={type.label}
                            onClick={() => {
                              setSelectedDocType(type.label);
                              setBasePrompt(type.prompt);
                            }}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
                              selectedDocType === type.label
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                          >
                            {selectedDocType === type.label && <CheckCircle className="h-4 w-4" />}
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Input with Voice */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Instructions <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <div className="relative">
                        <textarea
                          data-testid="ai-prompt-textarea"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder={`Example: "Include a 30-day termination notice and specific data compliance clauses for EU residents."`}
                          rows={3}
                          className={`w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50/50 transition-all ${
                            isRecording ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200'
                          }`}
                        />
                        {voiceSupported && (
                          <button
                            data-testid="voice-input-btn"
                            type="button"
                            onClick={toggleVoiceInput}
                            className={`absolute right-2.5 top-2.5 p-1.5 rounded-lg transition-all ${
                              isRecording
                                ? 'bg-red-100 text-red-600 hover:bg-red-200 animate-pulse'
                                : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
                            }`}
                            title={isRecording ? 'Stop recording' : 'Start voice input'}
                          >
                            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                      {isRecording && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                          </span>
                          <span className="text-xs text-red-600 font-medium">Listening... speak now</span>
                          {/* <button
                            data-testid="cancel-voice-btn"
                            onClick={() => { recognitionRef.current?.stop(); setIsRecording(false); }}
                            className="text-xs text-gray-500 hover:text-red-600 underline ml-auto"
                          >
                            Cancel
                          </button> */}
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleAIGenerate}
                        disabled={generating || (!selectedDocType && !aiPrompt.trim())}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-semibold transition-all shadow-lg shadow-indigo-200"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Grafting your document...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-5 w-5" />
                            Generate Complete Template
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Document Preview */}
                {templateData.html_content && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Rendered AI Document</h3>
                      <div className="flex gap-2">
                        <button
                          // onClick={async () => {
                          //   try {
                          //     setGenerating(true);

                          //     // 1. Dynamically load html2pdf.js if not available
                          //     if (!window.html2pdf) {
                          //       const script = document.createElement('script');
                          //       script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                          //       document.head.appendChild(script);
                          //       await new Promise((resolve) => { script.onload = resolve; });
                          //     }

                          //     // 2. Prepare the HTML content with a strict 210mm A4 layout
                          //     const htmlWrapper = `
                          //       <div id="pdf-container" style="width: 210mm; min-height: 297mm; padding: 25mm; background-color: #ffffff; color: #333; font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; box-sizing: border-box; position: relative; margin: 0 auto;">
                          //         <style>
                          //           * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
                          //           body { margin: 0; padding: 0; background-color: #ffffff; }
                          //           table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; table-layout: fixed; }
                          //           th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; word-break: break-word; }
                          //           img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
                          //           h1 { border-bottom: 2px solid #edf2f7; padding-bottom: 0.5em; margin-bottom: 1em; color: #2d3748; }
                          //           p { margin-bottom: 1.25em; }
                          //           .text-center { text-align: center; }
                          //           .text-right { text-align: right; }
                          //           .font-bold { font-weight: bold; }
                          //           .no-print { display: none !important; }
                          //         </style>
                          //         <div style="width: 100%;">
                          //           ${templateData.html_content}
                          //         </div>
                          //       </div>
                          //     `;

                          //     // 3. Convert to PDF with standard A4 window size
                          //     const opt = {
                          //       margin: 0,
                          //       filename: `${templateData.name || 'document'}.pdf`,
                          //       image: { type: 'jpeg', quality: 1.0 },
                          //       html2canvas: { 
                          //         scale: 3, 
                          //         useCORS: true, 
                          //         logging: false, 
                          //         letterRendering: true,
                          //         scrollY: 0,
                          //         windowWidth: 794 // Strict match to 210mm at 96 DPI
                          //       },
                          //       jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
                          //     };

                          //     const pdfBlob = await window.html2pdf().from(htmlWrapper).set(opt).output('blob');

                          //     const file = new File([pdfBlob], `${templateData.name || 'document'}.pdf`, { type: 'application/pdf' });

                          //     const result = await docflowService.uploadTemplatePDF(
                          //       file,
                          //       templateData.name,
                          //       templateData.description || '',
                          //       templateData.template_type
                          //     );

                          //     if (result.success) {
                          //       toast.success('Document saved as PDF with Styles! Redirecting to Visual Builder...');
                          //       navigate(`/setup/docflow/templates/${result.template.id}`);
                          //     }
                          //   } catch (err) {
                          //     console.error('Error saving AI document with styles:', err);
                          //     toast.error('Failed to save document as PDF. Please try again.');
                          //   } finally {
                          //     setGenerating(false);
                          //   }
                          // }}

                          onClick={async () => {
                            try {
                              setGenerating(true);

                              // 1. Load html2pdf if not loaded
                              if (!window.html2pdf) {
                                const script = document.createElement("script");
                                script.src =
                                  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
                                document.head.appendChild(script);
                                await new Promise((resolve) => {
                                  script.onload = resolve;
                                });
                              }

                              // 2. Create REAL DOM element
                              const container = document.createElement("div");
                              container.id = "pdf-root";

                              container.innerHTML = `
      <div style="
        width: 210mm;
        min-height: 297mm;
        padding: 15mm;
        margin: 0 auto;
        background: #ffffff;
        color: #333;
        font-family: Arial, sans-serif;
        line-height: 1.6;
        box-sizing: border-box;
      ">
        <style>
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
          body { margin: 0; padding: 0; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #ddd; padding: 8px; word-break: break-word; }
          img { max-width: 100%; height: auto; }
          h1, h2, h3 { margin-top: 0; }
          p { margin-bottom: 10px; }
        </style>
        ${templateData.html_content}
      </div>
    `;

                              document.body.appendChild(container);

                              // 3. PDF options
                              const opt = {
                                margin: 0,
                                filename: `${templateData.name || "document"}.pdf`,
                                image: { type: "jpeg", quality: 1 },
                                html2canvas: {
                                  scale: 2,
                                  useCORS: true,
                                  scrollY: 0
                                },
                                jsPDF: {
                                  unit: "mm",
                                  format: "a4",
                                  orientation: "portrait"
                                }
                              };

                              // 4. Generate PDF from REAL DOM
                              const pdfBlob = await window
                                .html2pdf()
                                .set(opt)
                                .from(container)
                                .output("blob");

                              // 5. Cleanup DOM
                              document.body.removeChild(container);

                              // 6. Upload PDF
                              const file = new File(
                                [pdfBlob],
                                `${templateData.name || "document"}.pdf`,
                                { type: "application/pdf" }
                              );

                              const result = await docflowService.uploadTemplatePDF(
                                file,
                                templateData.name,
                                templateData.description || "",
                                templateData.template_type
                              );

                              if (result.success) {
                                const newTemplateId = result.template.id;

                                // 7. Preserve AI content blocks on the new template
                                // Using update_content_blocks stores both blocks and html_content in DB
                                try {
                                  const token = localStorage.getItem('token');
                                  let blocksToSave = contentBlocks;

                                  // If we don't have blocks yet, convert from HTML
                                  if (!blocksToSave || blocksToSave.length === 0) {
                                    const convResp = await fetch(`${API_URL}/api/docflow/templates/convert-html-to-blocks`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ html: templateData.html_content })
                                    });
                                    if (convResp.ok) {
                                      const convData = await convResp.json();
                                      blocksToSave = convData.content_blocks || [];
                                    }
                                  }

                                  // Save blocks (this also stores html_content in DB via blocks_to_html)
                                  if (blocksToSave && blocksToSave.length > 0) {
                                    await fetch(`${API_URL}/api/docflow/templates/${newTemplateId}/content-blocks`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ content_blocks: blocksToSave })
                                    });
                                  }
                                } catch (preserveErr) {
                                  console.warn('Non-critical: Could not preserve content on new template:', preserveErr);
                                }

                                toast.success("PDF generated & saved! Redirecting to Visual Builder...");
                                navigate(`/setup/docflow/templates/${newTemplateId}`);
                              }
                            } catch (err) {
                              console.error(err);
                              toast.error("PDF generation failed");
                            } finally {
                              setGenerating(false);
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 transition-colors"
                        >
                          <Save className="h-3 w-3" />
                          Save as PDF & Continue
                        </button>
                      </div>
                    </div>

                    {/* Live Iframe Preview for proper CSS rendering */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-inner h-[500px]">
                      <iframe
                        title="AI Content Preview"
                        srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <style>
                              body { font-family: sans-serif; padding: 20px; line-height: 1.5; color: #333; }
                              .preview-container { max-width: 100%; margin: 0 auto; }
                            </style>
                          </head>
                          <body>
                            <div class="preview-container">
                              ${templateData.html_content}
                            </div>
                          </body>
                        </html>
                      `}
                        className="w-full h-full border-none"
                      />
                    </div>
                  </div>
                )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Merge Fields */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Merge Fields</h3>
                {mergeFields.length > 0 ? (
                  <div className="space-y-2">
                    {mergeFields.map((field, index) => (
                      <div key={index} className="px-3 py-2 bg-orange-50 rounded-md text-sm font-mono text-orange-700 border border-orange-200">
                        {`{{${field}}}`}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No merge fields detected. Use format: <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{`{{Object.Field}}`}</code></p>
                )}
              </div>

              {/* Tips */}
              <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-6">
                <h4 className="font-semibold text-indigo-900 mb-2">💡 Tips</h4>
                <ul className="text-sm text-indigo-800 space-y-2">
                  <li>• Use <code className="bg-indigo-100 px-1 rounded text-xs">{`{{Object.Field}}`}</code> for dynamic data</li>
                  <li>• Connect CRM in the Connection tab</li>
                  <li>• Configure webhooks in Integration tab</li>
                  <li>• Run validation before saving</li>
                  <li>• Add signature fields for e-signing</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Upload Section - shown at bottom when on details tab */}
        {mode === 'upload' && !templateData.html_content && activeTab === 'details' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {templateId ? 'Change Document' : 'Upload Document'}
            </h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                <Upload className="h-5 w-5" />
                Choose File
              </label>
              <p className="text-sm text-gray-500 mt-3">Supported formats: PDF, DOCX (Max 100MB)</p>
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Uploading/Generating Overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white px-8 py-10 rounded-2xl flex flex-col items-center shadow-2xl min-w-[320px] max-w-sm">
            <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Document</h3>
            <p className="text-sm text-gray-500 text-center px-4 leading-relaxed">
              Please wait while we process and analyze your file. This may take a few moments.
            </p>
          </div>
        </div>
      )}

      {/* ClueBot AI Panel */}
      <ClueBotPanel
        isOpen={cluebotOpen}
        onClose={() => setCluebotOpen(false)}
        templateData={templateData}
        fieldPlacements={fieldPlacements}
        contentBlocks={contentBlocks}
        selectedText={selectedText}
        selectedBlockId={selectedBlockId}
        onFieldsUpdate={(fields) => {
          console.log('[TemplateEditor] Received field update from ClueBot:', fields?.length, 'fields');
          handleFieldPlacementsChange(fields);
          setTemplateData(prev => ({ ...prev, field_placements: fields }));
          toast.success(`Fields updated: ${fields?.length || 0} total fields`);
        }}
        onContentBlocksUpdate={(blockEdits) => {
          console.log('[TemplateEditor] Block edits received from ClueBot:', blockEdits);
          if (!blockEdits || blockEdits.length === 0) return;

          setContentBlocks(prev => {
            let updated = [...prev];
            for (const edit of blockEdits) {
              if (edit.action === 'update') {
                updated = updated.map(b =>
                  b.id === edit.block_id ? { ...b, ...edit.updates, id: b.id } : b
                );
                // Highlight the edited block
                setHighlightBlockId(edit.block_id);
                setTimeout(() => setHighlightBlockId(null), 2500);
              } else if (edit.action === 'delete') {
                updated = updated.filter(b => b.id !== edit.block_id);
              } else if (edit.action === 'insert_after') {
                const idx = updated.findIndex(b => b.id === edit.block_id);
                const newBlock = { ...edit.new_block, id: `blk_${Date.now().toString(36)}` };
                if (idx >= 0) {
                  updated.splice(idx + 1, 0, newBlock);
                } else {
                  updated.push(newBlock);
                }
                setHighlightBlockId(newBlock.id);
                setTimeout(() => setHighlightBlockId(null), 2500);
              }
            }

            // Also regenerate html_content from blocks
            const newHtml = updated.map(b => {
              if (b.type === 'heading') return `<h${b.level || 2}>${b.content || ''}</h${b.level || 2}>`;
              if (b.type === 'paragraph') return `<p>${b.content || ''}</p>`;
              if (b.type === 'list') {
                const tag = b.ordered ? 'ol' : 'ul';
                return `<${tag}>${(b.items || []).map(i => `<li>${i}</li>`).join('')}</${tag}>`;
              }
              if (b.type === 'table') return b.html || '';
              if (b.type === 'divider') return '<hr/>';
              return `<p>${b.content || ''}</p>`;
            }).join('\n');
            handleTemplateDataChange({ html_content: newHtml });

            return updated;
          });

          // Clear selection after edit
          setSelectedText('');
          setSelectedBlockId('');
          toast.success('Document content updated!');
        }}
        onContentUpdate={(editInfo) => {
          // Legacy handler for old-style content edits
          console.log('[TemplateEditor] Legacy content edit:', editInfo);
          if (editInfo && templateData.html_content) {
            let newContent = templateData.html_content;
            if (editInfo.edit_type === 'replace' && editInfo.find) {
              newContent = newContent.replace(editInfo.find, editInfo.replace || '');
            }
            handleTemplateDataChange({ html_content: newContent });
            toast.success('Document content updated via ClueBot');
          }
        }}
      />
    </div>
  );
};

export default TemplateEditor;
