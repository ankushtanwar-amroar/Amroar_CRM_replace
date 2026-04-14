import re
import uuid
from typing import List, Dict, Any
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)


class HTMLToBlocksConverter:
    """Convert HTML to block-based structure for visual editing"""
    
    def convert(self, html: str) -> List[Dict[str, Any]]:
        """Convert HTML to blocks"""
        blocks = []
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Try to find the main content area
            body = soup.find('body') or soup
            
            # Process each top-level element
            for element in body.children:
                if hasattr(element, 'name') and element.name:
                    block = self._element_to_block(element)
                    if block:
                        blocks.append(block)
                elif element.string and element.string.strip():
                    # Plain text node
                    blocks.append({
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "content": {
                            "text": element.string.strip(),
                            "html": f"<p>{element.string.strip()}</p>"
                        },
                        "styles": {}
                    })
            
            return blocks if blocks else [self._create_fallback_block(html)]
            
        except Exception as e:
            logger.error(f"HTML conversion error: {str(e)}")
            return [self._create_fallback_block(html)]
    
    def _element_to_block(self, element) -> Dict[str, Any]:
        """Convert a single HTML element to a block"""
        tag = element.name.lower() if element.name else None
        
        if not tag:
            return None
        
        # Text elements
        if tag in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div']:
            text = element.get_text(strip=True)
            if text:
                return {
                    "id": str(uuid.uuid4()),
                    "type": "text",
                    "content": {
                        "text": text,
                        "html": str(element),
                        "tag": tag
                    },
                    "styles": self._extract_styles(element)
                }
        
        # Links/Buttons
        elif tag == 'a':
            href = element.get('href', '')
            text = element.get_text(strip=True)
            
            # Check if it looks like a button
            style = element.get('style', '')
            classes = element.get('class', [])
            is_button = (
                'button' in str(classes).lower() or
                'btn' in str(classes).lower() or
                'background' in style.lower() or
                'padding' in style.lower()
            )
            
            if is_button:
                return {
                    "id": str(uuid.uuid4()),
                    "type": "button",
                    "content": {
                        "text": text,
                        "url": href,
                        "html": str(element)
                    },
                    "styles": self._extract_styles(element)
                }
            else:
                # Regular link within text
                return {
                    "id": str(uuid.uuid4()),
                    "type": "text",
                    "content": {
                        "text": text,
                        "html": str(element)
                    },
                    "styles": {}
                }
        
        # Images
        elif tag == 'img':
            return {
                "id": str(uuid.uuid4()),
                "type": "image",
                "content": {
                    "src": element.get('src', ''),
                    "alt": element.get('alt', ''),
                    "width": element.get('width', ''),
                    "html": str(element)
                },
                "styles": self._extract_styles(element)
            }
        
        # Horizontal rules / Dividers
        elif tag == 'hr':
            return {
                "id": str(uuid.uuid4()),
                "type": "divider",
                "content": {},
                "styles": self._extract_styles(element)
            }
        
        # Tables (common in email templates)
        elif tag == 'table':
            # Check if it's a layout table or content
            inner_text = element.get_text(strip=True)
            if inner_text:
                return {
                    "id": str(uuid.uuid4()),
                    "type": "custom_html",
                    "content": {
                        "html": str(element)
                    },
                    "styles": {}
                }
        
        # Lists
        elif tag in ['ul', 'ol']:
            items = [li.get_text(strip=True) for li in element.find_all('li')]
            return {
                "id": str(uuid.uuid4()),
                "type": "text",
                "content": {
                    "text": '\n'.join(f"• {item}" for item in items),
                    "html": str(element),
                    "list_type": tag
                },
                "styles": {}
            }
        
        # Blockquote
        elif tag == 'blockquote':
            return {
                "id": str(uuid.uuid4()),
                "type": "text",
                "content": {
                    "text": element.get_text(strip=True),
                    "html": str(element),
                    "is_quote": True
                },
                "styles": self._extract_styles(element)
            }
        
        # Container elements - process children
        elif tag in ['center', 'td', 'th', 'tbody', 'tr']:
            inner_html = ''.join(str(child) for child in element.children)
            if inner_html.strip():
                return {
                    "id": str(uuid.uuid4()),
                    "type": "custom_html",
                    "content": {
                        "html": str(element)
                    },
                    "styles": {}
                }
        
        # Fallback for unknown elements with content
        else:
            text = element.get_text(strip=True)
            if text:
                return {
                    "id": str(uuid.uuid4()),
                    "type": "custom_html",
                    "content": {
                        "html": str(element)
                    },
                    "styles": {}
                }
        
        return None
    
    def _extract_styles(self, element) -> Dict[str, Any]:
        """Extract inline styles from element"""
        styles = {}
        style_attr = element.get('style', '')
        
        if style_attr:
            # Parse basic inline styles
            for rule in style_attr.split(';'):
                if ':' in rule:
                    prop, value = rule.split(':', 1)
                    styles[prop.strip()] = value.strip()
        
        # Extract alignment
        align = element.get('align')
        if align:
            styles['text-align'] = align
        
        return styles
    
    def _create_fallback_block(self, html: str) -> Dict[str, Any]:
        """Create a custom HTML block as fallback"""
        return {
            "id": str(uuid.uuid4()),
            "type": "custom_html",
            "content": {
                "html": html
            },
            "styles": {}
        }


class BlocksToHTMLConverter:
    """Convert block-based structure back to HTML"""
    
    def convert(self, blocks: List[Dict[str, Any]]) -> str:
        """Convert blocks to HTML"""
        html_parts = []
        
        for block in blocks:
            block_html = self._block_to_html(block)
            if block_html:
                html_parts.append(block_html)
        
        return '\n'.join(html_parts)
    
    def _block_to_html(self, block: Dict[str, Any]) -> str:
        """Convert a single block to HTML"""
        block_type = block.get('type', '')
        content = block.get('content', {})
        styles = block.get('styles', {})
        
        style_str = '; '.join(f"{k}: {v}" for k, v in styles.items()) if styles else ''
        style_attr = f' style="{style_str}"' if style_str else ''
        
        if block_type == 'text':
            # If we have original HTML, use it
            if 'html' in content:
                return content['html']
            
            tag = content.get('tag', 'p')
            text = content.get('text', '')
            return f'<{tag}{style_attr}>{text}</{tag}>'
        
        elif block_type == 'button':
            if 'html' in content:
                return content['html']
            
            text = content.get('text', 'Click Here')
            url = content.get('url', '#')
            bg_color = styles.get('background-color', '#007bff')
            text_color = styles.get('color', '#ffffff')
            
            return f'''<table cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td style="background-color: {bg_color}; border-radius: 4px; padding: 12px 24px;">
                        <a href="{url}" style="color: {text_color}; text-decoration: none; font-weight: bold;">{text}</a>
                    </td>
                </tr>
            </table>'''
        
        elif block_type == 'image':
            if 'html' in content:
                return content['html']
            
            src = content.get('src', '')
            alt = content.get('alt', '')
            width = content.get('width', 'auto')
            return f'<img src="{src}" alt="{alt}" width="{width}"{style_attr} />'
        
        elif block_type == 'divider':
            return '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />'
        
        elif block_type == 'spacer':
            height = styles.get('height', '20px')
            return f'<div style="height: {height};"></div>'
        
        elif block_type == 'footer':
            text = content.get('text', '')
            return f'<footer style="font-size: 12px; color: #666; text-align: center; margin-top: 30px;">{text}</footer>'
        
        elif block_type == 'signature':
            name = content.get('name', '')
            title = content.get('title', '')
            company = content.get('company', '')
            return f'''<div style="margin-top: 20px;">
                <p style="margin: 0; font-weight: bold;">{name}</p>
                <p style="margin: 0; color: #666;">{title}</p>
                <p style="margin: 0; color: #666;">{company}</p>
            </div>'''
        
        elif block_type == 'custom_html':
            return content.get('html', '')
        
        return ''


html_to_blocks = HTMLToBlocksConverter()
blocks_to_html = BlocksToHTMLConverter()
