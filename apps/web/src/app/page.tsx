import { redirect } from "next/navigation";
import {
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

  const [projects, recentRenders, textChats] = await Promise.all([
    getProjectsForUser(session.id),
    getRecentRendersForUser(session.id),
    getTextChatsForUser(session.id)
  ]);

  const chatSessions = textChats.map((chat) => ({
    ...chat,
    updatedAt: chat.updatedAt.toISOString()
  }));

  return (
    <StudioApp
      initialChatSessions={chatSessions}
      projects={projects}
      recentRenders={recentRenders}
      sessionName={session.name}
    />
  );
}
