export type SessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type Session = {
  session_id: string;
  project_id: string;
  last_revision_id: string;
  created_at: number;
  messages: SessionMessage[];
};

const sessions = new Map<string, Session>();

export function create_session(project_id: string, revision_id: string): Session {
  const session_id = `sess_${crypto.randomUUID().replace(/-/g, "")}`;
  const session: Session = {
    session_id,
    project_id,
    last_revision_id: revision_id,
    created_at: Date.now(),
    messages: []
  };
  sessions.set(session_id, session);
  return session;
}

export function get_session(session_id: string): Session | null {
  return sessions.get(session_id) ?? null;
}

export function append_message(session_id: string, message: SessionMessage): void {
  const session = sessions.get(session_id);
  if (!session) return;
  session.messages.push(message);
}

export function update_revision(session_id: string, revision_id: string): void {
  const session = sessions.get(session_id);
  if (!session) return;
  session.last_revision_id = revision_id;
}
