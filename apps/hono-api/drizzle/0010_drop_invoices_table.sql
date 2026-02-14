-- Migration: Drop invoices table and enum type
-- This migration safely removes the invoices table and invoice_status enum if they exist

DROP TABLE IF EXISTS "delivery_chat_invoices" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."invoice_status";--> statement-breakpoint
