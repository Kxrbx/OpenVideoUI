import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  OpenRouterModel,
  OpenRouterVideoGenerationStatus,
  OpenRouterVideoGenerationSubmission,
  OpenRouterVideoModel
} from "@openvideoui/openrouter";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { getDatabaseClient } from "./client";
import {
  type NewRenderEvent,
  type NewRenderInputAsset,
  type NewRenderOutputAsset,
  type NewRender,
  type NewPromptPreset,
  modelCapabilities,
  promptPresets,
  type ProjectWithRenderCount,
  renderEvents,
  renderInputAssets,
  renderOutputAssets,
  type RenderWithProject,
  projects,
  renders,
  sessions,
  textChats,
  type TextChatWithProject,
  type TextChatListItemWithProject,
  users
} from "./schema";

const SESSION_TTL_DAYS = 30;

type RenderAssetInput = Omit<NewRenderInputAsset, "id" | "renderId" | "createdAt">;
type RenderEventInput = Omit<NewRenderEvent, "id" | "renderId" | "createdAt">;
type RenderOutputAssetInput = Omit<NewRenderOutputAsset, "id" | "renderId" | "createdAt">;
type PersistedOutputDescriptor = {
  publicUrl: string;
  storageKey?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

function buildSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

async function insertRenderEvent(
  db: {
    insert: ReturnType<typeof getDatabaseClient>["insert"];
  },
  renderId: string,
  event: RenderEventInput
) {
  const [createdEvent] = await db
    .insert(renderEvents)
    .values({
      renderId,
      ...event,
      payload: event.payload ?? {}
    })
    .returning();

  return createdEvent;
}

async function replaceRenderOutputAssets(
  db: {
    delete: ReturnType<typeof getDatabaseClient>["delete"];
    insert: ReturnType<typeof getDatabaseClient>["insert"];
  },
  renderId: string,
  assets: RenderOutputAssetInput[]
) {
  await db.delete(renderOutputAssets).where(eq(renderOutputAssets.renderId, renderId));

  if (assets.length === 0) {
    return [];
  }

  return db
    .insert(renderOutputAssets)
    .values(
      assets.map((asset) => ({
        renderId,
        ...asset,
        metadata: asset.metadata ?? {}
      }))
    )
    .returning();
}

export async function upsertUser(input: { email: string; name: string }) {
  const db = getDatabaseClient();

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, input.email)
  });

  if (existingUser) {
    const [updatedUser] = await db
      .update(users)
      .set({
        name: input.name,
        updatedAt: new Date()
      })
      .where(eq(users.id, existingUser.id))
      .returning();

    return updatedUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name
    })
    .returning();

  return createdUser;
}

export async function updateUserName(userId: string, name: string) {
  const db = getDatabaseClient();

  const [updatedUser] = await db
    .update(users)
    .set({
      name,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning();

  return updatedUser ?? null;
}

export async function createSessionForUser(userId: string) {
  const db = getDatabaseClient();
  const token = randomUUID();

  const [createdSession] = await db
    .insert(sessions)
    .values({
      userId,
      token,
      expiresAt: buildSessionExpiry()
    })
    .returning();

  return createdSession;
}

export async function getUserBySessionToken(token: string) {
  const db = getDatabaseClient();

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
    with: {
      user: true
    }
  });

  return session?.user ?? null;
}

export async function deleteSessionByToken(token: string) {
  const db = getDatabaseClient();

  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function getProjectsForUser(userId: string): Promise<ProjectWithRenderCount[]> {
  const db = getDatabaseClient();

  const rows = await db
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      title: projects.title,
      description: projects.description,
      tags: projects.tags,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      renderCount: count(renders.id)
    })
    .from(projects)
    .leftJoin(renders, eq(renders.projectId, projects.id))
    .where(eq(projects.ownerId, userId))
    .groupBy(projects.id)
    .orderBy(desc(projects.updatedAt));

  return rows.map((row) => ({
    ...row,
    renderCount: Number(row.renderCount)
  }));
}

export async function getRecentRendersForUser(userId: string, limit = 8): Promise<RenderWithProject[]> {
  const db = getDatabaseClient();

  return db
    .select({
      id: renders.id,
      projectId: renders.projectId,
      modelId: renders.modelId,
      mediaType: renders.mediaType,
      workflowType: renders.workflowType,
      status: renders.status,
      title: renders.title,
      prompt: renders.prompt,
      negativePrompt: renders.negativePrompt,
      settings: renders.settings,
      providerJobId: renders.providerJobId,
      providerGenerationId: renders.providerGenerationId,
      providerPollUrl: renders.providerPollUrl,
      providerStatus: renders.providerStatus,
      outputUrls: renders.outputUrls,
      providerUsage: renders.providerUsage,
      providerRequest: sql<null>`null`,
      providerResponse: sql<null>`null`,
      failureCode: renders.failureCode,
      failureMessage: renders.failureMessage,
      createdAt: renders.createdAt,
      updatedAt: renders.updatedAt,
      completedAt: renders.completedAt,
      failedAt: renders.failedAt,
      projectTitle: projects.title
    })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(renders.createdAt))
    .limit(limit);
}

export async function getGalleryRendersForUser(
  userId: string,
  limit = 120
): Promise<RenderWithProject[]> {
  const db = getDatabaseClient();

  return db
    .select({
      id: renders.id,
      projectId: renders.projectId,
      modelId: renders.modelId,
      mediaType: renders.mediaType,
      workflowType: renders.workflowType,
      status: renders.status,
      title: renders.title,
      prompt: renders.prompt,
      negativePrompt: renders.negativePrompt,
      settings: renders.settings,
      providerJobId: renders.providerJobId,
      providerGenerationId: renders.providerGenerationId,
      providerPollUrl: renders.providerPollUrl,
      providerStatus: renders.providerStatus,
      outputUrls: renders.outputUrls,
      providerUsage: renders.providerUsage,
      providerRequest: sql<null>`null`,
      providerResponse: sql<null>`null`,
      failureCode: renders.failureCode,
      failureMessage: renders.failureMessage,
      createdAt: renders.createdAt,
      updatedAt: renders.updatedAt,
      completedAt: renders.completedAt,
      failedAt: renders.failedAt,
      projectTitle: projects.title
    })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(
      and(
        eq(projects.ownerId, userId),
        eq(renders.status, "completed"),
        inArray(renders.mediaType, ["image", "video"]),
        sql`jsonb_array_length(${renders.outputUrls}) > 0`
      )
    )
    .orderBy(desc(renders.completedAt), desc(renders.createdAt))
    .limit(limit);
}

export async function ensureStarterWorkspace(userId: string) {
  const db = getDatabaseClient();

  const existingProject = await db.query.projects.findFirst({
    where: eq(projects.ownerId, userId)
  });

  if (existingProject) {
    return;
  }

  await db
    .insert(projects)
    .values({
      ownerId: userId,
      title: "First Project",
      description: "Starter workspace for your first OpenRouter-backed renders.",
      tags: ["starter"]
    });
}

export async function getProjectForUser(userId: string, projectId: string) {
  const db = getDatabaseClient();

  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, userId))
  });
}

export async function createProjectForUser(input: {
  ownerId: string;
  title: string;
  description?: string | null;
  tags?: string[];
}) {
  const db = getDatabaseClient();

  const [project] = await db
    .insert(projects)
    .values({
      ownerId: input.ownerId,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags ?? []
    })
    .returning();

  return {
    ...project,
    renderCount: 0
  };
}

export async function getTextChatsForUser(userId: string): Promise<TextChatListItemWithProject[]> {
  const db = getDatabaseClient();

  const rows = await db
    .select({
      id: textChats.id,
      projectId: textChats.projectId,
      modelId: textChats.modelId,
      title: textChats.title,
      messages: sql<[] | string>`'[]'::jsonb`,
      messageCount: sql<number | string>`jsonb_array_length(${textChats.messages})`,
      createdAt: textChats.createdAt,
      updatedAt: textChats.updatedAt,
      projectTitle: projects.title
    })
    .from(textChats)
    .innerJoin(projects, eq(projects.id, textChats.projectId))
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(textChats.updatedAt));

  return rows.map((row) => ({
    ...row,
    messages: [],
    messageCount: Number(row.messageCount)
  }));
}

export async function getTextChatForUser(input: {
  ownerId: string;
  chatId: string;
}): Promise<TextChatWithProject | null> {
  const db = getDatabaseClient();

  const rows = await db
    .select({
      id: textChats.id,
      projectId: textChats.projectId,
      modelId: textChats.modelId,
      title: textChats.title,
      messages: textChats.messages,
      createdAt: textChats.createdAt,
      updatedAt: textChats.updatedAt,
      projectTitle: projects.title
    })
    .from(textChats)
    .innerJoin(projects, eq(projects.id, textChats.projectId))
    .where(and(eq(textChats.id, input.chatId), eq(projects.ownerId, input.ownerId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function createTextChatForUser(input: {
  ownerId: string;
  projectId: string;
  modelId: string;
  title?: string;
  messages?: Array<{ id: string; role: "user" | "assistant"; content: string }>;
}) {
  const db = getDatabaseClient();
  const project = await getProjectForUser(input.ownerId, input.projectId);

  if (!project) {
    return null;
  }

  const [chat] = await db
    .insert(textChats)
    .values({
      projectId: input.projectId,
      modelId: input.modelId,
      title: input.title ?? "Untitled chat",
      messages: input.messages ?? []
    })
    .returning();

  return {
    ...chat,
    projectTitle: project.title
  };
}

export async function updateTextChatForUser(input: {
  ownerId: string;
  chatId: string;
  modelId: string;
  title: string;
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
}) {
  const db = getDatabaseClient();

  const existingChat = await db
    .select({
      id: textChats.id,
      projectId: textChats.projectId,
      projectTitle: projects.title
    })
    .from(textChats)
    .innerJoin(projects, eq(projects.id, textChats.projectId))
    .where(and(eq(textChats.id, input.chatId), eq(projects.ownerId, input.ownerId)))
    .limit(1);

  const match = existingChat[0];

  if (!match) {
    return null;
  }

  const [chat] = await db
    .update(textChats)
    .set({
      modelId: input.modelId,
      title: input.title,
      messages: input.messages,
      updatedAt: new Date()
    })
    .where(eq(textChats.id, input.chatId))
    .returning();

  return {
    ...chat,
    projectTitle: match.projectTitle
  };
}

export async function deleteTextChatForUser(input: {
  ownerId: string;
  chatId: string;
}) {
  const db = getDatabaseClient();

  const existingChat = await db
    .select({
      id: textChats.id
    })
    .from(textChats)
    .innerJoin(projects, eq(projects.id, textChats.projectId))
    .where(and(eq(textChats.id, input.chatId), eq(projects.ownerId, input.ownerId)))
    .limit(1);

  if (!existingChat[0]) {
    return false;
  }

  await db.delete(textChats).where(eq(textChats.id, input.chatId));
  return true;
}

export type PromptPresetInput = {
  title: string;
  mode: "image" | "video" | "text";
  workflowType: string;
  prompt: string;
  modelId: string;
  settings?: Record<string, unknown>;
  tags?: string[];
};

export async function getPromptPresetsForUser(input: {
  ownerId: string;
  mode?: "image" | "video" | "text";
}) {
  const db = getDatabaseClient();

  return db.query.promptPresets.findMany({
    where: input.mode
      ? and(eq(promptPresets.ownerId, input.ownerId), eq(promptPresets.mode, input.mode))
      : eq(promptPresets.ownerId, input.ownerId),
    orderBy: desc(promptPresets.updatedAt)
  });
}

export async function createPromptPresetForUser(ownerId: string, input: PromptPresetInput) {
  const db = getDatabaseClient();

  const [preset] = await db
    .insert(promptPresets)
    .values({
      ownerId,
      title: input.title,
      mode: input.mode,
      workflowType: input.workflowType,
      prompt: input.prompt,
      modelId: input.modelId,
      settings: input.settings ?? {},
      tags: input.tags ?? []
    } satisfies NewPromptPreset)
    .returning();

  return preset;
}

export async function updatePromptPresetForUser(input: {
  ownerId: string;
  presetId: string;
  values: Partial<PromptPresetInput>;
}) {
  const db = getDatabaseClient();
  const [preset] = await db
    .update(promptPresets)
    .set({
      ...input.values,
      settings: input.values.settings ?? undefined,
      tags: input.values.tags ?? undefined,
      updatedAt: new Date()
    })
    .where(and(eq(promptPresets.id, input.presetId), eq(promptPresets.ownerId, input.ownerId)))
    .returning();

  return preset ?? null;
}

export async function deletePromptPresetForUser(input: {
  ownerId: string;
  presetId: string;
}) {
  const db = getDatabaseClient();
  const deleted = await db
    .delete(promptPresets)
    .where(and(eq(promptPresets.id, input.presetId), eq(promptPresets.ownerId, input.ownerId)))
    .returning({ id: promptPresets.id });

  return deleted.length > 0;
}

export async function getModelCapabilityById(modelId: string) {
  const db = getDatabaseClient();

  return db.query.modelCapabilities.findFirst({
    where: eq(modelCapabilities.modelId, modelId)
  });
}

export async function listModelCapabilities(providerType?: "image" | "video") {
  const db = getDatabaseClient();

  return db.query.modelCapabilities.findMany({
    where: providerType ? eq(modelCapabilities.providerType, providerType) : undefined,
    orderBy: desc(modelCapabilities.syncedAt)
  });
}

export async function getModelCapabilityStats() {
  const db = getDatabaseClient();
  const [stats] = await db
    .select({
      modelCount: count(modelCapabilities.id),
      latestSyncedAt: sql<Date | null>`max(${modelCapabilities.syncedAt})`
    })
    .from(modelCapabilities);

  return {
    modelCount: Number(stats?.modelCount ?? 0),
    latestSyncedAt: stats?.latestSyncedAt ?? null
  };
}

export async function createRenderRecord(values: Omit<NewRender, "id" | "createdAt" | "updatedAt">) {
  const db = getDatabaseClient();

  return db.transaction(async (tx) => {
    const [render] = await tx
      .insert(renders)
      .values(values)
      .returning();

    await insertRenderEvent(tx, render.id, {
      eventType: "render.created",
      toStatus: render.status,
      providerStatus: render.providerStatus ?? null,
      message: "Render record created.",
      payload: {
        mediaType: render.mediaType,
        workflowType: render.workflowType,
        modelId: render.modelId
      }
    });

    return render;
  });
}

export async function updateRenderTitle(renderId: string, title: string) {
  const db = getDatabaseClient();
  const [render] = await db
    .update(renders)
    .set({
      title,
      updatedAt: new Date()
    })
    .where(eq(renders.id, renderId))
    .returning();

  return render ?? null;
}

export async function getRenderForUser(renderId: string, userId: string) {
  const db = getDatabaseClient();

  const rows = await db
    .select({
      id: renders.id,
      projectId: renders.projectId,
      modelId: renders.modelId,
      mediaType: renders.mediaType,
      workflowType: renders.workflowType,
      status: renders.status,
      title: renders.title,
      prompt: renders.prompt,
      negativePrompt: renders.negativePrompt,
      settings: renders.settings,
      providerJobId: renders.providerJobId,
      providerGenerationId: renders.providerGenerationId,
      providerPollUrl: renders.providerPollUrl,
      providerStatus: renders.providerStatus,
      outputUrls: renders.outputUrls,
      providerUsage: renders.providerUsage,
      providerRequest: renders.providerRequest,
      providerResponse: renders.providerResponse,
      failureCode: renders.failureCode,
      failureMessage: renders.failureMessage,
      createdAt: renders.createdAt,
      updatedAt: renders.updatedAt,
      completedAt: renders.completedAt,
      failedAt: renders.failedAt,
      projectTitle: projects.title
    })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(and(eq(renders.id, renderId), eq(projects.ownerId, userId)))
    .limit(1);

  const render = rows[0];

  if (!render) {
    return null;
  }

  const [inputAssets, outputAssets, events] = await Promise.all([
    db.query.renderInputAssets.findMany({
      where: eq(renderInputAssets.renderId, renderId),
      orderBy: asc(renderInputAssets.createdAt)
    }),
    db.query.renderOutputAssets.findMany({
      where: eq(renderOutputAssets.renderId, renderId),
      orderBy: asc(renderOutputAssets.createdAt)
    }),
    db.query.renderEvents.findMany({
      where: eq(renderEvents.renderId, renderId),
      orderBy: asc(renderEvents.createdAt)
    })
  ]);

  return {
    ...render,
    inputAssets,
    outputAssets,
    events
  };
}

export async function getRenderById(renderId: string) {
  const db = getDatabaseClient();

  return db.query.renders.findFirst({
    where: eq(renders.id, renderId)
  });
}

export async function getPollableVideoRenders(limit = 25) {
  const db = getDatabaseClient();

  return db.query.renders.findMany({
    where: and(
      eq(renders.mediaType, "video"),
      inArray(renders.status, ["submitting", "processing"]),
      isNotNull(renders.providerJobId)
    ),
    orderBy: desc(renders.updatedAt),
    limit
  });
}

export async function getStaleSubmittingVideoRenders(olderThan: Date, limit = 25) {
  const db = getDatabaseClient();

  return db.query.renders.findMany({
    where: and(
      eq(renders.mediaType, "video"),
      eq(renders.status, "submitting"),
      lt(renders.updatedAt, olderThan)
    ),
    orderBy: asc(renders.updatedAt),
    limit
  });
}

export async function updateRenderAfterVideoSubmission(
  renderId: string,
  submission: OpenRouterVideoGenerationSubmission,
  requestPayload: Record<string, unknown>
) {
  const db = getDatabaseClient();

  return db.transaction(async (tx) => {
    const existing = await tx.query.renders.findFirst({
      where: eq(renders.id, renderId)
    });

    const [render] = await tx
      .update(renders)
      .set({
        status: "processing",
        providerJobId: submission.id,
        providerGenerationId: submission.generation_id ?? null,
        providerPollUrl: submission.polling_url,
        providerStatus: submission.status,
        providerRequest: requestPayload,
        providerResponse: submission as Record<string, unknown>,
        updatedAt: new Date()
      })
      .where(eq(renders.id, renderId))
      .returning();

    await insertRenderEvent(tx, renderId, {
      eventType: "provider.submitted",
      fromStatus: existing?.status ?? null,
      toStatus: render.status,
      providerStatus: submission.status,
      message: "Video generation accepted by provider.",
      payload: {
        providerJobId: submission.id,
        pollingUrl: submission.polling_url,
        generationId: submission.generation_id ?? null
      }
    });

    return render;
  });
}

export async function completeImageRender(
  renderId: string,
  responsePayload: Record<string, unknown>,
  outputUrls: string[],
  usage?: Record<string, unknown>,
  persistedOutputs?: PersistedOutputDescriptor[]
) {
  const db = getDatabaseClient();

  return db.transaction(async (tx) => {
    const existing = await tx.query.renders.findFirst({
      where: eq(renders.id, renderId)
    });

    const [render] = await tx
      .update(renders)
      .set({
        status: "completed",
        providerStatus: "completed",
        outputUrls,
        providerUsage: usage ?? null,
        providerResponse: responsePayload,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(renders.id, renderId))
      .returning();

    await replaceRenderOutputAssets(
      tx,
      render.id,
      (persistedOutputs && persistedOutputs.length > 0 ? persistedOutputs : outputUrls.map((url) => ({
        publicUrl: url,
        storageKey: null,
        mimeType: null,
        fileName: null,
        fileSize: null
      }))).map(
        (asset, index): RenderOutputAssetInput => ({
          kind: "result",
          assetType: "image",
          url: asset.publicUrl,
          storageKey: asset.storageKey ?? null,
          mimeType: asset.mimeType ?? null,
          position: String(index),
          metadata: {
            index,
            fileName: asset.fileName ?? null,
            fileSize: asset.fileSize ?? null
          }
        })
      )
    );

    await insertRenderEvent(tx, render.id, {
      eventType: "render.completed",
      fromStatus: existing?.status ?? null,
      toStatus: "completed",
      providerStatus: "completed",
      message: "Image generation completed.",
      payload: {
        outputCount: outputUrls.length,
        usage: usage ?? null
      }
    });

    return render;
  });
}

export async function failRender(renderId: string, code: string, message: string, responsePayload?: Record<string, unknown>) {
  const db = getDatabaseClient();

  return db.transaction(async (tx) => {
    const existing = await tx.query.renders.findFirst({
      where: eq(renders.id, renderId)
    });

    if (!existing) {
      return null;
    }

    if (
      existing.status === "failed" &&
      existing.failureCode === code &&
      existing.failureMessage === message
    ) {
      return existing;
    }

    if (existing.status === "completed" || existing.status === "canceled") {
      return existing;
    }

    const [render] = await tx
      .update(renders)
      .set({
        status: "failed",
        providerStatus: "failed",
        failureCode: code,
        failureMessage: message,
        providerResponse: responsePayload ?? null,
        failedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(renders.id, renderId))
      .returning();

    await insertRenderEvent(tx, render.id, {
      eventType: "render.failed",
      fromStatus: existing?.status ?? null,
      toStatus: "failed",
      providerStatus: "failed",
      message,
      payload: {
        code,
        providerResponse: responsePayload ?? null
      }
    });

    return render;
  });
}

export async function failStaleSubmittingVideoRenders(olderThan: Date, limit = 25) {
  const staleRenders = await getStaleSubmittingVideoRenders(olderThan, limit);
  const failed = [];

  for (const render of staleRenders) {
    const nextRender = await failRender(
      render.id,
      "submission_stalled",
      "Video submission did not reach the provider before the recovery timeout."
    );

    if (nextRender) {
      failed.push(nextRender);
    }
  }

  return failed;
}

export async function syncVideoRenderFromProvider(
  renderId: string,
  status: OpenRouterVideoGenerationStatus,
  persistedOutputs?: PersistedOutputDescriptor[]
) {
  const db = getDatabaseClient();

  const nextStatus =
    status.status === "completed"
      ? "completed"
      : status.status === "failed"
        ? "failed"
        : "processing";

  return db.transaction(async (tx) => {
    const existing = await tx.query.renders.findFirst({
      where: eq(renders.id, renderId)
    });

    if (!existing) {
      return null;
    }

    if (existing.status === "completed" || existing.status === "canceled") {
      return existing;
    }

    const outputUrls =
      persistedOutputs && persistedOutputs.length > 0
        ? persistedOutputs.map((asset) => asset.publicUrl)
        : (status.unsigned_urls ?? []);

    const [render] = await tx
      .update(renders)
      .set({
        status: nextStatus,
        providerStatus: status.status,
        providerGenerationId: status.generation_id ?? null,
        outputUrls,
        providerUsage: status.usage ?? null,
        providerResponse: status as Record<string, unknown>,
        failureCode: status.status === "failed" ? "provider_failed" : null,
        failureMessage: status.status === "failed" ? status.error ?? "Video generation failed." : null,
        completedAt: status.status === "completed" ? new Date() : null,
        failedAt: status.status === "failed" ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(renders.id, renderId))
      .returning();

    if (status.status === "completed") {
      await replaceRenderOutputAssets(
        tx,
        render.id,
        outputUrls.map(
          (url, index): RenderOutputAssetInput => ({
            kind: "result",
            assetType: "video",
            url,
            storageKey: persistedOutputs?.[index]?.storageKey ?? null,
            mimeType: persistedOutputs?.[index]?.mimeType ?? null,
            position: String(index),
            metadata: {
              index,
              fileName: persistedOutputs?.[index]?.fileName ?? null,
              fileSize: persistedOutputs?.[index]?.fileSize ?? null,
              providerUrl:
                persistedOutputs?.[index] ? (status.unsigned_urls ?? [])[index] ?? null : null
            }
          })
        )
      );
    }

    const statusChanged =
      existing?.status !== render.status ||
      existing?.providerStatus !== render.providerStatus ||
      JSON.stringify(existing?.outputUrls ?? []) !== JSON.stringify(outputUrls);

    if (statusChanged) {
      await insertRenderEvent(tx, render.id, {
        eventType:
          status.status === "completed"
            ? "render.completed"
            : status.status === "failed"
              ? "render.failed"
              : "provider.status_updated",
        fromStatus: existing?.status ?? null,
        toStatus: render.status,
        providerStatus: status.status,
        message:
          status.status === "completed"
            ? "Video generation completed."
            : status.status === "failed"
              ? status.error ?? "Video generation failed."
              : "Provider status updated.",
        payload: {
          generationId: status.generation_id ?? null,
          outputCount: outputUrls.length,
          usage: status.usage ?? null,
          error: status.error ?? null
        }
      });
    }

    return render;
  });
}

export async function attachRenderInputAssets(renderId: string, assets: RenderAssetInput[]) {
  const db = getDatabaseClient();

  if (assets.length === 0) {
    return [];
  }

  return db.transaction(async (tx) => {
    const createdAssets = await tx
      .insert(renderInputAssets)
      .values(
        assets.map((asset) => ({
          renderId,
          ...asset,
          metadata: asset.metadata ?? {}
        }))
      )
      .returning();

    await insertRenderEvent(tx, renderId, {
      eventType: "render.inputs_attached",
      fromStatus: null,
      toStatus: null,
      providerStatus: null,
      message: "Input assets attached to render.",
      payload: {
        count: createdAssets.length,
        roles: createdAssets.map((asset) => asset.role)
      }
    });

    return createdAssets;
  });
}

export async function upsertImageModelCapabilities(models: OpenRouterModel[]) {
  const db = getDatabaseClient();

  for (const model of models) {
    await db
      .insert(modelCapabilities)
      .values({
        modelId: model.id,
        providerType: "image",
        name: model.name ?? null,
        canonicalSlug: model.canonical_slug ?? null,
        description: model.description ?? null,
        inputModalities: model.architecture?.input_modalities ?? [],
        outputModalities: model.architecture?.output_modalities ?? [],
        supportedAspectRatios: [],
        supportedDurations: [],
        supportedResolutions: [],
        supportedFrameImages: [],
        allowedPassthroughParameters: [],
        generateAudio: null,
        rawPayload: model as Record<string, unknown>,
        syncedAt: new Date()
      })
      .onConflictDoUpdate({
        target: modelCapabilities.modelId,
        set: {
          providerType: "image",
          name: model.name ?? null,
          canonicalSlug: model.canonical_slug ?? null,
          description: model.description ?? null,
          inputModalities: model.architecture?.input_modalities ?? [],
          outputModalities: model.architecture?.output_modalities ?? [],
          rawPayload: model as Record<string, unknown>,
          syncedAt: new Date()
        }
      });
  }
}

export async function upsertVideoModelCapabilities(models: OpenRouterVideoModel[]) {
  const db = getDatabaseClient();

  for (const model of models) {
    await db
      .insert(modelCapabilities)
      .values({
        modelId: model.id,
        providerType: "video",
        name: model.name ?? null,
        canonicalSlug: model.canonical_slug ?? null,
        description: model.description ?? null,
        inputModalities: model.supported_frame_images?.length ? ["image"] : [],
        outputModalities: ["video"],
        supportedAspectRatios: model.supported_aspect_ratios ?? [],
        supportedDurations: model.supported_durations ?? [],
        supportedResolutions: model.supported_resolutions ?? [],
        supportedFrameImages: model.supported_frame_images ?? [],
        allowedPassthroughParameters: model.allowed_passthrough_parameters ?? [],
        generateAudio: model.generate_audio ?? null,
        rawPayload: model as Record<string, unknown>,
        syncedAt: new Date()
      })
      .onConflictDoUpdate({
        target: modelCapabilities.modelId,
        set: {
          providerType: "video",
          name: model.name ?? null,
          canonicalSlug: model.canonical_slug ?? null,
          description: model.description ?? null,
          inputModalities: model.supported_frame_images?.length ? ["image"] : [],
          outputModalities: ["video"],
          supportedAspectRatios: model.supported_aspect_ratios ?? [],
          supportedDurations: model.supported_durations ?? [],
          supportedResolutions: model.supported_resolutions ?? [],
          supportedFrameImages: model.supported_frame_images ?? [],
          allowedPassthroughParameters: model.allowed_passthrough_parameters ?? [],
          generateAudio: model.generate_audio ?? null,
          rawPayload: model as Record<string, unknown>,
          syncedAt: new Date()
        }
      });
  }
}

export async function getModelCapabilities() {
  const db = getDatabaseClient();

  return db.query.modelCapabilities.findMany({
    orderBy: desc(modelCapabilities.syncedAt)
  });
}

export async function syncOpenRouterModelCapabilities(apiKey?: string) {
  const client = createOpenRouterClient(apiKey ? { apiKey } : undefined);
  const [imageModels, videoModels] = await Promise.all([
    client.listModels(["image"]),
    client.listVideoModels()
  ]);

  await upsertImageModelCapabilities(imageModels.data);
  await upsertVideoModelCapabilities(videoModels.data);

  return {
    imageModelsSynced: imageModels.data.length,
    videoModelsSynced: videoModels.data.length
  };
}
