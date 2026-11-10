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
  access_token: string;
  created_at: string;
  updated_at: string;
};

export type RequestRow = {
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
  company_name: string;
  contact_name: string | null;
  latest_body: string | null;
};

type EmptyRelationships = [];

export type Database = {
  public: {
    Tables: {
      admin_allowlist: {
        Row: { email: string; created_at: string };
        Insert: { email: string; created_at?: string };
        Update: { email?: string; created_at?: string };
        Relationships: EmptyRelationships;
      };
      clients: {
        Row: ClientRow;
        Insert: {
          id?: string;
          company_name: string;
          contact_name?: string | null;
          phone?: string | null;
          notes?: string | null;
          access_token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_name?: string;
          contact_name?: string | null;
          phone?: string | null;
          notes?: string | null;
          access_token?: string;
          updated_at?: string;
        };
        Relationships: EmptyRelationships;
      };
      requests: {
        Row: RequestRow;
        Insert: {
          id?: string;
          client_id: string;
          topic: TopicId;
          status?: StatusId;
          created_at?: string;
          updated_at?: string;
          last_activity_at?: string;
          admin_unread?: boolean;
          admin_last_read_at?: string | null;
          client_unread?: boolean;
          client_last_read_at?: string | null;
        };
        Update: {
          status?: StatusId;
          updated_at?: string;
          last_activity_at?: string;
          admin_unread?: boolean;
          admin_last_read_at?: string | null;
          client_unread?: boolean;
          client_last_read_at?: string | null;
        };
        Relationships: EmptyRelationships;
      };
      messages: {
        Row: MessageRow;
        Insert: {
          id?: string;
          request_id: string;
          author_role: AuthorRole;
          kind?: MessageKind;
          body?: string | null;
          status_from?: StatusId | null;
          status_to?: StatusId | null;
          created_at?: string;
        };
        Update: {
          body?: string | null;
        };
        Relationships: EmptyRelationships;
      };
      attachments: {
        Row: AttachmentRow;
        Insert: {
          id?: string;
          message_id: string;
          request_id: string;
          client_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: {
          file_name?: string;
        };
        Relationships: EmptyRelationships;
      };
      notification_events: {
        Row: {
          id: string;
          event_type: NotificationEventType;
          channel: "in_app" | "email" | "whatsapp";
          recipient_role: "admin" | "client";
          client_id: string;
          request_id: string;
          message_id: string | null;
          payload: Record<string, unknown>;
          created_at: string;
          read_at: string | null;
          delivered_at: string | null;
        };
        Insert: {
          id?: string;
          event_type: NotificationEventType;
          channel?: "in_app" | "email" | "whatsapp";
          recipient_role: "admin" | "client";
          client_id: string;
          request_id: string;
          message_id?: string | null;
          payload?: Record<string, unknown>;
          created_at?: string;
          read_at?: string | null;
          delivered_at?: string | null;
        };
        Update: {
          read_at?: string | null;
          delivered_at?: string | null;
        };
        Relationships: EmptyRelationships;
      };
    };
    Views: {
      request_inbox: {
        Row: InboxRow;
        Relationships: EmptyRelationships;
      };
    };
    Functions: Record<string, never>;
  };
};
