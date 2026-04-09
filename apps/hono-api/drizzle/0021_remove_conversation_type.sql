DROP INDEX IF EXISTS "delivery_chat_conversations_org_type_idx";
ALTER TABLE "delivery_chat_conversations" DROP COLUMN IF EXISTS "type";
DROP TYPE IF EXISTS "public"."conversation_type";
