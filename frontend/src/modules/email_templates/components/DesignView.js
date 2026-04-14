import React, { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  Type, Image, Square, Minus, ArrowDownToLine, FileSignature,
  GripVertical, Trash2, Settings, Plus, Code
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardContent } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { v4 as uuidv4 } from 'uuid';

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'button', label: 'Button', icon: Square },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: ArrowDownToLine },
  { type: 'signature', label: 'Signature', icon: FileSignature },
];

function SortableBlock({ block, onUpdate, onDelete, onEdit }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-white border rounded-lg mb-2 hover:border-indigo-300 transition-colors"
    >
      <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
           {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>
      
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
        {block.type !== 'divider' && block.type !== 'spacer' && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(block)}>
            <Settings className="h-3 w-3" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => onDelete(block.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-4 pl-10">
        <BlockContent block={block} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function BlockContent({ block, onUpdate }) {
  const handleTextChange = (e) => {
    onUpdate(block.id, {
      ...block,
      content: { ...block.content, text: e.target.value, html: `<p>${e.target.value}</p>` }
    });
  };

  switch (block.type) {
    case 'text':
      return (
        <Textarea
          value={block.content?.text || ''}
          onChange={handleTextChange}
          placeholder="Enter your text here..."
          className="min-h-[60px] border-0 shadow-none resize-none p-0 focus-visible:ring-0"
        />
      );
    
    case 'button':
      return (
        <div className="flex items-center space-x-2">
          <div
            className="px-6 py-2 rounded text-white text-center font-medium"
            style={{ backgroundColor: block.styles?.['background-color'] || '#4F46E5' }}
          >
            {block.content?.text || 'Click Here'}
          </div>
          <span className="text-xs text-slate-400">→ {block.content?.url || '#'}</span>
        </div>
      );
    
    case 'image':
      return block.content?.src ? (
        <img
          src={block.content.src}
          alt={block.content?.alt || ''}
          className="max-w-full h-auto rounded"
          style={{ maxHeight: '200px' }}
        />
      ) : (
        <div className="h-24 bg-slate-100 rounded flex items-center justify-center text-slate-400">
          <Image className="h-8 w-8" />
        </div>
      );
    
    case 'divider':
      return <hr className="border-t border-slate-200" />;
    
    case 'spacer':
      return (
        <div
          className="bg-slate-50 rounded flex items-center justify-center text-xs text-slate-400"
          style={{ height: block.styles?.height || '20px' }}
        >
          Spacer ({block.styles?.height || '20px'})
        </div>
      );
    
    case 'signature':
      return (
        <div className="text-sm">
          <p className="font-semibold">{block.content?.name || 'Your Name'}</p>
          <p className="text-slate-500">{block.content?.title || 'Your Title'}</p>
          <p className="text-slate-500">{block.content?.company || 'Company Name'}</p>
        </div>
      );
    
    case 'custom_html':
      return (
        <div className="bg-slate-50 p-3 rounded border border-dashed border-slate-300">
          <div className="flex items-center text-xs text-slate-500 mb-2">
            <Code className="h-3 w-3 mr-1" />
            Custom HTML Block
          </div>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: block.content?.html || '' }}
          />
        </div>
      );
    
    default:
      return <div className="text-slate-400 text-sm">Unknown block type</div>;
  }
}

export default function DesignView({ blocks, onChange, emailType, plainTextContent, onPlainTextChange }) {
  const [editingBlock, setEditingBlock] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over?.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over?.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = (type) => {
    const newBlock = {
      id: uuidv4(),
      type,
      content: getDefaultContent(type),
      styles: getDefaultStyles(type),
    };
    onChange([...blocks, newBlock]);
  };

  const updateBlock = (blockId, updatedBlock) => {
    onChange(blocks.map(b => b.id === blockId ? updatedBlock : b));
  };

  const deleteBlock = (blockId) => {
    onChange(blocks.filter(b => b.id !== blockId));
  };

  const getDefaultContent = (type) => {
    switch (type) {
      case 'text': return { text: '', html: '' };
      case 'button': return { text: 'Click Here', url: '#' };
      case 'image': return { src: '', alt: '' };
      case 'signature': return { name: '', title: '', company: '' };
      default: return {};
    }
  };

  const getDefaultStyles = (type) => {
    switch (type) {
      case 'button': return { 'background-color': '#4F46E5', color: '#ffffff' };
      case 'spacer': return { height: '20px' };
      default: return {};
    }
  };

  // Plain text view
  if (emailType === 'plain') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <Label className="mb-2 block">Plain Text Email Content</Label>
            <Textarea
              value={plainTextContent}
              onChange={(e) => onPlainTextChange(e.target.value)}
              placeholder="Enter your plain text email content here...\n\nHi {{FirstName}},\n\nYour message here..."
              className="min-h-[400px] font-mono"
            />
            <p className="text-xs text-slate-500 mt-2">
              Use merge fields like {`{{FirstName}}`}, {`{{Company}}`} for personalization
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar - Block Palette */}
      <div className="w-48 bg-white border-r p-4">
        <Label className="text-xs text-slate-500 mb-3 block">ADD BLOCKS</Label>
        <div className="space-y-2">
          {BLOCK_TYPES.map((bt) => (
            <Button
              key={bt.type}
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => addBlock(bt.type)}
            >
              <bt.icon className="h-4 w-4 mr-2" />
              {bt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Card className="min-h-[500px]">
            <CardContent className="p-6">
              {blocks.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Type className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-sm">Add blocks from the left panel</p>
                  <p className="text-xs mt-1">or paste HTML in Code view</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={blocks.map(b => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {blocks.map((block) => (
                      <SortableBlock
                        key={block.id}
                        block={block}
                        onUpdate={updateBlock}
                        onDelete={deleteBlock}
                        onEdit={setEditingBlock}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Block Edit Dialog */}
      <BlockEditDialog
        block={editingBlock}
        onClose={() => setEditingBlock(null)}
        onSave={(updated) => {
          updateBlock(updated.id, updated);
          setEditingBlock(null);
        }}
      />
    </div>
  );
}

function BlockEditDialog({ block, onClose, onSave }) {
  const [editedBlock, setEditedBlock] = useState(block);

  React.useEffect(() => {
    setEditedBlock(block);
  }, [block]);

  if (!block) return null;

  const updateContent = (key, value) => {
    setEditedBlock({
      ...editedBlock,
      content: { ...editedBlock.content, [key]: value }
    });
  };

  const updateStyle = (key, value) => {
    setEditedBlock({
      ...editedBlock,
      styles: { ...editedBlock.styles, [key]: value }
    });
  };

  return (
    <Dialog open={!!block} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {block?.type?.charAt(0).toUpperCase() + block?.type?.slice(1)} Block</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {block?.type === 'button' && (
            <>
              <div>
                <Label>Button Text</Label>
                <Input
                  value={editedBlock?.content?.text || ''}
                  onChange={(e) => updateContent('text', e.target.value)}
                />
              </div>
              <div>
                <Label>Button URL</Label>
                <Input
                  value={editedBlock?.content?.url || ''}
                  onChange={(e) => updateContent('url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>Background Color</Label>
                <Input
                  type="color"
                  value={editedBlock?.styles?.['background-color'] || '#4F46E5'}
                  onChange={(e) => updateStyle('background-color', e.target.value)}
                  className="h-10 w-20"
                />
              </div>
            </>
          )}

          {block?.type === 'image' && (
            <>
              <div>
                <Label>Image URL</Label>
                <Input
                  value={editedBlock?.content?.src || ''}
                  onChange={(e) => updateContent('src', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>Alt Text</Label>
                <Input
                  value={editedBlock?.content?.alt || ''}
                  onChange={(e) => updateContent('alt', e.target.value)}
                />
              </div>
            </>
          )}

          {block?.type === 'signature' && (
            <>
              <div>
                <Label>Name</Label>
                <Input
                  value={editedBlock?.content?.name || ''}
                  onChange={(e) => updateContent('name', e.target.value)}
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editedBlock?.content?.title || ''}
                  onChange={(e) => updateContent('title', e.target.value)}
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={editedBlock?.content?.company || ''}
                  onChange={(e) => updateContent('company', e.target.value)}
                />
              </div>
            </>
          )}

          {block?.type === 'spacer' && (
            <div>
              <Label>Height</Label>
              <Input
                value={editedBlock?.styles?.height || '20px'}
                onChange={(e) => updateStyle('height', e.target.value)}
                placeholder="e.g., 20px, 2rem"
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(editedBlock)}>Save Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
