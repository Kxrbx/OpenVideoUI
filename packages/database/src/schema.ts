import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);
export const workflowTypeEnum = pgEnum("workflow_type", [
  "text-to-image",
  "text-to-video",
  "image-to-video"
]);
export const renderStatusEnum = pgEnum("render_status", [
  "queued",
  "submitting",
  "processing",
  "completed",
  "failed",
  "canceled"
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt)
  ]
);

export const renders = pgTable(
  "renders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    workflowType: workflowTypeEnum("workflow_type").notNull(),
    status: renderStatusEnum("status").notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    providerJobId: varchar("provider_job_id", { length: 255 }),
    providerGenerationId: varchar("provider_generation_id", { length: 255 }),
    providerPollUrl: text("provider_poll_url"),
    providerStatus: varchar("provider_status", { length: 64 }),
    outputUrls: jsonb("output_urls").$type<string[]>().notNull(),
    providerUsage: jsonb("provider_usage").$type<Record<string, unknown>>(),
    providerRequest: jsonb("provider_request").$type<Record<string, unknown>>(),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
    failureCode: varchar("failure_code", { length: 120 }),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true })
  },
  (table) => [
    index("renders_project_created_idx").on(table.projectId, table.createdAt),
    index("renders_project_completed_idx").on(table.projectId, table.completedAt, table.createdAt),
    index("renders_pollable_video_idx")
      .on(table.status, table.mediaType, table.updatedAt)
      .where(sql`${table.providerJobId} is not null`)
  ]
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const textChats = pgTable(
  "text_chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    messages: jsonb("messages")
      .$type<Array<{ id: string; role: "user" | "assistant"; content: string }>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("text_chats_project_updated_idx").on(table.projectId, table.updatedAt)
  ]
);

export const modelCapabilities = pgTable("model_capabilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: varchar("model_id", { length: 255 }).notNull().unique(),
  providerType: varchar("provider_type", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }),
  canonicalSlug: varchar("canonical_slug", { length: 255 }),
  description: text("description"),
  inputModalities: jsonb("input_modalities").$type<string[]>().notNull(),
  outputModalities: jsonb("output_modalities").$type<string[]>().notNull(),
  supportedAspectRatios: jsonb("supported_aspect_ratios").$type<string[]>().notNull(),
  supportedDurations: jsonb("supported_durations").$type<number[]>().notNull(),
  supportedResolutions: jsonb("supported_resolutions").$type<string[]>().notNull(),
  supportedFrameImages: jsonb("supported_frame_images").$type<string[]>().notNull(),
  allowedPassthroughParameters: jsonb("allowed_passthrough_parameters").$type<string[]>().notNull(),
  generateAudio: boolean("generate_audio"),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull()
});

export const renderInputAssets = pgTable("render_input_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  renderId: uuid("render_id")
    .notNull()
    .references(() => renders.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 64 }).notNull(),
  assetType: varchar("asset_type", { length: 32 }).notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  fileName: varchar("file_name", { length: 255 }),
  mimeType: varchar("mime_type", { length: 128 }),
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const renderOutputAssets = pgTable("render_output_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  renderId: uuid("render_id")
    .notNull()
    .references(() => renders.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  assetType: varchar("asset_type", { length: 32 }).notNull(),
  url: text("url").notNull(),
  storageKey: text("storage_key"),
  mimeType: varchar("mime_type", { length: 128 }),
  position: varchar("position", { length: 32 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const renderEvents = pgTable("render_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  renderId: uuid("render_id")
    .notNull()
    .references(() => renders.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  fromStatus: renderStatusEnum("from_status"),
  toStatus: renderStatusEnum("to_status"),
  providerStatus: varchar("provider_status", { length: 64 }),
  message: text("message"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  sessions: many(sessions)
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id]
  }),
  renders: many(renders),
  textChats: many(textChats)
}));

export const rendersRelations = relations(renders, ({ one, many }) => ({
  project: one(projects, {
    fields: [renders.projectId],
    references: [projects.id]
  }),
  inputAssets: many(renderInputAssets),
  outputAssets: many(renderOutputAssets),
  events: many(renderEvents)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));

export const textChatsRelations = relations(textChats, ({ one }) => ({
  project: one(projects, {
    fields: [textChats.projectId],
    references: [projects.id]
  })
}));

export const renderInputAssetsRelations = relations(renderInputAssets, ({ one }) => ({
  render: one(renders, {
    fields: [renderInputAssets.renderId],
    references: [renders.id]
  })
}));

export const renderOutputAssetsRelations = relations(renderOutputAssets, ({ one }) => ({
  render: one(renders, {
    fields: [renderOutputAssets.renderId],
    references: [renders.id]
  })
}));

export const renderEventsRelations = relations(renderEvents, ({ one }) => ({
  render: one(renders, {
    fields: [renderEvents.renderId],
    references: [renders.id]
  })
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Render = typeof renders.$inferSelect;
export type NewRender = typeof renders.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TextChat = typeof textChats.$inferSelect;
export type NewTextChat = typeof textChats.$inferInsert;
export type ModelCapability = typeof modelCapabilities.$inferSelect;
export type NewModelCapability = typeof modelCapabilities.$inferInsert;
export type RenderInputAsset = typeof renderInputAssets.$inferSelect;
export type NewRenderInputAsset = typeof renderInputAssets.$inferInsert;
export type RenderOutputAsset = typeof renderOutputAssets.$inferSelect;
export type NewRenderOutputAsset = typeof renderOutputAssets.$inferInsert;
export type RenderEvent = typeof renderEvents.$inferSelect;
export type NewRenderEvent = typeof renderEvents.$inferInsert;

export type ProjectWithRenderCount = Project & {
  renderCount: number;
};

export type RenderWithProject = Render & {
  projectTitle: string;
};

export type TextChatWithProject = TextChat & {
  projectTitle: string;
};

export type TextChatListItemWithProject = Omit<TextChatWithProject, "messages"> & {
  messages: [];
  messageCount: number;
};

export type RenderWithDetails = RenderWithProject & {
  inputAssets: RenderInputAsset[];
  outputAssets: RenderOutputAsset[];
  events: RenderEvent[];
};
