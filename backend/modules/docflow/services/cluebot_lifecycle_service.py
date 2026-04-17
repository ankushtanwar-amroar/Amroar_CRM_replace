"""
ClueBot Lifecycle Service
Adds end-to-end AI assistance across DocFlow template lifecycle stages.
"""
import base64
import json
import logging
import re
import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
import google.generativeai as genai

from .ai_template_service import AITemplateService
from .cluebot_service import ClueBotService
from .file_parser_service import FileParserService
from .merge_field_service import MergeFieldService

logger = logging.getLogger(__name__)


class ClueBotLifecycleService:
    """
    Unified orchestrator for ClueBot lifecycle assistance:
    A. Creation, B. In-editor copilot, C. Merge/CRM, D. Validation, E. Send-flow, F. Troubleshooting.
    """

    def __init__(self, db=None):
        self.db = db
        self.template_ai = AITemplateService()
        self.cluebot = ClueBotService(db)
        self.file_parser = FileParserService()
        self.merge_fields = MergeFieldService(db) if db is not None else None

    def capability_matrix(self) -> Dict[str, Any]:
        return {
            "A_template_creation_ai": {
                "prompt_generation": True,
                "upload_understanding": True,
                "guided_questions": True,
                "initial_structure_generation": True,
            },
            "B_in_editor_document_copilot": {
                "add_clause": True,
                "remove_clause": True,
                "rewrite_sections": True,
                "insert_at_position": True,
                "shorten_expand": True,
                "formalize_simplify": True,
                "professionalize_plain_text": True,
            },
            "C_merge_field_and_crm_assistance": {
                "suggest_merge_fields": True,
                "detect_missing_merge_fields": True,
                "recommend_user_input_instead": True,
                "suggest_crm_object_mapping": True,
                "convert_placeholders_to_merge_fields": True,
            },
            "D_ai_validation": {
                "completeness_review": True,
                "ambiguity_review": True,
                "missing_terms_review": True,
                "structure_review": True,
                "risk_review": True,
                "legal_review_explanation": True,
                "positioning": "AI validation/risk review only; not guaranteed legal advice",
            },
            "E_send_flow_ai": {
                "draft_email_subject_body": True,
                "insert_public_link": True,
                "adjust_tone": True,
                "recipient_wording": True,
                "branding_from_site_url": True,
                "header_footer_suggestions": True,
            },
            "F_chat_lifecycle_assistance": {
                "creation": True,
                "editing": True,
                "validation": True,
                "send_prep": True,
                "troubleshooting": True,
            },
        }

    async def lifecycle_chat(
        self,
        message: str,
        stage: str = "auto",
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        ctx = context or {}
        resolved_stage = self._resolve_stage(stage, message)

        if resolved_stage == "creation":
            return await self._handle_creation(message, ctx)
        if resolved_stage == "editor":
            return await self._handle_editor(message, ctx)
        if resolved_stage == "merge_crm":
            return await self._handle_merge_crm(message, ctx)
        if resolved_stage == "validation":
            return await self._handle_validation(message, ctx)
        if resolved_stage == "send_flow":
            return await self._handle_send_flow(message, ctx)
        return await self._handle_troubleshoot(message, ctx)

    def _resolve_stage(self, stage: str, message: str) -> str:
        if stage and stage != "auto":
            return stage

        m = (message or "").lower()
        if any(k in m for k in ["validate", "risk", "legally weak", "complete"]):
            return "validation"
        if any(k in m for k in ["email", "subject", "send", "public link", "reminder"]):
            return "send_flow"
        if any(k in m for k in ["merge field", "crm", "placeholder", "{{", "{lead.", "{contact."]):
            return "merge_crm"
        if any(k in m for k in ["error", "failed", "not working", "why", "issue"]):
            return "troubleshoot"
        if any(k in m for k in ["create", "new template", "uploaded", "agreement", "nda", "proposal"]):
            return "creation"
        return "editor"

    async def _call_lifecycle_llm_with_retry(
        self,
        system_prompt: str,
        user_message: str,
        max_retries: int = 2,
        timeout_seconds: float = 30.0,
        max_output_tokens: int = 1600,
        temperature: float = 0.2,
    ) -> str:
        """Local LLM caller for lifecycle parallel generation."""
        retry_delays = [2, 5, 10]
        genai.configure(api_key=self.template_ai.api_key)

        for attempt in range(max_retries):
            try:
                logger.info(
                    f"[ClueBotLifecycle] LLM attempt {attempt + 1}/{max_retries} for parallel generation"
                )
                model = genai.GenerativeModel(
                    model_name="gemini-2.5-flash",
                    system_instruction=system_prompt,
                )

                response = await asyncio.wait_for(
                    model.generate_content_async(
                        user_message,
                        generation_config={
                            "temperature": temperature,
                            "max_output_tokens": max_output_tokens,
                        },
                    ),
                    timeout=timeout_seconds,
                )
                return response.text if hasattr(response, "text") else str(response)
            except asyncio.TimeoutError:
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delays[attempt])
                else:
                    raise Exception("Parallel template generation timed out")
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delays[attempt])
                        continue
                    raise Exception("AI service rate limited. Please try again in a moment.")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delays[attempt])
                else:
                    raise

    async def generate_template_parallel(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Fast template generation with fixed parallel parting:
        1) split full template into 4 ordered parts
        2) generate all parts in parallel
        3) retry failed parts once
        4) merge in order
        Returns same shape as AITemplateService.generate_template().
        """
        if not self.template_ai.api_key:
            return {"success": False, "error": "AI Service not configured (Missing GEMINI_API_KEY)"}

        ctx = context or {}
        industry = ctx.get("industry", "General")
        doc_type = ctx.get("selected_doc_type", "General Document")
        base_prompt = ctx.get("base_prompt", "")
        company_name = (
            ctx.get("company_name")
            or ctx.get("organization_name")
            or ctx.get("client_company")
            or "[Company Name]"
        )
        signer_name = ctx.get("signer_name") or "[Authorized Signatory Name]"
        signer_title = ctx.get("signer_title") or "[Title]"
        fast_mode = bool(ctx.get("fast_mode", True))

        try:
            part_blueprint = [
                {
                    "id": "part_1",
                    "title": "Introduction and Parties",
                    "objective": "Cover purpose, scope, parties, definitions and effective date.",
                    "numbering_range": "Clauses 1-3",
                    "start_clause": 1,
                },
                {
                    "id": "part_2",
                    "title": "Commercial and Operational Terms",
                    "objective": "Cover deliverables, pricing/payment, responsibilities, SLAs, timelines and change process.",
                    "numbering_range": "Clauses 4-7",
                    "start_clause": 4,
                },
                {
                    "id": "part_3",
                    "title": "Risk and Compliance Terms",
                    "objective": "Cover confidentiality, IP, data protection, liability limits, indemnity, warranties and termination.",
                    "numbering_range": "Clauses 8-11",
                    "start_clause": 8,
                },
                {
                    "id": "part_4",
                    "title": "Legal Boilerplate and Execution",
                    "objective": "Cover governing law, dispute resolution, notices, assignment, force majeure and signature block.",
                    "numbering_range": "Clauses 12-15",
                    "start_clause": 12,
                },
            ]

            def _normalize_fragment(fragment: str) -> str:
                cleaned = (fragment or "").replace("```html", "").replace("```", "").strip()
                # Drop accidental full-document wrappers from part responses.
                cleaned = re.sub(r"</?html[^>]*>", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"</?body[^>]*>", "", cleaned, flags=re.IGNORECASE)
                # Remove leading part heading so merged document controls alignment consistently.
                cleaned = re.sub(r"^\s*<h2[^>]*>[\s\S]*?</h2>\s*", "", cleaned, count=1, flags=re.IGNORECASE)
                return cleaned.strip()

            async def _build_one_part(idx: int, part: Dict[str, str]) -> Dict[str, Any]:
                part_system_prompt = f"""
You are generating PART {idx + 1} of 4 for a professional business/legal template.

Document type: {doc_type}
Industry context: {industry}
Base Type Instruction: {base_prompt}
User instruction: {prompt}
Part title: {part.get("title", "")}
Part objective: {part.get("objective", "")}
Required numbering range: {part.get("numbering_range", "")}

Requirements:
- Output ONLY this part as HTML fragment (no surrounding <html><body>).
- This part must be self-contained and not repeat other parts.
- Use <h2> for headings with semantic tags (<p>, <ul>, <li>, <br/>).
- Use numbered clauses in this exact range: {part.get("numbering_range", "")}.
- Continue numbering naturally inside this part (e.g., 4, 4.1, 4.2 ... then 5, 5.1).
- Do NOT restart numbering from 1 in this part.
- Start directly from the first clause number in your range (no intro line like "This part outlines...").
- Do not output a part title heading; only clause content.
- Use placeholders for unknown values.
- Keep concise and business-ready (target 220-380 words).
- Do NOT output markdown.
"""
                raw = await self._call_lifecycle_llm_with_retry(
                    system_prompt=part_system_prompt,
                    user_message=f"Generate template part {idx + 1} of 4",
                    max_retries=1 if fast_mode else 2,
                    timeout_seconds=28.0 if fast_mode else 45.0,
                    max_output_tokens=1600 if fast_mode else 2600,
                    temperature=0.2,
                )
                html_fragment = _normalize_fragment(raw)
                # Guard against empty/noisy model outputs that would corrupt merge.
                if not html_fragment or len(html_fragment) < 40:
                    raise Exception(f"Empty HTML for {part.get('id')}")
                return {"order": idx, "part_id": part.get("id"), "html": html_fragment}

            tasks = [_build_one_part(i, p) for i, p in enumerate(part_blueprint)]
            initial_results = await asyncio.gather(*tasks, return_exceptions=True)

            parts_by_order: Dict[int, Dict[str, Any]] = {}
            failed_parts: List[int] = []
            for idx, item in enumerate(initial_results):
                if isinstance(item, Exception):
                    failed_parts.append(idx)
                    logger.warning(f"[ClueBotLifecycle] Part {idx + 1} failed in parallel pass: {item}")
                else:
                    parts_by_order[idx] = item

            # Retry only failed parts once to improve resilience without large latency.
            for idx in failed_parts:
                try:
                    retry_result = await _build_one_part(idx, part_blueprint[idx])
                    parts_by_order[idx] = retry_result
                except Exception as retry_error:
                    logger.warning(f"[ClueBotLifecycle] Part {idx + 1} retry failed: {retry_error}")

            # Final recovery pass: regenerate any still-missing parts sequentially.
            missing_after_retry = [i for i in range(len(part_blueprint)) if i not in parts_by_order]
            for idx in missing_after_retry:
                try:
                    final_result = await _build_one_part(idx, part_blueprint[idx])
                    parts_by_order[idx] = final_result
                except Exception as final_error:
                    logger.error(f"[ClueBotLifecycle] Part {idx + 1} final recovery failed: {final_error}")

            # Strict completeness rule: if any part is missing, return a complete one-shot template.
            if len(parts_by_order) != len(part_blueprint):
                logger.info("[ClueBotLifecycle] Incomplete parallel parts, falling back to single-pass template generation")
                return await self.template_ai.generate_template(prompt=prompt, context=ctx)

            ordered_results = [parts_by_order[i] for i in range(len(part_blueprint))]
            merged_parts: List[str] = []
            for i, result in enumerate(ordered_results):
                part = part_blueprint[i]
                merged_parts.append(
                    f"<h2>{part.get('start_clause')}. {part.get('title')}</h2>{result.get('html', '')}"
                )
            body_html = "".join(merged_parts).strip()

            # Ensure signature/company details are always present (old behavior parity).
            if "signature" not in body_html.lower() and "signatory" not in body_html.lower():
                body_html += f"""
<h2>Signatures</h2>
<p><strong>For {company_name}</strong></p>
<p>Name: {signer_name}<br/>Title: {signer_title}<br/>Date: [Effective Date]</p>
<br/>
<p><strong>Counterparty</strong></p>
<p>Name: [Counterparty Signatory Name]<br/>Title: [Counterparty Title]<br/>Date: [Counterparty Signature Date]</p>
"""

            suggested_name = f"{industry} - {doc_type}"
            description = f"Professional {doc_type} template generated in parallel parts with business clauses and signature placeholders."

            merged_html = "<html><body>" + body_html + "</body></html>"

            return {
                "success": True,
                "html": merged_html,
                "merge_fields": [],
                "suggested_name": suggested_name,
                "description": description,
            }
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[ClueBotLifecycle] Parallel template generation failed: {error_msg}")
            # Keep UX responsive: fallback to single-pass generator when parallel path times out/rate-limits.
            if (
                "timeout" in error_msg.lower()
                or "timed out" in error_msg.lower()
                or "expecting ',' delimiter" in error_msg.lower()
                or "json" in error_msg.lower()
            ):
                logger.info("[ClueBotLifecycle] Falling back to single-pass template generation")
                return await self.template_ai.generate_template(prompt=prompt, context=ctx)
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                return {
                    "success": False,
                    "error_type": "quota_exceeded",
                    "error": "AI service busy. Please try again in a few seconds.",
                    "retry_after": 5,
                }
            return {"success": False, "error": f"AI Generation error: {error_msg}"}

    async def _handle_creation(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        upload = ctx.get("uploaded_file")
        questions = self._guided_creation_questions(message, ctx)
        generated = None
        parsed_upload = None
        initial_structure = self._suggest_initial_structure(message, ctx)

        if upload and upload.get("content_base64") and upload.get("filename"):
            try:
                content = base64.b64decode(upload["content_base64"])
                parsed_upload = await self.file_parser.parse_file(
                    file_content=content,
                    filename=upload.get("filename", "uploaded.pdf"),
                    content_type=upload.get("content_type", "application/pdf"),
                )
            except Exception as e:
                logger.warning(f"[ClueBotLifecycle] Upload parse failed: {e}")
                parsed_upload = {"success": False, "error": str(e)}

        # Prompt-based generation when user requests creation.
        if self._looks_like_creation_request(message):
            generated = await self.template_ai.generate_template(prompt=message, context=ctx.get("template_context", {}))

        return {
            "success": True,
            "stage": "creation",
            "response": "Creation assistance prepared.",
            "guided_questions": questions,
            "upload_understanding": parsed_upload,
            "generated_template": generated,
            "initial_structure_suggestion": initial_structure,
        }

    async def _handle_editor(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        # Delegate granular editing to existing ClueBot editor logic.
        base = await self.cluebot.chat(message=message, context=ctx)
        if not base.get("success"):
            return base
        return {
            **base,
            "stage": "editor",
            "editing_scope": {
                "selected_text": bool(ctx.get("selected_text")),
                "selected_block_id": ctx.get("selected_block_id"),
                "cursor_position": ctx.get("cursor_position"),
                "requested_mode": self._detect_edit_mode(message),
            },
        }

    async def _handle_merge_crm(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        text = (ctx.get("document_text") or ctx.get("html_content") or message or "")
        placeholders = self._extract_plain_placeholders(text)
        merge_fields_found: List[Dict[str, Any]] = []
        merge_validation: Dict[str, Any] = {}
        suggestions = []

        if self.merge_fields:
            merge_fields_found = self.merge_fields.extract_merge_fields(text)
            merge_validation = self.merge_fields.validate_merge_fields(
                text=text,
                available_objects=ctx.get("available_crm_objects", ["lead", "contact", "account", "opportunity", "deal"]),
            )

        suggestions.extend(self._suggest_merge_mappings(placeholders, ctx))

        return {
            "success": True,
            "stage": "merge_crm",
            "response": "Merge field and CRM analysis generated.",
            "merge_fields_found": merge_fields_found,
            "placeholder_candidates": placeholders,
            "merge_validation": merge_validation,
            "crm_mapping_suggestions": suggestions,
            "recommended_user_input_fields": self._recommended_user_input_fields(placeholders),
            "converted_placeholder_examples": self._placeholder_conversion_examples(placeholders),
        }

    async def _handle_validation(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        base_result = await self.cluebot.validate_template_ai(template_data=ctx.get("template_data", {}))
        if not base_result.get("success"):
            return base_result

        enriched = []
        for s in base_result.get("suggestions", []):
            enriched.append({
                "severity": s.get("severity", "warning"),
                "issue_type": s.get("category", "Completeness"),
                "location": "document",
                "explanation": s.get("message", ""),
                "suggested_fix": "Review and revise the referenced section.",
                "one_click_fix": {"supported": False, "reason": "Manual confirmation required."},
            })

        return {
            "success": True,
            "stage": "validation",
            "positioning_note": "AI validation / risk review only. Not guaranteed legal advice.",
            "score": base_result.get("score", 0),
            "summary": base_result.get("summary", ""),
            "issues": enriched,
        }

    async def _handle_send_flow(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        email = await self.cluebot.generate_email(
            template_name=ctx.get("template_name", "Untitled Template"),
            recipient_name=ctx.get("recipient_name", ""),
            document_url=ctx.get("document_url", ""),
            custom_prompt=ctx.get("custom_prompt", message),
        )
        if not email.get("success"):
            return email

        brand_url = ctx.get("brand_url", "")
        branding = self._brand_suggestions_from_url(brand_url)
        return {
            "success": True,
            "stage": "send_flow",
            "response": "Email draft prepared.",
            "email": email,
            "branding_suggestions": branding,
            "recipient_wording_suggestions": self._recipient_wording_suggestions(ctx),
            "missing_inputs": self._missing_send_inputs(ctx),
        }

    async def _handle_troubleshoot(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        checks = [
            {"name": "gemini_api_key", "status": bool(self.cluebot.api_key), "hint": "Set GEMINI_API_KEY in environment."},
            {"name": "stage_context_present", "status": bool(ctx), "hint": "Pass stage-specific context for better responses."},
            {"name": "content_blocks_for_editor", "status": bool(ctx.get("content_blocks", [])), "hint": "Provide content_blocks for clause editing."},
            {"name": "template_data_for_validation", "status": bool(ctx.get("template_data")), "hint": "Provide template_data for structured validation."},
        ]
        return {
            "success": True,
            "stage": "troubleshoot",
            "response": "Troubleshooting checklist generated.",
            "reported_issue": message,
            "checks": checks,
        }

    def _guided_creation_questions(self, message: str, ctx: Dict[str, Any]) -> List[str]:
        questions = []
        combined = f"{message} {ctx}".lower()
        if "document_type" not in ctx and not any(k in combined for k in ["nda", "msa", "proposal", "consulting"]):
            questions.append("What type of document is this?")
        if "parties" not in ctx:
            questions.append("Who are the parties?")
        if "jurisdiction" not in ctx:
            questions.append("Which country or jurisdiction should the template target?")
        if "one-way" not in combined and "mutual" not in combined:
            questions.append("Is this one-way or mutual?")
        questions.append("Should payment terms, confidentiality, term/termination, liability, and governing law be included?")
        questions.append("Should this be editable for future CRM merge-field usage?")
        return questions

    def _suggest_initial_structure(self, message: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
        sections = [
            "Parties",
            "Purpose",
            "Definitions",
            "Commercial Terms",
            "Confidentiality",
            "Term and Termination",
            "Liability and Indemnity",
            "Governing Law",
            "Signatures",
        ]
        if "proposal" in message.lower():
            sections = ["Overview", "Scope", "Pricing", "Timeline", "Assumptions", "Acceptance", "Signatures"]
        return {"sections": sections, "editable": True}

    def _looks_like_creation_request(self, message: str) -> bool:
        m = (message or "").lower()
        return any(k in m for k in ["create", "draft", "generate", "template", "agreement", "nda", "proposal"])

    def _detect_edit_mode(self, message: str) -> str:
        m = (message or "").lower()
        if "replace" in m:
            return "replace"
        if "insert" in m or "add" in m:
            return "insert"
        if "remove" in m or "delete" in m:
            return "remove"
        if "rewrite" in m or "simpl" in m or "formal" in m:
            return "rewrite"
        return "edit"

    def _extract_plain_placeholders(self, text: str) -> List[str]:
        # Examples: [Client Name], [Effective Date]
        return sorted(set(re.findall(r"\[([^\[\]]{2,80})\]", text)))

    def _suggest_merge_mappings(self, placeholders: List[str], ctx: Dict[str, Any]) -> List[Dict[str, str]]:
        mappings = []
        defaults = {
            "client name": "{{account.name}}",
            "company name": "{{account.name}}",
            "contact name": "{{contact.full_name}}",
            "email": "{{contact.email}}",
            "amount": "{{opportunity.amount}}",
            "close date": "{{opportunity.close_date}}",
            "effective date": "{{deal.effective_date}}",
        }
        for ph in placeholders:
            key = ph.lower().strip()
            mapped = ""
            for dk, dv in defaults.items():
                if dk in key:
                    mapped = dv
                    break
            if mapped:
                mappings.append({"placeholder": f"[{ph}]", "suggested_merge_field": mapped})
        return mappings

    def _recommended_user_input_fields(self, placeholders: List[str]) -> List[Dict[str, str]]:
        recommendations = []
        for ph in placeholders:
            k = ph.lower()
            if any(term in k for term in ["signature", "sign", "initial", "date", "checkbox"]):
                recommendations.append({"placeholder": f"[{ph}]", "recommended_input_field": "signature/date/checkbox field"})
        return recommendations

    def _placeholder_conversion_examples(self, placeholders: List[str]) -> List[Dict[str, str]]:
        examples = []
        for ph in placeholders[:5]:
            token = ph.lower().strip().replace(" ", "_")
            examples.append({"from": f"[{ph}]", "to": f"{{{{contact.{token}}}}}"})
        return examples

    def _brand_suggestions_from_url(self, brand_url: str) -> Dict[str, Any]:
        if not brand_url:
            return {
                "detected_brand": None,
                "header_suggestion": "Use company logo on left + template title on right.",
                "footer_suggestion": "Use company legal name, address, support email, and confidentiality notice.",
            }

        parsed = urlparse(brand_url)
        domain = parsed.netloc or brand_url
        brand_name = domain.replace("www.", "").split(".")[0].replace("-", " ").title()
        return {
            "detected_brand": brand_name,
            "header_suggestion": f"{brand_name} logo + tagline in a clean top header.",
            "footer_suggestion": f"{brand_name} legal footer with website ({domain}) and contact details.",
        }

    def _recipient_wording_suggestions(self, ctx: Dict[str, Any]) -> List[str]:
        recipient_name = ctx.get("recipient_name", "there")
        return [
            f"Hi {recipient_name}, please review and sign the document at your convenience.",
            "If you have any questions, reply to this email and our team will help immediately.",
            "Please complete signing before the requested deadline.",
        ]

    def _missing_send_inputs(self, ctx: Dict[str, Any]) -> List[str]:
        missing = []
        for field in ["template_name", "recipient_name", "document_url"]:
            if not ctx.get(field):
                missing.append(field)
        return missing
