import { api } from "@/lib/api-client";

export interface FollowStats {
  followers: number;
  following: number;
  is_following: boolean;
}

export function getFollowStats(userId: number) {
  return api<FollowStats>(`/api/follow/users/${userId}/stats`);
}

export function followUser(userId: number) {
  return api<FollowStats>(`/api/follow/users/${userId}`, { method: "POST" });
}

export function unfollowUser(userId: number) {
  return api<FollowStats>(`/api/follow/users/${userId}`, { method: "DELETE" });
}
