"""
Knowledge Retrieval Service
Retrieves relevant information from knowledge sources for RAG
"""
import os
import google.generativeai as genai
from typing import List, Dict, Any, Optional
import re
from .website_scraper_service import WebsiteScraperService

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


class KnowledgeRetrievalService:
    def __init__(self, db):
        self.db = db
        self.model = genai.GenerativeModel("gemini-2.5-flash") if GEMINI_API_KEY else None
        self.scraper = WebsiteScraperService()
    
    async def retrieve_relevant_knowledge(self, bot_id: str, user_query: str, max_sources: int = 3) -> List[Dict[str, Any]]:
        """
        Retrieve relevant knowledge from bot's knowledge sources based on user query
        """
        # Get bot with knowledge sources
        bot = await self.db.chatbots.find_one({"id": bot_id})
        if not bot or not bot.get("knowledge_sources"):
            return []
        
        knowledge_sources = bot.get("knowledge_sources", [])
        relevant_knowledge = []
        
        for source in knowledge_sources:
            if source.get("index_status") != "indexed":
                continue
            
            source_type = source.get("type")
            
            try:
                if source_type == "website":
                    knowledge = await self._retrieve_from_website(source, user_query)
                    if knowledge:
                        relevant_knowledge.append(knowledge)
                
                elif source_type == "faq":
                    knowledge = await self._retrieve_from_faq(source, user_query)
                    if knowledge:
                        relevant_knowledge.append(knowledge)
                
                elif source_type == "crm_object":
                    knowledge = await self._retrieve_from_crm(source, user_query, bot["tenant_id"])
                    if knowledge:
                        relevant_knowledge.append(knowledge)
                
                elif source_type == "file":
                    knowledge = await self._retrieve_from_file(source, user_query)
                    if knowledge:
                        relevant_knowledge.append(knowledge)
            
            except Exception as e:
                print(f"Error retrieving from source {source.get('name')}: {e}")
                continue
        
        return relevant_knowledge[:max_sources]
    
    async def _retrieve_from_website(self, source: Dict, query: str) -> Optional[Dict[str, Any]]:
        """Retrieve information from website source using scraped content"""
        config = source.get("config", {})
        scraped_content = config.get("scraped_content", "")
        url = config.get("url", "")
        title = config.get("title", "")
        
        # If no scraped content, return None
        if not scraped_content:
            print(f"No scraped content found for {url}")
            return None
        
        print(f"Retrieving from website {url}, content length: {len(scraped_content)} chars")
        
        # Extract relevant sections from scraped content based on query
        relevant_content = self.scraper.extract_relevant_sections(
            scraped_content,
            query,
            max_length=1500
        )
        
        if not relevant_content or len(relevant_content) < 50:
            # If no relevant sections found, use first part of content
            relevant_content = scraped_content[:1500]
        
        return {
            "source_name": source.get("name"),
            "source_type": "website",
            "content": relevant_content,
            "url": url,
            "title": title
        }
    
    async def _retrieve_from_faq(self, source: Dict, query: str) -> Optional[Dict[str, Any]]:
        """Retrieve information from FAQ source"""
        faq_content = source.get("config", {}).get("content", "")
        
        if not faq_content:
            print("FAQ: No content found in config")
            return None
        
        print(f"FAQ: Parsing content (length: {len(faq_content)} chars)")
        print(f"FAQ content: {faq_content[:200]}...")  # Show first 200 chars
        
        # Parse FAQ content (Q: or Q. format, A: or A. format)
        qa_pairs = []
        lines = faq_content.split('\n')
        current_q = None
        current_a = None
        
        for line in lines:
            line = line.strip()
            
            # Check for question (Q: or Q. or Question:)
            if line.startswith('Q:') or line.startswith('Q.') or line.startswith('Question:'):
                # Save previous Q&A if exists
                if current_q and current_a:
                    qa_pairs.append({"question": current_q, "answer": current_a})
                
                # Extract question text
                if ':' in line:
                    current_q = line.split(':', 1)[1].strip()
                elif '.' in line:
                    current_q = line.split('.', 1)[1].strip()
                current_a = None
                
            # Check for answer (A: or A. or Answer:)
            elif line.startswith('A:') or line.startswith('A.') or line.startswith('Answer:'):
                if ':' in line:
                    current_a = line.split(':', 1)[1].strip()
                elif '.' in line:
                    current_a = line.split('.', 1)[1].strip()
        
        # Don't forget the last Q&A pair
        if current_q and current_a:
            qa_pairs.append({"question": current_q, "answer": current_a})
        
        print(f"FAQ: Parsed {len(qa_pairs)} Q&A pairs")
        for idx, qa in enumerate(qa_pairs[:3]):  # Show first 3
            print(f"  {idx+1}. Q: {qa['question'][:50]}... A: {qa['answer'][:50]}...")
        
        # Find most relevant Q&A
        if not self.model:
            print("FAQ: Using simple keyword matching (no Gemini model)")
            # Simple keyword matching - score based on word overlap
            query_lower = query.lower()
            query_words = set(query_lower.split())
            
            best_match = None
            best_score = 0
            
            for qa in qa_pairs:
                question_lower = qa["question"].lower()
                question_words = set(question_lower.split())
                
                # Calculate overlap score
                overlap = len(query_words.intersection(question_words))
                
                # Also check if query is substring of question or vice versa
                if query_lower in question_lower or question_lower in query_lower:
                    overlap += 5  # Boost for substring match
                
                print(f"FAQ: Question '{qa['question'][:40]}...' score: {overlap}")
                
                if overlap > best_score:
                    best_score = overlap
                    best_match = qa
            
            if best_match and best_score > 0:
                print(f"FAQ: Best match found with score {best_score}: {best_match['question']}")
                return {
                    "source_name": source.get("name"),
                    "source_type": "faq",
                    "content": f"Q: {best_match['question']}\nA: {best_match['answer']}"
                }
            
            print("FAQ: No match found")
            return None
        
        # Use AI to find best match
        print("FAQ: Using Gemini AI matching")
        try:
            faq_list = "\n".join([f"Q: {qa['question']}\nA: {qa['answer']}\n" for qa in qa_pairs[:10]])
            
            prompt = f"""You are helping match user queries to FAQ answers.

FAQs:
{faq_list}

User Query: "{query}"

Instructions:
1. Find the FAQ question that best matches the user's query
2. If there's a good match, return ONLY the Q&A in this exact format:
   Q: [question]
   A: [answer]
3. If no good match exists, return exactly: NONE

Your response:"""

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=200
                )
            )
            
            content = response.text.strip()
            
            print(f"FAQ: AI response: {content[:100]}...")
            
            if "NONE" in content.upper():
                print("FAQ: AI found no match")
                return None
            
            print("FAQ: AI found match")
            return {
                "source_name": source.get("name"),
                "source_type": "faq",
                "content": content
            }
        
        except Exception as e:
            print(f"Error in FAQ AI retrieval: {e}")
            print("FAQ: Falling back to keyword matching due to AI error")
            
            # FALLBACK TO KEYWORD MATCHING IF AI FAILS
            query_lower = query.lower()
            query_words = set(query_lower.split())
            
            best_match = None
            best_score = 0
            
            for qa in qa_pairs:
                question_lower = qa["question"].lower()
                question_words = set(question_lower.split())
                
                # Calculate overlap score
                overlap = len(query_words.intersection(question_words))
                
                # Also check if query is substring of question or vice versa
                if query_lower in question_lower or question_lower in query_lower:
                    overlap += 5
                
                if overlap > best_score:
                    best_score = overlap
                    best_match = qa
            
            if best_match and best_score > 0:
                print(f"FAQ: Fallback found match with score {best_score}: {best_match['question']}")
                return {
                    "source_name": source.get("name"),
                    "source_type": "faq",
                    "content": f"Q: {best_match['question']}\nA: {best_match['answer']}"
                }
            
            print("FAQ: No fallback match found")
            return None
    
    async def _retrieve_from_crm(self, source: Dict, query: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve information from CRM objects with smart search"""
        object_type = source.get("config", {}).get("object_type", "lead")
        
        # Query CRM data
        try:
            # All CRM objects are stored in object_records collection
            collection = self.db.object_records
            
            # Build search query - search in all text fields
            query_words = query.lower().split()
            
            # Get all records for tenant and object type
            print(f"Searching for {object_type} records with tenant_id: {tenant_id}")
            
            all_records = await collection.find({
                "tenant_id": tenant_id,
                "object_name": object_type.lower()  # Filter by object type (lead, account, etc.)
            }).to_list(length=100)
            
            print(f"Found {len(all_records)} {object_type} records in CRM")
            
            if not all_records:
                return {
                    "source_name": source.get("name"),
                    "source_type": "crm_object",
                    "content": f"No {object_type} records found in CRM. Please create some {object_type}s first."
                }
            
            # Score records based on query relevance
            scored_records = []
            for record in all_records:
                score = 0
                # DATA IS IN 'data' KEY, NOT 'fields'!
                fields = record.get("data", {}) or record.get("fields", {})
                
                # Search in all field values
                for field_name, field_value in fields.items():
                    if isinstance(field_value, str):
                        field_lower = field_value.lower()
                        score += sum(1 for word in query_words if word in field_lower)
                        
                        # Boost score for name matches
                        if field_name.lower() in ['name', 'company', 'title', 'email']:
                            score += sum(2 for word in query_words if word in field_lower)
                
                if score > 0 or not query_words:  # Include all if no query
                    scored_records.append((score, record))
            
            # Sort by relevance
            scored_records.sort(reverse=True, key=lambda x: x[0])
            
            if not scored_records:
                # No relevant records, return recent ones
                records_to_show = all_records[:5]
                crm_summary = f"Found {len(all_records)} {object_type} record(s) in total (showing {len(records_to_show)}):\n\n"
            else:
                records_to_show = [r[1] for r in scored_records[:5]]
                crm_summary = f"Found {len(scored_records)} relevant {object_type} record(s) (showing top {len(records_to_show)}):\n\n"
            
            # Format CRM data with all fields
            for idx, record in enumerate(records_to_show, 1):
                # DATA IS IN 'data' KEY, NOT 'fields'!
                fields = record.get("data", {}) or record.get("fields", {})
                
                print(f"Record {idx} extracted fields: {fields}")  # Debug logging
                
                # Get name - combine first_name and last_name
                first_name = fields.get("first_name", "")
                last_name = fields.get("last_name", "")
                
                if first_name or last_name:
                    record_name = f"{first_name} {last_name}".strip()
                else:
                    # Fallback to other identifiers
                    record_name = fields.get("company") or fields.get("email") or f"{object_type} {idx}"
                
                crm_summary += f"{idx}. {record_name}\n"
                
                # Include all fields (don't skip anything to show full data)
                for field_name, field_value in fields.items():
                    if field_value and isinstance(field_value, (str, int, float, bool)):
                        crm_summary += f"   • {field_name}: {field_value}\n"
                
                crm_summary += "\n"
            
            print(f"Retrieved {len(records_to_show)} {object_type} records from CRM")
            
            return {
                "source_name": source.get("name"),
                "source_type": "crm_object",
                "content": crm_summary.strip()
            }
        
        except Exception as e:
            print(f"Error in CRM retrieval: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def _retrieve_from_file(self, source: Dict, query: str) -> Optional[Dict[str, Any]]:
        """Retrieve information from uploaded files using parsed content"""
        config = source.get("config", {})
        parsed_content = config.get("parsed_content", "")
        filename = config.get("filename", "")
        
        # If no parsed content, return error message
        if not parsed_content or "could not be extracted" in parsed_content.lower():
            return {
                "source_name": source.get("name"),
                "source_type": "file",
                "content": f"File {filename} was uploaded but content could not be parsed. Please re-upload or use a different format."
            }
        
        print(f"Retrieving from file {filename}, content length: {len(parsed_content)} chars")
        
        # Extract relevant sections based on query
        from .website_scraper_service import WebsiteScraperService
        scraper = WebsiteScraperService()
        relevant_content = scraper.extract_relevant_sections(
            parsed_content,
            query,
            max_length=1500
        )
        
        if not relevant_content or len(relevant_content) < 50:
            # If no relevant sections found, use first part of content
            relevant_content = parsed_content[:1500]
        
        return {
            "source_name": source.get("name"),
            "source_type": "file",
            "content": relevant_content,
            "filename": filename
        }
