CREATE TABLE "prompt_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"mode" varchar(32) NOT NULL,
	"workflow_type" varchar(64) NOT NULL,
	"prompt" text NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"settings" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_presets_owner_mode_updated_idx" ON "prompt_presets" USING btree ("owner_id","mode","updated_at");--> statement-breakpoint
CREATE INDEX "prompt_presets_owner_updated_idx" ON "prompt_presets" USING btree ("owner_id","updated_at");