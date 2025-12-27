# Delivery Chat - Multi-Tenant Chat Service

A modern, scalable chat delivery platform built as a Turborepo monorepo. This service enables companies to embed a customizable chat widget into their websites, allowing end users to communicate with support teams through a beautiful, branded chat interface.

## 🏗️ Architecture Overview

This is a **multi-tenant SaaS platform** where:

- **Companies** (tenants) purchase the chat service and get access to an admin dashboard
- **End users** (visitors) interact with companies through an embeddable chat widget
- Each company operates as an independent tenant with custom domains, branding, and settings
- All data is isolated per company for security and privacy

### Multi-Tenant Model

- Companies are identified by unique subdomains (e.g., `codewiser.deliverychat.com` or custom domain `codewiser.com`)
- Each company has its own admin users who manage visitors and configure chat settings
- Visitors are scoped to specific companies - they can only chat with the company whose widget they're using
- Company settings control widget appearance, business hours, auto-responses, and features

## 📦 Monorepo Structure

This Turborepo contains 4 main applications:

### 1. **@embed** - Embeddable Chat Widget

- **Framework**: React Router v7 with React 19
- **Styling**: Tailwind CSS v4
- **Purpose**: Lightweight, embeddable iframe chat widget that companies can integrate into their websites
- **Features**:
  - Customizable appearance per company (colors, logo, position)
  - Real-time chat interface
  - Visitor identification and session management
  - Responsive design for all devices
- **Port**: 3002

### 2. **@admin** - Admin Dashboard

- **Framework**: TanStack Router (React Start) with React 19
- **Styling**: Tailwind CSS v4
- **Deployment**: Cloudflare Workers (via Wrangler)
- **Purpose**: Admin dashboard where company users manage their chat service
- **Features**:
  - View and manage visitors
  - Configure company settings (widget appearance, business hours, auto-responses)
  - Chat with end users through the support interface
  - Multi-company support (users can belong to multiple companies with different roles)
- **Port**: 3001

### 3. **@hono-api** - Backend API

- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod schemas
- **Purpose**: Core API layer handling all business logic and data operations
- **Features**:
  - RESTful API endpoints
  - Multi-tenant data isolation
  - User authentication and authorization
  - Company and visitor management
  - Company settings CRUD operations
- **Port**: 3000 (default)

### 4. **@landing-page** - Marketing Website

- **Framework**: Astro (static site generator)
- **Purpose**: Public-facing marketing website to attract leads and convert them to customers
- **Key Pages**:
  - **Homepage**: Hero section, features, pricing, testimonials
  - **/register**: Registration page where companies sign up for the service
    - Form fields: Company name, subdomain, admin user details (name, email, password)
    - Submits to `@hono-api` to create company and user records
    - After registration, users can configure their tenant settings

## 🛠️ Tech Stack

### Frontend

- **React 19** - Latest React with concurrent features
- **TypeScript** - Full type safety across all projects
- **Tailwind CSS v4** - Utility-first CSS framework
- **React Router v7** - Modern routing for embed widget
- **TanStack Router** - Type-safe routing for admin dashboard
- **Astro** - Fast, content-focused static site generator for landing page

### Backend

- **Hono** - Ultra-fast web framework (faster than Express)
- **PostgreSQL** - Robust relational database
- **Drizzle ORM** - Type-safe SQL ORM with excellent TypeScript support
- **Zod** - Schema validation and type inference

### Infrastructure & Tools

- **Turborepo** - High-performance monorepo build system
- **Bun** - Fast JavaScript runtime and package manager
- **Cloudflare Workers** - Edge deployment for admin dashboard
- **Vite** - Next-generation frontend build tool
- **Infisical** - Secrets management platform for secure credential storage

### Database Schema

- **users** - Company admin/support users
- **companies** - Tenant companies with subdomain
- **users_companies** - Many-to-many relationship (users can belong to multiple companies)
- **visitors** - End users who interact with chat widgets
- **company_settings** - Per-company configuration (widget config, business hours, features)

## 🚀 Getting Started

### Prerequisites

- **Bun** >= 1.2.20
- **Node.js** >= 18
- **PostgreSQL** database (remote development database provided via Infisical)
- **Infisical CLI** - For secrets management

### Installation

```bash
# Install dependencies
bun install

# Install Infisical CLI (if not already installed)
npm install -g @infisical/cli

# Login to Infisical
infisical login

# When prompted, use project ID: 138b9de2-a089-44ca-a3a2-04047daf0bb5
# Select environment: development
```

### 🔐 Secrets Management

All secrets are managed via **Infisical**. The project uses a single Infisical project with folder-based organization:

- `/hono-api/` - Backend API secrets (DATABASE_URL, etc.)
- `/admin/` - Admin dashboard secrets
- `/web/` - Landing page secrets
- `/widget/` - Widget iframe secrets

**Local Development**: Secrets are automatically injected when running apps via Infisical CLI.

**See**: [`packages/docs/infisical-architecture.md`](packages/docs/infisical-architecture.md) for detailed setup instructions.

### Development

```bash
# Run all apps in development mode
# Secrets are automatically loaded from Infisical
bun run dev

# Run specific app
bun run dev --filter=embed      # Chat widget (port 3002)
bun run dev --filter=admin      # Admin dashboard (port 3001)
bun run dev --filter=hono-api   # API server (port 8000)
bun run dev --filter=landing-page  # Landing page
```

**Note**: The `hono-api` dev script uses Infisical CLI to inject secrets. Ensure you've run `infisical login` and `infisical init` first.

### Database Setup

```bash
# Generate migrations
cd apps/hono-api
bun run db:generate

# Push schema to database
bun run db:push

# Open Drizzle Studio (database GUI)
bun run db:studio
```

## 📋 Project Details for Landing Page Development

### Registration Flow

The `/register` page should:

1. **Collect Company Information**:
   - Company name (required)
   - Subdomain (required, unique identifier)
   - Validation: subdomain must be unique, alphanumeric with hyphens

2. **Collect Admin User Information**:
   - Full name (required)
   - Email (required, unique)
   - Password (required, min 8 characters)

3. **API Integration**:
   - POST request to `@hono-api` endpoint (e.g., `/api/companies/register`)
   - Payload structure:
     ```json
     {
       "company": {
         "name": "Company Name",
         "subdomain": "company-name"
       },
       "user": {
         "name": "Admin Name",
         "email": "admin@company.com",
         "password": "secure-password"
       }
     }
     ```

4. **Post-Registration**:
   - Show success message
   - Redirect to admin dashboard or onboarding flow
   - User can immediately start configuring their tenant settings

### Design Requirements

The landing page should be:

- **Modern & Professional**: Clean, contemporary design that builds trust
- **Conversion-Focused**: Clear CTAs, social proof, feature highlights
- **Responsive**: Mobile-first design that works on all devices
- **Fast**: Optimized performance (Astro's static generation helps here)
- **Accessible**: WCAG compliant, keyboard navigation, screen reader friendly

### Key Sections to Include

1. **Hero Section**: Compelling headline, value proposition, primary CTA
2. **Features**: Highlight key capabilities (customizable widget, multi-tenant, real-time chat)
3. **How It Works**: Simple 3-step process
4. **Pricing**: Clear pricing tiers (if applicable)
5. **Testimonials**: Social proof from existing customers
6. **Register Page**: Clean, user-friendly registration form with validation

## 🔐 Authentication (Future)

**Current State**: Registration creates user records directly in the database. Users authenticate with email/password stored in the `users` table.

**Future Plan**: Integrate **Clerk** for:

- Enhanced authentication (social logins, MFA, passwordless)
- User session management
- Better security and compliance
- Seamless integration with existing user/company structure

## 📚 Documentation

- **Architecture Documentation**: See `packages/docs/visitors-implementation.md`
- **Database Schema**: See `apps/hono-api/src/db/schema/`
- **API Documentation**: TBD (will be generated from Hono routes)

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

## 📄 License

Private - All rights reserved
