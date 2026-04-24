import { redirect } from "next/navigation";
import {
  getGalleryRendersForUser,
  getPromptPresetsForUser,
  getProjectsForUser,
  getRecentRendersForUser,
  getTextChatsForUser
} from "@openvideoui/database";
import { getSession } from "@/lib/session";
import { StudioApp } from "@/components/studio-app";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const [projects, recentRenders, galleryRenders, textChats, promptPresets] = await Promise.all([
    getProjectsForUser(session.id),
    getRecentRendersForUser(session.id),
    getGalleryRendersForUser(session.id),
    getTextChatsForUser(session.id),
    getPromptPresetsForUser({ ownerId: session.id })
  ]);

  const chatSessions = textChats.map((chat) => ({
    ...chat,
    hasLoadedMessages: false,
    updatedAt: chat.updatedAt.toISOString()
  }));

  return (
    <StudioApp
      initialChatSessions={chatSessions}
      initialPromptPresets={promptPresets.map((preset) => ({
        ...preset,
        mode: preset.mode as "image" | "video" | "text",
        createdAt: preset.createdAt.toISOString(),
        updatedAt: preset.updatedAt.toISOString()
      }))}
      galleryRenders={galleryRenders}
      projects={projects}
      recentRenders={recentRenders}
      sessionName={session.name}
    />
  );
}
