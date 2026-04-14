# Lightning Page Builder Module

## Overview
A Salesforce-style Lightning Page Builder for customizing CRM record detail page layouts through an intuitive drag-and-drop interface.

## Directory Structure

```
/app/frontend/src/crm_platform/lightning_builder/
├── components/
│   ├── LightningPageBuilder.js      # Main builder interface
│   ├── ComponentLibrary.js          # Draggable component palette
│   ├── DropZone.js                  # Drop zones for regions
│   ├── ComponentPropertyEditor.js   # Component configuration modal
│   └── LayoutRenderer.js            # Dynamic layout renderer
├── pages/
│   └── LightningPageBuilderPage.js  # Route-based page wrapper
├── services/
│   └── lightningLayoutService.js    # API client for layouts
└── index.js                         # Module exports
```

## Accessing the Lightning Page Builder

### Via Header Settings (Recommended)
1. Navigate to **CRM Console** → `/crm-platform`
2. Open any object (Leads, Contacts, Accounts, etc.)
3. Click on a **record detail page**
4. Click the **Settings (gear icon)** in the header
5. Select **"Edit Page"** from the dropdown

This will navigate to:
```
/crm-platform/lightning-builder?object=<objectName>
```

### Direct URL Access
```
/crm-platform/lightning-builder?object=lead
/crm-platform/lightning-builder?object=contact
/crm-platform/lightning-builder?object=account
```

## Components

### 1. LightningPageBuilderPage (Route Component)
**Location**: `pages/LightningPageBuilderPage.js`

Route-based wrapper that:
- Extracts `object` query parameter
- Renders the Lightning Page Builder
- Handles navigation back to CRM Console

**Props**: None (uses URL query parameters)

---

### 2. LightningPageBuilder (Main Builder)
**Location**: `components/LightningPageBuilder.js`

Full-screen interface with:
- **Builder Mode**: Drag-and-drop interface
- **Preview Mode**: Live preview of layout
- Component management (add, edit, remove, visibility)
- Save/Update functionality

**Props**:
- `objectName` (string): Object API name (e.g., 'lead', 'contact')
- `onClose` (function): Callback when user closes builder
- `onSave` (function): Callback when layout is saved

**State Management**:
- `layout`: Current layout configuration
- `regions`: Array of layout regions (left, main, right)
- `selectedComponent`: Component being edited
- `activeTab`: 'builder' or 'preview'

---

### 3. ComponentLibrary
**Location**: `components/ComponentLibrary.js`

Draggable component palette organized by category:

**Field Components**:
- Text Field
- Email Field
- Phone Field
- Date Field

**Related Lists**:
- Tasks
- Notes

**Other**:
- Activity Timeline
- Custom HTML

**Drag Implementation**:
Uses `react-dnd` with HTML5 backend for drag-and-drop.

---

### 4. DropZone
**Location**: `components/DropZone.js`

Drop zones for three regions:
- **Left Sidebar** (width: w-64)
- **Main Content** (width: flex-1)
- **Right Sidebar** (width: w-80)

**Features**:
- Visual feedback during drag
- Component action buttons (edit, hide/show, remove)
- Empty state placeholder

---

### 5. ComponentPropertyEditor
**Location**: `components/ComponentPropertyEditor.js`

Modal for editing component properties:

**Common Properties**:
- Display Label
- Show Label toggle
- Field Name (for field components)
- Allow Inline Editing

**Conditional Visibility**:
- Visibility Field: Field to check
- Operator: equals, not_equals, contains, is_empty, is_not_empty
- Value: Comparison value

---

### 6. LayoutRenderer
**Location**: `components/LayoutRenderer.js`

Dynamically renders pages based on saved JSON layouts:

**Features**:
- Interprets layout JSON
- Renders components in correct regions
- Evaluates conditional visibility rules
- Supports inline field editing
- Falls back to default layout if none exists

**Props**:
- `layout` (object): Layout JSON configuration
- `record` (object): Current record data
- `objectInfo` (object): Object metadata
- `onRecordUpdate` (function): Callback when record is updated

---

### 7. lightningLayoutService
**Location**: `services/lightningLayoutService.js`

API client for layout operations:

```javascript
// Get layout for object
getLayoutForObject(objectName, token)

// Create new layout
createLayout(layoutData, token)

// Update existing layout
updateLayout(layoutId, updateData, token)

// Delete layout
deleteLayout(layoutId, token)

// List all layouts
listLayouts(objectName, token)

// Get template
getTemplate(templateType, objectName)
```

## Integration with CRM Console

### SalesConsoleHeader
**Modified**: `/app/frontend/src/crm_platform/components/SalesConsoleHeader.js`

Added props:
- `isRecordView`: Boolean indicating if on record detail page
- `onEditPage`: Callback to handle "Edit Page" click

Settings dropdown now shows "Edit Page" option when `isRecordView === true`.

---

### SalesConsolePageNew
**Modified**: `/app/frontend/src/crm_platform/pages/SalesConsolePageNew.js`

Changes:
- Removed modal-based Lightning Page Builder
- Added `handleEditPage` function that navigates to `/crm-platform/lightning-builder?object=<objectName>`
- Passes `isRecordView` and `onEditPage` props to SalesConsoleHeader

---

### DynamicRecordView
**Modified**: `/app/frontend/src/crm_platform/components/DynamicRecordView.js`

Changes:
- Imports `LayoutRenderer` and `lightningLayoutService`
- Fetches custom layout on component mount
- Conditionally renders:
  - **Custom Layout**: If `hasCustomLayout === true`
  - **Default Layout**: If no custom layout exists

---

## Routing

### App.js
**Added Route**:
```jsx
<Route path="/crm-platform/lightning-builder" element={
  <ProtectedRoute>
    <LightningPageBuilderPage />
  </ProtectedRoute>
} />
```

## Layout JSON Structure

### Full Layout Object
```json
{
  "id": "uuid",
  "tenant_id": "tenant_id",
  "object_name": "lead",
  "layout_name": "Lead Layout",
  "template_type": "three_column",
  "regions": [
    {
      "id": "left",
      "name": "Left Sidebar",
      "width": "w-64",
      "order": 0,
      "components": [
        {
          "id": "field-email-123456",
          "type": "field",
          "label": "Email",
          "field_name": "email",
          "order": 0,
          "visible": true,
          "properties": {
            "showLabel": true,
            "isEditable": true,
            "fieldType": "email"
          }
        }
      ]
    },
    {
      "id": "main",
      "name": "Main Content",
      "width": "flex-1",
      "order": 1,
      "components": []
    },
    {
      "id": "right",
      "name": "Right Sidebar",
      "width": "w-80",
      "order": 2,
      "components": []
    }
  ],
  "is_active": true,
  "created_by": "user_id",
  "updated_by": "user_id",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

### Component Types

#### Field Component
```json
{
  "id": "unique-id",
  "type": "field",
  "label": "Email Address",
  "field_name": "email",
  "order": 0,
  "visible": true,
  "properties": {
    "showLabel": true,
    "isEditable": true,
    "fieldType": "email",
    "visibilityField": "status",
    "visibilityOperator": "equals",
    "visibilityValue": "Active"
  }
}
```

#### Related List Component
```json
{
  "id": "unique-id",
  "type": "related_list",
  "label": "Tasks",
  "order": 0,
  "visible": true,
  "properties": {
    "relatedObject": "task",
    "title": "Related Tasks",
    "showNewButton": true
  }
}
```

#### Activity Component
```json
{
  "id": "unique-id",
  "type": "activity",
  "label": "Activity Timeline",
  "order": 0,
  "visible": true,
  "properties": {
    "showFilters": true,
    "limit": 10
  }
}
```

#### Custom HTML Component
```json
{
  "id": "unique-id",
  "type": "custom_html",
  "label": "Custom Section",
  "order": 0,
  "visible": true,
  "properties": {
    "content": "<div class='custom-content'>Hello World</div>"
  }
}
```

## Conditional Visibility

### Operators
- **equals**: Field value exactly matches comparison value
- **not_equals**: Field value does not match comparison value
- **contains**: Field value contains substring
- **is_empty**: Field has no value
- **is_not_empty**: Field has a value

### Example
Show "Opportunities" section only when Lead Status = "Converted":

```json
{
  "properties": {
    "visibilityField": "status",
    "visibilityOperator": "equals",
    "visibilityValue": "Converted"
  }
}
```

## Backend API Endpoints

### Base URL
```
/api/lightning/layouts
```

### Endpoints

#### Create Layout
```http
POST /api/lightning/layouts
Authorization: Bearer <token>
Content-Type: application/json

{
  "object_name": "lead",
  "layout_name": "Lead Layout",
  "template_type": "three_column",
  "regions": [...]
}
```

#### Get Layout by Object
```http
GET /api/lightning/layouts/:object_name
Authorization: Bearer <token>
```

Response:
```json
{
  "layout": {...},
  "has_custom_layout": true
}
```

or

```json
{
  "layout": null,
  "default_template": {...},
  "has_custom_layout": false
}
```

#### Update Layout
```http
PUT /api/lightning/layouts/:layout_id
Authorization: Bearer <token>
Content-Type: application/json

{
  "layout_name": "Updated Layout",
  "regions": [...]
}
```

#### Delete Layout
```http
DELETE /api/lightning/layouts/:layout_id
Authorization: Bearer <token>
```

#### List Layouts
```http
GET /api/lightning/layouts?object_name=lead
Authorization: Bearer <token>
```

## User Flow

### Creating a Custom Layout
1. Open record detail page
2. Click Settings → Edit Page
3. Navigate to Lightning Page Builder
4. Drag components from library to regions
5. Click Settings icon on components to configure
6. Switch to Preview tab to see final layout
7. Click "Save Layout"
8. Navigate back to record page
9. Custom layout is automatically rendered

### Editing Existing Layout
1. Access builder (same as creating)
2. Modify existing components or add new ones
3. Save changes
4. Layout updates immediately on all records of that object

## Dependencies

### NPM Packages
- `react-dnd`: ^16.0.1 - Drag and drop functionality
- `react-dnd-html5-backend`: ^16.0.1 - HTML5 backend for react-dnd
- `react-hot-toast`: ^2.6.0 - Toast notifications
- `lucide-react`: Icons
- `axios`: HTTP client

### Internal Dependencies
- `@/components/ui/*`: Shadcn UI components
- `crm_platform/components/*`: CRM components
- `crm_platform/services/*`: CRM services

## Best Practices

### Performance
- Use `React.memo` for expensive components
- Debounce search and filter operations
- Lazy load component library items

### State Management
- Keep layout state at the builder level
- Pass down only necessary props to children
- Use callbacks to update parent state

### Error Handling
- Validate layout JSON before saving
- Handle API errors gracefully
- Show user-friendly error messages

### Accessibility
- Add ARIA labels to interactive elements
- Ensure keyboard navigation works
- Provide clear focus indicators

## Future Enhancements

- [ ] Additional layout templates (1-column, 2-column)
- [ ] Component drag-reordering between regions
- [ ] Layout versioning and rollback
- [ ] Layout cloning/duplication
- [ ] Role-based layout visibility
- [ ] Mobile-responsive layouts
- [ ] Custom component creation
- [ ] Layout analytics and usage tracking

## Troubleshooting

### Layout Not Saving
- Check browser console for API errors
- Verify authentication token is valid
- Ensure backend service is running

### Components Not Rendering
- Verify component type is supported in LayoutRenderer
- Check conditional visibility rules
- Ensure field names exist in object schema

### Drag and Drop Not Working
- Verify `react-dnd` is properly installed
- Check if HTML5Backend is imported correctly
- Ensure DndProvider wraps the builder

## Testing

### Manual Testing Checklist
- [ ] Navigate to Lightning Page Builder
- [ ] Drag components to each region
- [ ] Edit component properties
- [ ] Test conditional visibility
- [ ] Save layout
- [ ] Verify layout persists after refresh
- [ ] Test inline field editing
- [ ] Test with different object types

### Integration Testing
- [ ] Test with empty layout
- [ ] Test with complex layouts (10+ components)
- [ ] Test with all component types
- [ ] Test visibility rules with different operators
- [ ] Test error handling (network failures)

## Support

For issues or questions:
1. Check this README
2. Review component source code
3. Check backend API documentation
4. Contact development team
