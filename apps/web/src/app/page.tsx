import { redirect } from "next/navigation";
import {
  getGalleryRendersForUser,
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

  const [projects, recentRenders, galleryRenders, textChats] = await Promise.all([
    getProjectsForUser(session.id),
    getRecentRendersForUser(session.id),
    getGalleryRendersForUser(session.id),
    getTextChatsForUser(session.id)
  ]);

  const chatSessions = textChats.map((chat) => ({
    ...chat,
    updatedAt: chat.updatedAt.toISOString()
  }));

  return (
    <StudioApp
      initialChatSessions={chatSessions}
      galleryRenders={galleryRenders}
      projects={projects}
      recentRenders={recentRenders}
      sessionName={session.name}
    />
  );
}
