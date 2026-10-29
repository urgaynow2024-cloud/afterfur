"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string };
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
function toMessage(row: MessageRow): Message | null {
  if (row.conversation_id === null || row.sender_id === null || row.created_at === null) return null;
  return { id: row.id, conversation_id: row.conversation_id, sender_id: row.sender_id, content: row.content, created_at: row.created_at };
}
type Peer = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type Conversation = { id: string; peer: Peer | null; lastMessage: Message | null };

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageReload, setMessageReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
    const { data: memberships, error: membershipError } = await supabase.from("conversation_participants").select("conversation_id,user_id").eq("user_id", user.id);
    if (membershipError) { setError(membershipError.message); setLoading(false); return; }
    const conversationIds = [...new Set(((memberships ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id))];
    if (!conversationIds.length) { setConversations([]); setLoading(false); return; }

    const { data: memberRows, error: membersError } = await supabase.from("conversation_participants").select("conversation_id,user_id").in("conversation_id", conversationIds);
    if (membersError) { setError(membersError.message); setLoading(false); return; }
    const peersByConversation = new Map<string, string>();
    for (const member of (memberRows ?? []) as { conversation_id: string; user_id: string }[]) {
      if (member.user_id !== user.id) peersByConversation.set(member.conversation_id, member.user_id);
    }
    const peerIds = [...new Set(peersByConversation.values())];
    const [{ data: profiles, error: profilesError }, { data: recentMessages, error: messagesError }] = await Promise.all([
      peerIds.length ? supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", peerIds) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("get_latest_conversation_messages", { p_conversation_ids: conversationIds }),
    ]);
    if (profilesError || messagesError) { setError((profilesError || messagesError)?.message ?? "Could not load conversations."); setLoading(false); return; }
    const profileMap = new Map(((profiles ?? []) as Peer[]).map((profile) => [profile.id, profile]));
    const lastByConversation = new Map<string, Message>();
    for (const row of (recentMessages ?? []) as MessageRow[]) {
      const message = toMessage(row);
      if (message && !lastByConversation.has(message.conversation_id)) lastByConversation.set(message.conversation_id, message);
    }
    setConversations(conversationIds.map((id) => {
      const peerId = peersByConversation.get(id);
      return { id, peer: peerId ? profileMap.get(peerId) ?? null : null, lastMessage: lastByConversation.get(id) ?? null };
    }).sort((a, b) => (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")));
    setLoading(false);
    } catch {
      setError("Could not load conversations. Check your connection and retry.");
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadConversations(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId || !user) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMessagesLoading(true);
      setMessageError("");
      const supabase = createClient();
      if (!supabase) { setMessageError("Supabase is not configured."); setMessagesLoading(false); return; }
      void supabase.from("messages").select("id,conversation_id,sender_id,content,created_at").eq("conversation_id", activeId).order("created_at", { ascending: true }).limit(100).then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setMessageError(queryError.message);
        else setMessages((data ?? []).flatMap((row) => { const message = toMessage(row); return message ? [message] : []; }));
        setMessagesLoading(false);
      }, () => {
        if (cancelled) return;
        setMessageError("Could not load messages. Check your connection and retry.");
        setMessagesLoading(false);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeId, messageReload, user]);

  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, conversations]);

  async function startConversation(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    const username = recipient.trim().replace(/^@/, "");
    const supabase = createClient();
    if (!supabase || !user) { setError("Sign in to start a conversation."); return; }
    if (!username) return;
    submittingRef.current = true;
    setSubmitting(true); setError("");
    try {
      const { data: profile, error: profileError } = await supabase.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (profileError || !profile) { setError(profileError?.message ?? "No member found with that username."); return; }
      if (profile.id === user.id) { setError("Choose another member to message."); return; }
      const { data: conversationId, error: createError } = await supabase.rpc("create_direct_conversation", { p_recipient_id: profile.id });
      if (createError || typeof conversationId !== "string") { setError(createError?.message ?? "Could not start that conversation."); return; }
      setRecipient("");
      setActiveId(conversationId);
      await loadConversations();
    } catch {
      setError("Could not start the conversation. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    const supabase = createClient();
    if (!supabase || !user || !activeId || !content || submitting || submittingRef.current) return;
    if (content.length > 2000) { setMessageError("Messages must be 2,000 characters or fewer."); return; }
    submittingRef.current = true;
    setSubmitting(true); setMessageError("");
    try {
      const { data, error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: user.id, content }).select("id,conversation_id,sender_id,content,created_at").single();
      if (insertError || !data) {
        setMessageError(insertError?.message ?? "Message was not saved. Your draft is still here.");
        return;
      }
      const sent = toMessage(data);
      if (!sent) {
        setDraft("");
        setMessageError("Message was saved but the server returned incomplete data. Reload the conversation to confirm it.");
        return;
      }
      setMessages((current) => [...current.filter((message) => message.id !== sent.id), sent].slice(-100));
      setConversations((current) => current.map((conversation) => conversation.id === activeId ? { ...conversation, lastMessage: sent } : conversation).sort((a, b) => (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")));
      setDraft("");
    } catch {
      setMessageError("Could not confirm delivery. Your draft is still here; check the conversation before retrying.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!user) return <Shell><PageHeader title="Messages" /><EmptyState title="Sign in to view messages" body="Your conversations appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Messages" subtitle="Private conversations between members." />
      <div className="grid min-h-[65vh] md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.4fr)]">
        <aside className={`${activeId ? "hidden md:block" : ""} border-b border-af-border md:border-b-0 md:border-r`} aria-label="Conversation list">
          <form onSubmit={startConversation} className="flex gap-2 border-b border-af-border p-3">
            <label className="sr-only" htmlFor="new-message-username">Start conversation by username</label>
            <input id="new-message-username" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Message a username" className="af-field min-w-0 flex-1 px-3 text-sm" />
            <button type="submit" disabled={submitting || !recipient.trim()} className="min-h-11 rounded-md bg-af-brand px-3 text-sm font-semibold text-white disabled:opacity-50">New</button>
          </form>
          {error && <p role="alert" className="m-3 text-sm text-af-danger">{error}</p>}
          {loading ? <p className="p-5 text-sm text-af-muted">Loading conversations…</p> : conversations.length === 0 ? <p className="p-5 text-sm text-af-muted">No conversations yet. Start one with a username.</p> : (
            <ul className="divide-y divide-af-border">
              {conversations.map((conversation) => <li key={conversation.id}>
                <button type="button" onClick={() => setActiveId(conversation.id)} aria-current={activeId === conversation.id ? "true" : undefined} className={`w-full p-4 text-left hover:bg-af-surface ${activeId === conversation.id ? "bg-af-surface-2" : ""}`}>
                  <span className="block truncate text-sm font-semibold">{conversation.peer?.display_name || conversation.peer?.username || "Conversation"}</span>
                  {conversation.peer && <span className="block truncate text-xs text-af-muted">@{conversation.peer.username}</span>}
                  <span className="mt-1 block truncate text-xs text-af-muted">{conversation.lastMessage ? `${conversation.lastMessage.sender_id === user.id ? "You: " : ""}${conversation.lastMessage.content}` : "No messages yet"}</span>
                </button>
              </li>)}
            </ul>
          )}
          {error && !loading && <button type="button" onClick={() => { void loadConversations(); }} className="mx-3 mb-3 text-sm text-af-brand-soft">Retry</button>}
        </aside>

        <section className={`${activeId ? "" : "hidden md:flex"} min-h-[60vh] flex-col`} aria-label="Conversation">
          {activeId && activeConversation ? <>
            <header className="flex items-center gap-3 border-b border-af-border p-4">
              <button type="button" onClick={() => setActiveId(null)} className="min-h-10 rounded-md px-2 text-sm text-af-muted hover:bg-af-surface-2 md:hidden">Back</button>
              {activeConversation.peer && <Link href={`/${encodeURIComponent(activeConversation.peer.username)}`} className="text-sm font-semibold hover:underline">{activeConversation.peer.display_name || activeConversation.peer.username}</Link>}
            </header>
            {messageError && <div role="alert" className="m-3 rounded-md bg-af-danger/10 p-3 text-sm text-af-danger">{messageError}<button type="button" onClick={() => setMessageReload((current) => current + 1)} className="ml-2 underline">Retry</button></div>}
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {messagesLoading ? <p className="text-sm text-af-muted">Loading messages…</p> : messages.length === 0 ? <p className="text-center text-sm text-af-muted">Start the conversation.</p> : messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.sender_id === user.id ? "ml-auto bg-af-brand text-white" : "bg-af-surface-2 text-af-text"}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><time className="mt-1 block text-right text-[10px] opacity-70" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time></div>)}
            </div>
            <form onSubmit={sendMessage} className="border-t border-af-border p-3">
              <label htmlFor="message-draft" className="sr-only">Message</label>
              <textarea id="message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Write a message…" className="af-field min-h-20 w-full resize-y px-3 py-2 text-sm" />
              <div className="mt-2 flex items-center justify-between"><span className="text-xs text-af-muted">{draft.length}/2000</span><button type="submit" disabled={submitting || !draft.trim() || messagesLoading} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Sending…" : "Send"}</button></div>
            </form>
          </> : <div className="hidden flex-1 items-center justify-center md:flex"><p className="text-sm text-af-muted">Choose a conversation or start a new one.</p></div>}
        </section>
      </div>
    </Shell>
  );
}
