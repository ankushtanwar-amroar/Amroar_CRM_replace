"""
Website Scraper Service
Scrapes and indexes website content for knowledge base
"""
import httpx
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
import re


class WebsiteScraperService:
    def __init__(self):
        self.timeout = 30
    
    async def scrape_website(self, url: str) -> Dict[str, Any]:
        """
        Scrape website content and extract text
        
        Returns:
            {
                "success": bool,
                "content": str,  # Extracted text content
                "title": str,
                "meta_description": str,
                "error": str (if failed)
            }
        """
        try:
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            
            # Fetch website content
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; ChatbotCrawler/1.0)'
                })
                response.raise_for_status()
            
            # Parse HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract title
            title = soup.title.string if soup.title else "No title"
            
            # Extract meta description
            meta_desc = ""
            meta_tag = soup.find('meta', attrs={'name': 'description'})
            if meta_tag and meta_tag.get('content'):
                meta_desc = meta_tag['content']
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            
            # Get text content
            text = soup.get_text()
            
            # Clean up text
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            # Limit content size (keep first 5000 chars for MVP)
            if len(text) > 5000:
                text = text[:5000] + "..."
            
            return {
                "success": True,
                "content": text,
                "title": title,
                "meta_description": meta_desc,
                "url": url,
                "char_count": len(text)
            }
        
        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "error": f"HTTP error: {e.response.status_code}"
            }
        except httpx.RequestError as e:
            return {
                "success": False,
                "error": f"Request error: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Scraping error: {str(e)}"
            }
    
    def extract_relevant_sections(self, content: str, query: str, max_length: int = 1000) -> str:
        """
        Extract most relevant sections from content based on query
        Simple keyword-based extraction for MVP
        """
        if not content or not query:
            return content[:max_length] if content else ""
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', content)
        
        # Score sentences based on query keywords
        query_words = set(query.lower().split())
        scored_sentences = []
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:  # Skip very short sentences
                continue
            
            sentence_lower = sentence.lower()
            score = sum(1 for word in query_words if word in sentence_lower)
            
            if score > 0:
                scored_sentences.append((score, sentence))
        
        # Sort by score and take top sentences
        scored_sentences.sort(reverse=True, key=lambda x: x[0])
        
        # Combine top sentences
        result = ""
        for score, sentence in scored_sentences[:5]:  # Top 5 relevant sentences
            result += sentence + ". "
            if len(result) > max_length:
                break
        
        # If no relevant sentences found, return first part of content
        if not result:
            result = content[:max_length]
        
        return result[:max_length]
