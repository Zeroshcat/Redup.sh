import { api } from "@/lib/api-client";

export interface ServerAttachment {
  id: number;
  user_id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  url: string;
  width?: number;
  height?: number;
  created_at: string;
}

export async function uploadFile(file: File): Promise<ServerAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return api<ServerAttachment>("/api/upload", {
    method: "POST",
    body: formData,
  });
}
