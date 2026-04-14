/**
 * Lightning Page Builder Constants
 * Contains all static configuration data for the builder
 */
import { 
  Target, FileText, Activity, List, LayoutGrid, LayoutList, MessageSquare, Star, Square, 
  RectangleHorizontal, Columns, Zap, History, Play
} from 'lucide-react';

// Standard Components for sidebar
export const STANDARD_COMPONENTS = [
  { 
    id: 'actions', 
    name: 'Actions', 
    icon: Zap, 
    description: 'Quick actions for record operations',
  },
  { 
    id: 'flow', 
    name: 'Flow', 
    icon: Play, 
    description: 'Embed Screen Flow on record page',
  },
  { 
    id: 'path', 
    name: 'Path', 
    icon: Target, 
    description: 'Show record progress stages',
  },
  { 
    id: 'record_detail', 
    name: 'Record Detail', 
    icon: FileText, 
    description: 'Display record fields',
  },
  { 
    id: 'activities', 
    name: 'Activities', 
    icon: Activity, 
    description: 'Task, Event, Call actions',
  },
  { 
    id: 'related_lists', 
    name: 'Related Lists', 
    icon: List, 
    description: 'Contacts, Opportunities, Events',
  },
  { 
    id: 'related_list_quick_links', 
    name: 'Related List Quick Links', 
    icon: LayoutGrid, 
    description: 'Quick links to related objects',
  },
  { 
    id: 'tabs', 
    name: 'Tabs', 
    icon: LayoutList, 
    description: 'Tab container with up to 5 tabs',
  },
  { 
    id: 'chatter', 
    name: 'Chatter', 
    icon: MessageSquare, 
    description: 'Chatter feed and posts',
  },
  { 
    id: 'highlights_panel', 
    name: 'Highlights Panel', 
    icon: Star, 
    description: 'Key record information',
  },
  { 
    id: 'audit_trail', 
    name: 'Audit Trail', 
    icon: History, 
    description: 'Track record change history',
  },
];

// Field Components for Fields tab (like Salesforce)
export const FIELD_COMPONENTS = [
  {
    id: 'blank_space',
    name: 'Blank Space',
    icon: Square,
    description: 'Add empty space for visual separation',
    category: 'field_component'
  },
  {
    id: 'dynamic_highlights_panel',
    name: 'Dynamic Highlights Panel',
    icon: Star,
    description: 'Display key field information prominently',
    category: 'field_component'
  },
  {
    id: 'field_section',
    name: 'Field Section',
    icon: LayoutGrid,
    description: 'Group related fields into sections',
    category: 'field_component'
  }
];

// Object-specific field definitions
export const OBJECT_FIELDS = {
  lead: [
    { key: 'first_name', label: 'First Name', type: 'text', required: false },
    { key: 'last_name', label: 'Last Name', type: 'text', required: false },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'phone', required: false },
    { key: 'company', label: 'Company', type: 'text', required: false },
    { key: 'title', label: 'Title', type: 'text', required: false },
    { key: 'website', label: 'Website', type: 'url', required: false },
    { key: 'status', label: 'Status', type: 'picklist', required: false },
    { key: 'lead_source', label: 'Lead Source', type: 'picklist', required: false },
    { key: 'industry', label: 'Industry', type: 'picklist', required: false },
    { key: 'rating', label: 'Rating', type: 'picklist', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
    { key: 'address', label: 'Address', type: 'text', required: false },
    { key: 'city', label: 'City', type: 'text', required: false },
    { key: 'state', label: 'State/Province', type: 'text', required: false },
    { key: 'country', label: 'Country', type: 'text', required: false },
  ],
  contact: [
    { key: 'first_name', label: 'First Name', type: 'text', required: false },
    { key: 'last_name', label: 'Last Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: false },
    { key: 'phone', label: 'Phone', type: 'phone', required: false },
    { key: 'mobile', label: 'Mobile', type: 'phone', required: false },
    { key: 'title', label: 'Title', type: 'text', required: false },
    { key: 'department', label: 'Department', type: 'text', required: false },
    { key: 'account_id', label: 'Account', type: 'lookup', required: false },
    { key: 'mailing_address', label: 'Mailing Address', type: 'text', required: false },
    { key: 'mailing_city', label: 'Mailing City', type: 'text', required: false },
    { key: 'mailing_state', label: 'Mailing State', type: 'text', required: false },
    { key: 'mailing_country', label: 'Mailing Country', type: 'text', required: false },
    { key: 'birthdate', label: 'Birthdate', type: 'date', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
  ],
  account: [
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'phone', required: false },
    { key: 'fax', label: 'Fax', type: 'phone', required: false },
    { key: 'website', label: 'Website', type: 'url', required: false },
    { key: 'industry', label: 'Industry', type: 'picklist', required: false },
    { key: 'type', label: 'Type', type: 'picklist', required: false },
    { key: 'annual_revenue', label: 'Annual Revenue', type: 'currency', required: false },
    { key: 'employees', label: 'Employees', type: 'number', required: false },
    { key: 'billing_address', label: 'Billing Address', type: 'text', required: false },
    { key: 'billing_city', label: 'Billing City', type: 'text', required: false },
    { key: 'billing_state', label: 'Billing State', type: 'text', required: false },
    { key: 'billing_country', label: 'Billing Country', type: 'text', required: false },
    { key: 'shipping_address', label: 'Shipping Address', type: 'text', required: false },
    { key: 'shipping_city', label: 'Shipping City', type: 'text', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
  ],
  opportunity: [
    { key: 'name', label: 'Opportunity Name', type: 'text', required: true },
    { key: 'account_id', label: 'Account', type: 'lookup', required: false },
    { key: 'amount', label: 'Amount', type: 'currency', required: false },
    { key: 'close_date', label: 'Close Date', type: 'date', required: true },
    { key: 'stage', label: 'Stage', type: 'picklist', required: true },
    { key: 'probability', label: 'Probability (%)', type: 'number', required: false },
    { key: 'type', label: 'Type', type: 'picklist', required: false },
    { key: 'lead_source', label: 'Lead Source', type: 'picklist', required: false },
    { key: 'next_step', label: 'Next Step', type: 'text', required: false },
    { key: 'campaign_id', label: 'Primary Campaign', type: 'lookup', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
  ],
  event: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'location', label: 'Location', type: 'text', required: false },
    { key: 'start_date', label: 'Start Date/Time', type: 'datetime', required: true },
    { key: 'end_date', label: 'End Date/Time', type: 'datetime', required: true },
    { key: 'all_day', label: 'All Day Event', type: 'checkbox', required: false },
    { key: 'related_to', label: 'Related To', type: 'lookup', required: false },
    { key: 'assigned_to', label: 'Assigned To', type: 'lookup', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
    { key: 'show_time_as', label: 'Show Time As', type: 'picklist', required: false },
    { key: 'reminder', label: 'Reminder', type: 'checkbox', required: false },
    { key: 'reminder_time', label: 'Reminder Time', type: 'picklist', required: false },
  ],
  task: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'due_date', label: 'Due Date', type: 'date', required: false },
    { key: 'status', label: 'Status', type: 'picklist', required: false },
    { key: 'priority', label: 'Priority', type: 'picklist', required: false },
    { key: 'related_to', label: 'Related To', type: 'lookup', required: false },
    { key: 'assigned_to', label: 'Assigned To', type: 'lookup', required: false },
    { key: 'description', label: 'Comments', type: 'textarea', required: false },
    { key: 'reminder', label: 'Reminder', type: 'checkbox', required: false },
    { key: 'reminder_date', label: 'Reminder Date', type: 'datetime', required: false },
  ],
};

// Default fields for any unknown object
export const DEFAULT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: false },
  { key: 'description', label: 'Description', type: 'textarea', required: false },
  { key: 'status', label: 'Status', type: 'picklist', required: false },
  { key: 'owner', label: 'Owner', type: 'lookup', required: false },
  { key: 'created_at', label: 'Created Date', type: 'datetime', required: false },
  { key: 'updated_at', label: 'Last Modified Date', type: 'datetime', required: false },
];

// Related Objects Configuration - defines which objects are related to each object type
export const RELATED_OBJECTS = {
  lead: [
    { id: 'contacts', name: 'Contacts', icon: 'Users', columns: ['name', 'title', 'email'] },
    { id: 'accounts', name: 'Accounts', icon: 'Building', columns: ['name', 'industry', 'phone'] },
    { id: 'opportunities', name: 'Opportunities', icon: 'TrendingUp', columns: ['name', 'stage', 'amount'] },
    { id: 'events', name: 'Events', icon: 'Calendar', columns: ['subject', 'date', 'time'] },
    { id: 'tasks', name: 'Tasks', icon: 'CheckSquare', columns: ['subject', 'status', 'due_date'] },
    { id: 'invoices', name: 'Invoices', icon: 'FileText', columns: ['invoice_number', 'amount', 'status'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
    { id: 'campaign_history', name: 'Campaign History', icon: 'Target', columns: ['campaign', 'status', 'date'] },
  ],
  contact: [
    { id: 'accounts', name: 'Accounts', icon: 'Building', columns: ['name', 'industry', 'phone'] },
    { id: 'opportunities', name: 'Opportunities', icon: 'TrendingUp', columns: ['name', 'stage', 'amount'] },
    { id: 'cases', name: 'Cases', icon: 'Briefcase', columns: ['case_number', 'subject', 'status'] },
    { id: 'events', name: 'Events', icon: 'Calendar', columns: ['subject', 'date', 'time'] },
    { id: 'tasks', name: 'Tasks', icon: 'CheckSquare', columns: ['subject', 'status', 'due_date'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
    { id: 'campaign_history', name: 'Campaign History', icon: 'Target', columns: ['campaign', 'status', 'date'] },
  ],
  account: [
    { id: 'contacts', name: 'Contacts', icon: 'Users', columns: ['name', 'title', 'email'] },
    { id: 'opportunities', name: 'Opportunities', icon: 'TrendingUp', columns: ['name', 'stage', 'amount'] },
    { id: 'cases', name: 'Cases', icon: 'Briefcase', columns: ['case_number', 'subject', 'status'] },
    { id: 'contracts', name: 'Contracts', icon: 'FileText', columns: ['contract_number', 'status', 'value'] },
    { id: 'events', name: 'Events', icon: 'Calendar', columns: ['subject', 'date', 'time'] },
    { id: 'tasks', name: 'Tasks', icon: 'CheckSquare', columns: ['subject', 'status', 'due_date'] },
    { id: 'invoices', name: 'Invoices', icon: 'FileText', columns: ['invoice_number', 'amount', 'status'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
  ],
  opportunity: [
    { id: 'contacts', name: 'Contact Roles', icon: 'Users', columns: ['name', 'role', 'email'] },
    { id: 'products', name: 'Products', icon: 'Package', columns: ['product', 'quantity', 'price'] },
    { id: 'quotes', name: 'Quotes', icon: 'FileText', columns: ['quote_number', 'status', 'amount'] },
    { id: 'events', name: 'Events', icon: 'Calendar', columns: ['subject', 'date', 'time'] },
    { id: 'tasks', name: 'Tasks', icon: 'CheckSquare', columns: ['subject', 'status', 'due_date'] },
    { id: 'competitors', name: 'Competitors', icon: 'Flag', columns: ['competitor', 'strengths', 'weaknesses'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
  ],
  event: [
    { id: 'attendees', name: 'Attendees', icon: 'Users', columns: ['name', 'email', 'status'] },
    { id: 'related_records', name: 'Related Records', icon: 'Link', columns: ['name', 'type', 'relationship'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
  ],
  task: [
    { id: 'related_records', name: 'Related Records', icon: 'Link', columns: ['name', 'type', 'relationship'] },
    { id: 'notes', name: 'Notes & Attachments', icon: 'Paperclip', columns: ['title', 'created_date', 'owner'] },
  ],
};

// Layout Templates for Fields tab
export const LAYOUT_TEMPLATES = [
  {
    id: 'header_only',
    name: 'Header Only',
    icon: RectangleHorizontal,
    regions: ['header'],
    preview: (
      <div className="flex flex-col gap-1 h-12">
        <div className="flex-1 bg-blue-200 rounded"></div>
      </div>
    )
  },
  {
    id: 'two_column',
    name: 'Two Column',
    icon: Columns,
    regions: ['left', 'main'],
    preview: (
      <div className="flex gap-1 h-12">
        <div className="flex-1 bg-slate-200 rounded"></div>
        <div className="flex-[2] bg-blue-200 rounded"></div>
      </div>
    )
  },
  {
    id: 'two_column_header',
    name: 'Two Column + Header',
    icon: LayoutGrid,
    regions: ['header', 'left', 'main'],
    preview: (
      <div className="flex flex-col gap-1 h-16">
        <div className="h-4 bg-green-200 rounded"></div>
        <div className="flex-1 flex gap-1">
          <div className="flex-1 bg-slate-200 rounded"></div>
          <div className="flex-[2] bg-blue-200 rounded"></div>
        </div>
      </div>
    )
  },
  {
    id: 'three_column',
    name: 'Three Column',
    icon: Columns,
    regions: ['left', 'main', 'right'],
    preview: (
      <div className="flex gap-1 h-12">
        <div className="flex-1 bg-slate-200 rounded"></div>
        <div className="flex-[2] bg-blue-200 rounded"></div>
        <div className="flex-1 bg-slate-200 rounded"></div>
      </div>
    )
  },
  {
    id: 'three_column_header',
    name: 'Three Column + Header',
    icon: LayoutGrid,
    regions: ['header', 'left', 'main', 'right'],
    preview: (
      <div className="flex flex-col gap-1 h-16">
        <div className="h-4 bg-green-200 rounded"></div>
        <div className="flex-1 flex gap-1">
          <div className="flex-1 bg-slate-200 rounded"></div>
          <div className="flex-[2] bg-blue-200 rounded"></div>
          <div className="flex-1 bg-slate-200 rounded"></div>
        </div>
      </div>
    )
  },
];
