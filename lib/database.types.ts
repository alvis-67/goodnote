import type { StatusId, TopicId } from "@/lib/domain";

export type AuthorRole = "client" | "admin" | "system";
export type MessageKind = "message" | "status_change";
export type NotificationEventType =
  | "request_created"
  | "client_message"
  | "admin_message"
  | "status_changed";

export type ClientRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  login_name: string | null;
  email: string | null;
  has_password: boolean;
  created_at: string;
  updated_at: string;
};

export type RequestRow = {
  id: string;
  client_id: string;
  topic: TopicId;
  status: StatusId;
  work_location: string | null;
  parent_request_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  admin_unread: boolean;
  admin_last_read_at: string | null;
  client_unread: boolean;
  client_last_read_at: string | null;
};

export type MessageRow = {
  id: string;
  request_id: string;
  author_role: AuthorRole;
  kind: MessageKind;
  body: string | null;
  status_from: StatusId | null;
  status_to: StatusId | null;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  message_id: string;
  request_id: string;
  client_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type InboxRow = {
  id: string;
  client_id: string;
  topic: TopicId;
  status: StatusId;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  admin_unread: boolean;
  admin_last_read_at: string | null;
  client_unread: boolean;
  client_last_read_at: string | null;
  work_location: string | null;
  parent_request_id: string | null;
  parent_topic: TopicId | null;
  child_request_id: string | null;
  child_topic: TopicId | null;
  company_name: string;
  contact_name: string | null;
  latest_body: string | null;
};
