CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "renders_project_created_idx" ON "renders" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "renders_project_completed_idx" ON "renders" USING btree ("project_id","completed_at","created_at");--> statement-breakpoint
CREATE INDEX "renders_pollable_video_idx" ON "renders" USING btree ("status","media_type","updated_at") WHERE "renders"."provider_job_id" is not null;--> statement-breakpoint
CREATE INDEX "text_chats_project_updated_idx" ON "text_chats" USING btree ("project_id","updated_at");