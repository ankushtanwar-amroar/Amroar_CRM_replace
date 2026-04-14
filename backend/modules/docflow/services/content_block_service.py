"""
Content Block Service - Converts between HTML and structured content blocks.
Blocks are the canonical editable format for DocFlow templates.
"""
import re
import uuid
import logging
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup, NavigableString, Tag

logger = logging.getLogger(__name__)


def _gen_id() -> str:
    return f"blk_{uuid.uuid4().hex[:8]}"


def html_to_blocks(html: str) -> List[Dict[str, Any]]:
    """Parse HTML string into a flat list of structured content blocks."""
    if not html or not html.strip():
        return []

    soup = BeautifulSoup(html, "html.parser")
    blocks: List[Dict[str, Any]] = []

    # Remove <style>, <script>, <head>, and <title> tags — they shouldn't produce content blocks
    for tag in soup.find_all(["style", "script", "head", "title", "meta", "link"]):
        tag.decompose()

    def process_element(el):
        if isinstance(el, NavigableString):
            text = str(el).strip()
            # Skip empty strings and common HTML boilerplate text from DOCTYPE etc.
            if text and text.lower() not in ("html", "doctype", "<!doctype html>"):
                blocks.append({"id": _gen_id(), "type": "paragraph", "content": text})
            return

        if not isinstance(el, Tag):
            return

        tag_name = el.name.lower()

        # Headings
        if tag_name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(tag_name[1])
            inner = _inner_html(el)
            if inner.strip():
                blocks.append({
                    "id": _gen_id(),
                    "type": "heading",
                    "level": level,
                    "content": inner.strip()
                })
            return

        # Paragraphs
        if tag_name == "p":
            inner = _inner_html(el)
            if inner.strip():
                blocks.append({
                    "id": _gen_id(),
                    "type": "paragraph",
                    "content": inner.strip()
                })
            return

        # Lists (ul / ol)
        if tag_name in ("ul", "ol"):
            items = []
            for li in el.find_all("li", recursive=False):
                items.append(_inner_html(li).strip())
            if items:
                blocks.append({
                    "id": _gen_id(),
                    "type": "list",
                    "ordered": tag_name == "ol",
                    "items": items
                })
            return

        # Tables
        if tag_name == "table":
            blocks.append({
                "id": _gen_id(),
                "type": "table",
                "html": str(el)
            })
            return

        # Horizontal rule
        if tag_name == "hr":
            blocks.append({"id": _gen_id(), "type": "divider"})
            return

        # Images
        if tag_name == "img":
            src = el.get("src", "")
            if src:
                blocks.append({
                    "id": _gen_id(),
                    "type": "image",
                    "src": src,
                    "alt": el.get("alt", ""),
                    "s3_key": el.get("data-s3-key", ""),
                    "style": {"maxWidth": "100%", "display": "block", "margin": "12px auto"},
                    "editable": False,
                })
            return

        # Line breaks at top level
        if tag_name == "br":
            return

        # Div / section / article — recurse into children
        if tag_name in ("div", "section", "article", "main", "body", "html", "head", "header", "footer", "span", "blockquote"):
            for child in el.children:
                process_element(child)
            return

        # Any other tag (strong, em, etc at top level) — treat as paragraph
        inner = _inner_html(el)
        if inner.strip():
            blocks.append({
                "id": _gen_id(),
                "type": "paragraph",
                "content": inner.strip()
            })

    for child in soup.children:
        process_element(child)

    logger.info(f"[ContentBlocks] Parsed HTML into {len(blocks)} blocks")
    return blocks


def blocks_to_html(blocks: List[Dict[str, Any]]) -> str:
    """Convert structured content blocks back to HTML."""
    if not blocks:
        return ""

    parts: List[str] = []

    for block in blocks:
        btype = block.get("type", "paragraph")

        if btype == "heading":
            level = block.get("level", 2)
            level = max(1, min(6, level))
            parts.append(f"<h{level}>{block.get('content', '')}</h{level}>")

        elif btype == "paragraph":
            parts.append(f"<p>{block.get('content', '')}</p>")

        elif btype == "list":
            tag = "ol" if block.get("ordered") else "ul"
            items_html = "".join(f"<li>{item}</li>" for item in block.get("items", []))
            parts.append(f"<{tag}>{items_html}</{tag}>")

        elif btype == "table":
            parts.append(block.get("html", ""))

        elif btype == "divider":
            parts.append("<hr/>")

        elif btype == "image":
            src = block.get("src", "")
            alt = block.get("alt", "")
            s3_key = block.get("s3_key", "")
            parts.append(f'<img src="{src}" alt="{alt}" data-s3-key="{s3_key}" style="max-width:100%;display:block;margin:12px auto;" />')

        else:
            # Fallback
            parts.append(f"<p>{block.get('content', block.get('html', ''))}</p>")

    return "\n".join(parts)


def update_block(blocks: List[Dict[str, Any]], block_id: str, updates: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Update a specific block by ID. Returns the updated list."""
    result = []
    for block in blocks:
        if block["id"] == block_id:
            updated = {**block, **updates}
            # Keep the ID
            updated["id"] = block_id
            result.append(updated)
        else:
            result.append(block)
    return result


def find_block_by_text(blocks: List[Dict[str, Any]], search_text: str) -> Optional[Dict[str, Any]]:
    """Find the first block containing the given text (case-insensitive)."""
    search_lower = search_text.lower().strip()
    for block in blocks:
        content = _block_plain_text(block).lower()
        if search_lower in content:
            return block
    return None


def _block_plain_text(block: Dict[str, Any]) -> str:
    """Extract plain text from a block."""
    btype = block.get("type", "")
    if btype in ("heading", "paragraph"):
        # Strip HTML tags from content
        return re.sub(r"<[^>]+>", "", block.get("content", ""))
    elif btype == "list":
        return " ".join(re.sub(r"<[^>]+>", "", item) for item in block.get("items", []))
    elif btype == "table":
        soup = BeautifulSoup(block.get("html", ""), "html.parser")
        return soup.get_text(" ", strip=True)
    return ""


def _inner_html(tag: Tag) -> str:
    """Get the inner HTML of a tag (preserving child tags)."""
    return "".join(str(child) for child in tag.children)
