CREATE INDEX "user_status_idx" ON "delivery_chat_user" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_user_org_idx" ON "delivery_chat_member" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "delivery_chat_member" USING btree ("organization_id");