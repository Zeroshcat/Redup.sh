import { api } from "@/lib/api-client";
import { apiServer, ServerAPIError } from "./server";

export type AnnouncementPlacement = "top_banner" | "home_card" | "inbox";
export type AnnouncementLevel = "info" | "success" | "warning" | "danger";

export interface ServerAnnouncement {
  id: number;
  title: string;
  content: string;
  placement: AnnouncementPlacement;
  level: AnnouncementLevel;
  start_at?: string;
  end_at?: string;
  published: boolean;
  dismissible: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  placement: AnnouncementPlacement;
  level: AnnouncementLevel;
  start_at?: string;
  end_at?: string;
  published: boolean;
  dismissible: boolean;
}

interface ListResp {
  items: ServerAnnouncement[];
}

// Public: anyone can read active announcements. Pass a placement to filter
// down (e.g. only the top banner).
export function listActiveAnnouncements(placement?: AnnouncementPlacement) {
  const q = placement ? `?placement=${placement}` : "";
  return api<ListResp>(`/api/announcements${q}`);
}

// SSR variant used by server components (TopNav, Home page). Never throws —
// announcements are a nice-to-have surface and should never break SSR if
// the backend is down.
export async function fetchActiveAnnouncements(
  placement?: AnnouncementPlacement,
): Promise<ServerAnnouncement[]> {
  try {
    const q = placement ? `?placement=${placement}` : "";
    const resp = await apiServer<ListResp>(`/api/announcements${q}`);
    return resp.items ?? [];
  } catch (err) {
    if (err instanceof ServerAPIError) return [];
    return [];
  }
}

// Admin-only: every announcement, including drafts and expired ones.
export function adminListAnnouncements() {
  return api<ListResp>("/api/admin/announcements");
}

export function adminCreateAnnouncement(input: AnnouncementInput) {
  return api<ServerAnnouncement>("/api/admin/announcements", {
    method: "POST",
    body: input,
  });
}

export function adminUpdateAnnouncement(id: number, input: AnnouncementInput) {
  return api<ServerAnnouncement>(`/api/admin/announcements/${id}`, {
    method: "PUT",
    body: input,
  });
}

export function adminSetAnnouncementPublished(id: number, published: boolean) {
  return api<ServerAnnouncement>(`/api/admin/announcements/${id}/publish`, {
    method: "POST",
    body: { published },
  });
}

export function adminDeleteAnnouncement(id: number) {
  return api<{ ok: true }>(`/api/admin/announcements/${id}`, {
    method: "DELETE",
  });
}
