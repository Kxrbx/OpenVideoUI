import "server-only";
import { cookies } from "next/headers";
import {
  createSessionForUser,
  deleteSessionByToken,
  getUserBySessionToken,
  upsertUser
} from "@openvideoui/database";

export type Session = {
  id: string;
  name: string;
  email: string;
};

const DEFAULT_COOKIE_NAME = "openvideoui_session";

function getCookieName() {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME;
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(getCookieName())?.value;

  if (!token) {
    return null;
  }

  const user = await getUserBySessionToken(token);

  if (!user) {
    store.delete(getCookieName());
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

export async function writeSession(input: Omit<Session, "id">) {
  const user = await upsertUser(input);
  const session = await createSessionForUser(user.id);
  const store = await cookies();
  store.set(getCookieName(), session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return user;
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(getCookieName())?.value;

  if (token) {
    await deleteSessionByToken(token);
  }

  store.delete(getCookieName());
}
