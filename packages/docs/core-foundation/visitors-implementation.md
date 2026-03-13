# Visitors Implementation Guide

## Overview

The visitors system is a core component of our multi-tenant chat service architecture. It enables end users (visitors) to interact with organizations through an embeddable chat widget, while maintaining proper tenant isolation and data organization.

## Architecture

### Database Schema

#### Visitors Table

The `visitors` table tracks end users who interact with the embed chat widget:

- **id** (uuid, primary key) - Unique identifier for each visitor
- **name** (varchar, nullable) - Optional name provided by the visitor
- **application_id** (uuid, foreign key) - Links visitor to the application whose chat widget they're using
- **created_at** (timestamp) - When the visitor record was created
- **updated_at** (timestamp) - Last update timestamp

#### Application Settings

Widget configuration is stored in `applications.settings` (JSONB) — application-level, not a separate table:

- **applications.settings** (jsonb) - Chat widget appearance and behavior (colors, logo, position, font, etc.)
- Each application has its own settings; defaults are merged with per-application overrides
- No separate `company_settings` table — settings live in the `applications` table

### Relationships

```
visitors (many) ──→ applications (one)
applications (many) ──→ organizations (one)
members (many-to-many) ──→ organizations (one)
members (many-to-many) ──→ users (one)
```

## How It Works

### Visitor Creation Flow

1. **End User Accesses Embed Chat**
   - A visitor lands on a customer's website (e.g., codewiser.com)
   - The embed chat widget loads, configured with the application's appId

2. **Application Identification**
   - The embed widget identifies the application using the appId passed to `DeliveryChat.init()`
   - The appId maps to an application record; settings are fetched from `applications.settings`

3. **Visitor Record Creation**
   - When a visitor first interacts with the chat (opens widget, sends message, etc.)
   - A new visitor record is created with:
     - Generated UUID
     - Application ID (from widget appId)
     - Optional name (if provided)
     - Timestamps

4. **Session Management**
   - Visitor records persist across sessions
   - Future interactions can be linked to the same visitor record
   - This enables conversation history and continuity

### Multi-Tenant Architecture

#### Tenant Isolation

Each organization operates as an independent tenant:

- **Subdomain-based routing**: Organizations are identified by their unique subdomain
- **Data isolation**: All visitor records are scoped to a specific application_id
- **Custom configuration**: Each application has its own settings via `applications.settings`

#### Custom Domain Support

The `applications.domain` field serves dual purposes:

- **Development/Testing**: Uses subdomain format (e.g., `codewiser.deliverychat.com`)
- **Production**: Can be configured as custom domain (e.g., `codewiser.com`)
- The domain field uniquely identifies each application regardless of domain format

### Integration with Embed Chat Widget

#### Widget Initialization

```typescript
// Pseudo-code example
const settings = await fetch(`/v1/widget/settings/${appId}`);

// Widget loads with application-specific configuration
loadChatWidget({
  appId, // the same appId used in the settings request
  settings, // from applications.settings
});
```

#### Visitor Identification

When a visitor interacts:

1. Widget checks for existing visitor session/cookie
2. If new visitor, creates visitor record via API
3. Visitor ID is stored in session/cookie for future interactions
4. All chat messages are associated with visitor_id and application_id

### Integration with Admin Dashboard

#### Support Team View

Organization users (admins/support) can:

- View all visitors for their applications
- See visitor information (name, creation date)
- Access conversation history per visitor
- Manage application settings that affect widget behavior

#### Data Flow

```
Visitor (Embed) ──→ API ──→ Database
                              ↓
Admin Dashboard ←── API ←── Database
```

Both embed and admin interact with the same database, but:

- Embed creates/updates visitor records
- Admin views visitor data and manages application settings
- Data is isolated by application_id for security

## Use Cases

### 1. New Visitor Chat

**Scenario**: A first-time visitor opens the chat widget on codewiser.com

1. Widget loads, identifies application by appId
2. Visitor record created with application_id
3. Visitor can start chatting
4. Messages are associated with visitor_id

### 2. Returning Visitor

**Scenario**: Same visitor returns later

1. Widget identifies visitor via stored session/cookie
2. Existing visitor record is retrieved
3. Previous conversation history can be displayed
4. New messages continue the conversation thread

### 3. Application Configuration

**Scenario**: Admin wants to customize widget appearance

1. Admin accesses admin dashboard
2. Updates `applications.settings` for the application
3. Changes are reflected in embed widget for all visitors
4. No visitor records need to be modified

## Security Considerations

### Tenant Isolation

- All queries must filter by application_id (and organization via application)
- Visitors can only be created/accessed within their application context
- API endpoints validate application ownership before data access

### Data Privacy

- Visitor names are optional and provided voluntarily
- No PII beyond name is stored in visitor table
- Application settings are application-specific and not shared

## Future Enhancements

While not in the initial implementation, future considerations include:

- **Chat Messages**: Visitor records will link to conversation threads
- **Visitor Metadata**: Additional fields for tracking (email, phone, custom attributes)
- **Visitor Segmentation**: Grouping visitors for analytics
- **Cross-Company Analytics**: Aggregated insights (while maintaining isolation)

## Database Schema Summary

```sql
-- Visitors table (when implemented)
CREATE TABLE delivery_chat_visitors (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  application_id UUID NOT NULL REFERENCES delivery_chat_applications(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Application settings: stored in applications table (JSONB), not a separate table
-- applications.settings contains: colors, font, position, header, launcher, behavior, etc.
```

## Related Components

- **@widget**: The embeddable chat widget that creates and interacts with visitors
- **@admin**: The admin dashboard for viewing visitors and managing application settings
- **@hono-api**: The API layer that handles visitor CRUD operations and application settings
