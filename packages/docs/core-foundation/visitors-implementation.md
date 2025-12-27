# Visitors Implementation Guide

## Overview

The visitors system is a core component of our multi-tenant chat service architecture. It enables end users (visitors) to interact with companies through an embeddable chat widget, while maintaining proper tenant isolation and data organization.

## Architecture

### Database Schema

#### Visitors Table

The `visitors` table tracks end users who interact with the embed chat widget:

- **id** (uuid, primary key) - Unique identifier for each visitor
- **name** (varchar, nullable) - Optional name provided by the visitor
- **company_id** (uuid, foreign key) - Links visitor to the company whose chat they're using
- **created_at** (timestamp) - When the visitor record was created
- **updated_at** (timestamp) - Last update timestamp

#### Company Settings Table

The `company_settings` table stores per-company configuration for chat widget appearance and behavior:

- **id** (uuid, primary key) - Unique identifier
- **company_id** (uuid, foreign key, unique) - One-to-one relationship with companies
- **widget_config** (jsonb) - Chat widget appearance settings (colors, logo, position, etc.)
- **business_hours** (jsonb, nullable) - Operating hours configuration
- **auto_responses** (jsonb, nullable) - Automated response rules
- **features** (jsonb, nullable) - Enabled/disabled features per company
- **created_at** (timestamp) - Creation timestamp
- **updated_at** (timestamp) - Last update timestamp

### Relationships

```
visitors (many) ──→ companies (one)
company_settings (one) ──→ companies (one)
users_companies (many-to-many) ──→ companies (one)
users_companies (many-to-many) ──→ users (one)
```

## How It Works

### Visitor Creation Flow

1. **End User Accesses Embed Chat**
   - A visitor lands on a company's website (e.g., codewiser.com)
   - The embed chat widget loads, configured with the company's subdomain

2. **Company Identification**
   - The embed widget identifies the company using the subdomain from the URL or configuration
   - The subdomain maps to a company record in the database

3. **Visitor Record Creation**
   - When a visitor first interacts with the chat (opens widget, sends message, etc.)
   - A new visitor record is created with:
     - Generated UUID
     - Company ID (from subdomain lookup)
     - Optional name (if provided)
     - Timestamps

4. **Session Management**
   - Visitor records persist across sessions
   - Future interactions can be linked to the same visitor record
   - This enables conversation history and continuity

### Multi-Tenant Architecture

#### Tenant Isolation

Each company operates as an independent tenant:

- **Subdomain-based routing**: Companies are identified by their unique subdomain
- **Data isolation**: All visitor records are scoped to a specific company_id
- **Custom configuration**: Each company has its own settings via company_settings

#### Custom Domain Support

The `companies.subdomain` field serves dual purposes:

- **Development/Testing**: Uses subdomain format (e.g., `codewiser.deliverychat.com`)
- **Production**: Can be configured as custom domain (e.g., `codewiser.com`)
- The subdomain field uniquely identifies each tenant regardless of domain format

### Integration with Embed Chat Widget

#### Widget Initialization

```typescript
// Pseudo-code example
const company = await getCompanyBySubdomain(subdomain);
const settings = await getCompanySettings(company.id);

// Widget loads with company-specific configuration
loadChatWidget({
  companyId: company.id,
  widgetConfig: settings.widget_config,
  businessHours: settings.business_hours,
});
```

#### Visitor Identification

When a visitor interacts:

1. Widget checks for existing visitor session/cookie
2. If new visitor, creates visitor record via API
3. Visitor ID is stored in session/cookie for future interactions
4. All chat messages are associated with visitor_id and company_id

### Integration with Admin Dashboard

#### Support Team View

Company users (admins/support) can:

- View all visitors for their company
- See visitor information (name, creation date)
- Access conversation history per visitor
- Manage company settings that affect widget behavior

#### Data Flow

```
Visitor (Embed) ──→ API ──→ Database
                              ↓
Admin Dashboard ←── API ←── Database
```

Both embed and admin interact with the same database, but:

- Embed creates/updates visitor records
- Admin views visitor data and manages company settings
- Data is isolated by company_id for security

## Use Cases

### 1. New Visitor Chat

**Scenario**: A first-time visitor opens the chat widget on codewiser.com

1. Widget loads, identifies company by subdomain
2. Visitor record created with company_id = codewiser's ID
3. Visitor can start chatting
4. Messages are associated with visitor_id

### 2. Returning Visitor

**Scenario**: Same visitor returns later

1. Widget identifies visitor via stored session/cookie
2. Existing visitor record is retrieved
3. Previous conversation history can be displayed
4. New messages continue the conversation thread

### 3. Company Configuration

**Scenario**: Company admin wants to customize widget appearance

1. Admin accesses admin dashboard
2. Updates company_settings.widget_config
3. Changes are reflected in embed widget for all visitors
4. No visitor records need to be modified

## Security Considerations

### Tenant Isolation

- All queries must filter by company_id
- Visitors can only be created/accessed within their company context
- API endpoints validate company ownership before data access

### Data Privacy

- Visitor names are optional and provided voluntarily
- No PII beyond name is stored in visitor table
- Company settings are company-specific and not shared

## Future Enhancements

While not in the initial implementation, future considerations include:

- **Chat Messages**: Visitor records will link to conversation threads
- **Visitor Metadata**: Additional fields for tracking (email, phone, custom attributes)
- **Visitor Segmentation**: Grouping visitors for analytics
- **Cross-Company Analytics**: Aggregated insights (while maintaining isolation)

## Database Schema Summary

```sql
-- Visitors table
CREATE TABLE delivery_chat_visitors (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  company_id UUID NOT NULL REFERENCES delivery_chat_companies(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Company Settings table
CREATE TABLE delivery_chat_company_settings (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE REFERENCES delivery_chat_companies(id),
  widget_config JSONB NOT NULL,
  business_hours JSONB,
  auto_responses JSONB,
  features JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Related Components

- **@embed**: The embeddable chat widget that creates and interacts with visitors
- **@admin**: The admin dashboard for viewing visitors and managing company settings
- **@hono-api**: The API layer that handles visitor CRUD operations and company settings management
