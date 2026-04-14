import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';

/**
 * DocumentContentEditor
 * Renders structured content blocks with inline editing and page offset tracking.
 * All documents (AI-generated and uploaded PDF/DOCX) use the same block rendering.
 */

const PAGE_PADDING = 60;

const blockStyles = {
  heading: (level) => ({
    fontSize: level === 1 ? 26 : level === 2 ? 21 : level === 3 ? 17 : 15,
    fontWeight: 'bold',
    marginTop: level === 1 ? 20 : 14,
    marginBottom: 8,
    lineHeight: 1.35,
    color: '#111827',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  }),
  paragraph: {
    fontSize: 14,
    lineHeight: 1.65,
    marginBottom: 10,
    color: '#374151',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  list: {
    fontSize: 14,
    lineHeight: 1.65,
    marginBottom: 10,
    paddingLeft: 28,
    color: '#374151',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #d1d5db',
    margin: '16px 0',
  },
};

/* ── Block Element ─────────────────── */
function BlockElement({ block, isHighlighted, onSave }) {
  const elRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const highlightStyle = isHighlighted
    ? { outline: '2px solid #6366f1', outlineOffset: 2, borderRadius: 3, transition: 'outline 0.3s ease' }
    : {};

  const editStyle = {
    cursor: 'text',
    borderRadius: 3,
    transition: 'background 0.15s, outline 0.15s',
    outline: isFocused ? '2px solid #3b82f6' : '1px solid transparent',
    outlineOffset: isFocused ? 1 : 0,
    background: isFocused ? '#f8faff' : 'transparent',
  };

  const handleFocus = () => setIsFocused(true);

  const handleBlur = () => {
    setIsFocused(false);
    if (!elRef.current || !onSave) return;
    const el = elRef.current;
    if (block.type === 'list') {
      const items = Array.from(el.querySelectorAll('li')).map(li => li.innerHTML);
      onSave(block.id, { ...block, items });
    } else {
      const newContent = el.innerHTML;
      if (newContent !== (block.content || '')) {
        onSave(block.id, { ...block, content: newContent });
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') e.currentTarget.blur();
  };

  if (block.type === 'divider') {
    return <hr data-block-id={block.id} data-testid={`block-${block.id}`} style={blockStyles.divider} />;
  }

  if (block.type === 'image') {
    const imgStyle = block.style || {};
    return (
      <div
        data-block-id={block.id}
        data-testid={`block-${block.id}`}
        style={{
          ...highlightStyle,
          textAlign: imgStyle.textAlign || 'center',
          margin: imgStyle.margin || '12px 0',
        }}
      >
        <img
          src={block.src}
          alt={block.alt || 'Document image'}
          style={{
            maxWidth: imgStyle.maxWidth || '100%',
            width: imgStyle.width || undefined,
            height: imgStyle.height || 'auto',
            display: 'inline-block',
            borderRadius: 2,
          }}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.insertAdjacentHTML('afterend', '<div style="padding:8px;color:#9ca3af;font-size:12px;border:1px dashed #d1d5db;border-radius:4px;text-align:center">Image unavailable</div>');
          }}
        />
      </div>
    );
  }

  if (block.type === 'table') {
    const rows = block.rows || block.content || [];
    return (
      <div data-block-id={block.id} data-testid={`block-${block.id}`} style={{ overflowX: 'auto', marginBottom: 16, ...highlightStyle }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Georgia', serif" }}>
          <tbody>
            {(Array.isArray(rows) ? rows : []).map((row, ri) => (
              <tr key={ri}>
                {(Array.isArray(row) ? row : []).map((cell, ci) => (
                  <td key={ci} style={{ border: '1px solid #d1d5db', padding: '6px 10px' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'list' || block.type === 'list_item') {
    const ListTag = block.listType === 'ol' || block.ordered ? 'ol' : 'ul';
    const items = block.items || [block.content];
    return (
      <ListTag
        ref={elRef}
        data-block-id={block.id}
        data-testid={`block-${block.id}`}
        contentEditable
        suppressContentEditableWarning
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{ ...blockStyles.list, ...(block.style || {}), ...highlightStyle, ...editStyle }}
      >
        {items.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ListTag>
    );
  }

  // heading / subheading / paragraph
  const style = block.type === 'heading'
    ? blockStyles.heading(block.level || 1)
    : block.type === 'subheading'
    ? blockStyles.heading(block.level || 2)
    : blockStyles.paragraph;

  const mergedStyle = { ...style, ...(block.style || {}), ...highlightStyle, ...editStyle };
  if (block.style?.textAlign) mergedStyle.textAlign = block.style.textAlign;

  return (
    <div
      ref={elRef}
      data-block-id={block.id}
      data-testid={`block-${block.id}`}
      contentEditable
      suppressContentEditableWarning
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={mergedStyle}
      dangerouslySetInnerHTML={{ __html: block.content || '' }}
    />
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */
const DocumentContentEditor = React.memo(function DocumentContentEditor({
  contentBlocks = [],
  currentPage = 1,
  onPageCountChange,
  onPageOffsetsChange,
  onTextSelect,
  onBlockChange,
  pageWidth = 800,
  pageHeight = 1100,
  highlightBlockId = null,
  overlayMode = false,
}) {
  const measureRef = useRef(null);
  const containerRef = useRef(null);
  const [pageMap, setPageMap] = useState([]);

  // Separate header/footer (per_page repeat) blocks from body blocks
  const headerBlocks = useMemo(
    () => contentBlocks.filter(b => b.repeat === 'per_page' && b.position === 'header'),
    [contentBlocks]
  );
  const footerBlocks = useMemo(
    () => contentBlocks.filter(b => b.repeat === 'per_page' && b.position === 'footer'),
    [contentBlocks]
  );
  // All non-repeating blocks are body content
  const standardBlocks = useMemo(
    () => contentBlocks.filter(b => b.repeat !== 'per_page'),
    [contentBlocks]
  );

  // Compute page breaks (body blocks only, accounting for header/footer space)
  useEffect(() => {
    if (!standardBlocks.length) {
      setPageMap([]);
      onPageCountChange?.(1);
      onPageOffsetsChange?.([0]);
      return;
    }

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!measureRef.current) return;

        // Reserve space for header and footer on each page
        const headerHeight = headerBlocks.length > 0 ? 80 : 0;
        const footerHeight = footerBlocks.length > 0 ? 60 : 0;
        const contentAreaHeight = pageHeight - PAGE_PADDING * 2 - headerHeight - footerHeight;
        const children = measureRef.current.children;
        const pages = [];
        let currentPageBlockIndices = [];
        let currentHeight = 0;

        for (let i = 0; i < children.length && i < standardBlocks.length; i++) {
          const el = children[i];
          const elHeight = el.offsetHeight + 8;

          if (currentHeight + elHeight > contentAreaHeight && currentPageBlockIndices.length > 0) {
            pages.push([...currentPageBlockIndices]);
            currentPageBlockIndices = [];
            currentHeight = 0;
          }
          currentPageBlockIndices.push(i);
          currentHeight += elHeight;
        }

        if (currentPageBlockIndices.length > 0) {
          pages.push(currentPageBlockIndices);
        }

        if (pages.length === 0) pages.push([]);

        setPageMap(pages);
        onPageCountChange?.(pages.length);

        const offsets = [0];
        for (let i = 0; i < pages.length - 1; i++) {
          offsets.push(offsets[i] + pageHeight);
        }
        onPageOffsetsChange?.(offsets);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [standardBlocks, headerBlocks, footerBlocks, pageHeight, pageWidth, onPageCountChange, onPageOffsetsChange]);

  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return;
    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    if (!text) return;
    let node = sel.anchorNode;
    let blockId = null;
    while (node && node !== containerRef.current) {
      if (node.dataset?.blockId) { blockId = node.dataset.blockId; break; }
      node = node.parentElement;
    }
    onTextSelect(text, blockId);
  }, [onTextSelect]);

  const handleBlockSave = useCallback((blockId, updatedBlock) => {
    if (onBlockChange) onBlockChange(blockId, updatedBlock);
  }, [onBlockChange]);

  if (!contentBlocks.length) {
    return (
      <div
        style={{ width: pageWidth, height: pageHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}
        data-testid="content-editor-empty"
      >
        No editable content. Generate a template with AI or convert an uploaded document.
      </div>
    );
  }

  const isContinuous = currentPage === null || currentPage === undefined;
  const currentPageBlocks = isContinuous
    ? standardBlocks
    : (pageMap[Math.max(0, currentPage - 1)] || []).map(i => standardBlocks[i]).filter(Boolean);

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} data-testid="document-content-editor" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Hidden measurement div — body blocks only */}
      <div
        ref={measureRef} aria-hidden="true"
        style={{ position: 'absolute', visibility: 'hidden', width: pageWidth - PAGE_PADDING * 2, left: -9999, top: 0, pointerEvents: 'none' }}
      >
        {standardBlocks.map((block) => (
          <BlockElement key={block.id} block={block} isHighlighted={false} />
        ))}
      </div>

      {/* Visible content */}
      <div
        data-testid={isContinuous ? 'content-continuous' : `content-page-${currentPage}`}
        style={{ width: pageWidth, minHeight: isContinuous ? 'auto' : pageHeight, padding: PAGE_PADDING, position: 'relative', background: overlayMode ? 'rgba(255,255,255,0.92)' : '#ffffff' }}
      >
        {/* Header blocks — repeated on every page */}
        {headerBlocks.length > 0 && (
          <div data-testid="page-header" style={{ marginBottom: 8, borderBottom: headerBlocks.length > 0 ? '1px solid #eee' : 'none', paddingBottom: 6 }}>
            {headerBlocks.map((block) => (
              <BlockElement key={`hdr-${currentPage}-${block.id}`} block={block} isHighlighted={false} onSave={handleBlockSave} />
            ))}
          </div>
        )}

        {/* Body content blocks */}
        {currentPageBlocks.map((block) => (
          <BlockElement
            key={block.id}
            block={block}
            isHighlighted={block.id === highlightBlockId}
            onSave={handleBlockSave}
          />
        ))}

        {/* Footer blocks — repeated on every page */}
        {footerBlocks.length > 0 && (
          <div data-testid="page-footer" style={{ marginTop: 'auto', borderTop: '1px solid #eee', paddingTop: 6, position: 'absolute', bottom: PAGE_PADDING, left: PAGE_PADDING, right: PAGE_PADDING }}>
            {footerBlocks.map((block) => (
              <BlockElement key={`ftr-${currentPage}-${block.id}`} block={block} isHighlighted={false} onSave={handleBlockSave} />
            ))}
          </div>
        )}

        {!isContinuous && (
          <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 11, color: '#9ca3af', fontFamily: 'sans-serif' }}>
            Page {currentPage} of {pageMap.length || 1}
          </div>
        )}
      </div>
    </div>
  );
});

export default DocumentContentEditor;
