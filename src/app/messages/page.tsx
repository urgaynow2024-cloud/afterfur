"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { validateMediaFile, storagePathFor } from "@/lib/media";

type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string };
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
function toMessage(row: MessageRow): Message | null {
  if (row.conversation_id === null || row.sender_id === null || row.created_at === null) return null;
  return { id: row.id, conversation_id: row.conversation_id, sender_id: row.sender_id, content: row.content, created_at: row.created_at };
}
type Peer = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type Conversation = { id: string; peer: Peer | null; lastMessage: Message | null; unreadCount: number; muted: boolean };
type FailedSend = { content: string; createdAt: string };
type Attachment = { id: string; storage_path: string; bucket_id: string; media_type: string | null; file_size: number | null; created_at: string | null };

function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Avatar({ peer, size = "h-11 w-11" }: { peer: Peer | null; size?: string }) {
  const label = peer?.display_name || peer?.username || "Conversation";
  if (peer?.avatar_url) {
    return <img src={peer.avatar_url} alt="" className={`${size} rounded-full object-cover ring-1 ring-af-border`} />;
  }
  return (
    <div className={`${size} flex items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white ring-1 ring-af-border`}>
      {label.slice(0, 1).toUpperCase()}
    </div>
  );
}

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
  const [requestAction, setRequestAction] = useState<string|null>(null);
  const [requests, setRequests] = useState<{incoming:any[], outgoing:any[]}>({incoming:[], outgoing:[]});
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [messagePage, setMessagePage] = useState<string|null>(null);
  const [failedSends, setFailedSends] = useState<Record<string, FailedSend>>({});
  const [readReceipts, setReadReceipts] = useState<Set<string>>(new Set());
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mutedConversations, setMutedConversations] = useState<Set<string>>(new Set());
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const sentIdsRef = useRef<Set<string>>(new Set());
  const messageChannelRef = useRef<{ unsubscribe: () => void } | null>(null);

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

    // Load muted conversations for this user.
    const { data: mutes, error: mutesError } = await supabase.from("conversation_mutes").select("conversation_id").eq("user_id", user.id);
    if (mutesError) { setError(mutesError.message); setLoading(false); return; }
    const mutedSet = new Set(((mutes ?? []) as { conversation_id: string }[]).map((m) => m.conversation_id));

    // Load unread counts: messages from peers not yet read by the user.
    const { data: unreadRows, error: unreadError } = await supabase
      .from("messages")
      .select("id,conversation_id")
      .in("conversation_id", conversationIds)
      .neq("sender_id", user.id);
    if (unreadError) { setError(unreadError.message); setLoading(false); return; }

    const { data: readRows, error: readError } = await supabase
      .from("message_reads")
      .select("conversation_id, message_id")
      .eq("user_id", user.id);
    if (readError) { setError(readError.message); setLoading(false); return; }

    const readMessageIds = new Set(((readRows ?? []) as { message_id: string }[]).map((r) => r.message_id));
    const unreadCountMap: Record<string, number> = {};
    (unreadRows ?? []).forEach((row: any) => {
      if (!readMessageIds.has(row.id)) {
        unreadCountMap[row.conversation_id] = (unreadCountMap[row.conversation_id] ?? 0) + 1;
      }
    });

    const profileMap = new Map(((profiles ?? []) as Peer[]).map((profile) => [profile.id, profile]));
    const lastByConversation = new Map<string, Message>();
    for (const row of (recentMessages ?? []) as MessageRow[]) {
      const message = toMessage(row);
      if (message && !lastByConversation.has(message.conversation_id)) lastByConversation.set(message.conversation_id, message);
    }
    setConversations(conversationIds.map((id) => {
      const peerId = peersByConversation.get(id);
      return { id, peer: peerId ? profileMap.get(peerId) ?? null : null, lastMessage: lastByConversation.get(id) ?? null, unreadCount: unreadCountMap[id] ?? 0, muted: mutedSet.has(id) };
    }).sort((a, b) => (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")));
    setUnreadCounts(unreadCountMap);
    setMutedConversations(mutedSet);
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

  const loadRequests = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    if (!supabase) return;
    setRequestsLoading(true);
    try {
      const res = await fetch('/api/messages/requests', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setRequests(json);
      }
    } catch {}
    setRequestsLoading(false);
  }, [user]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!activeId || !user) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMessagesLoading(true);
      setMessageError("");
      const supabase = createClient();
      if (!supabase) { setMessageError("Supabase is not configured."); setMessagesLoading(false); return; }
      void supabase.from("messages").select("id,conversation_id,sender_id,content,created_at").eq("conversation_id", activeId).order("created_at", { ascending: true }).limit(100).then(async ({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setMessageError(queryError.message);
        else {
          const loaded = (data ?? []).flatMap((row) => { const message = toMessage(row); return message ? [message] : []; });
          setMessages(loaded);
          await markMessagesRead(activeId, loaded.filter((m) => m.sender_id !== user.id).map((m) => m.id));
        }
        setMessagesLoading(false);
      }, () => {
        if (cancelled) return;
        setMessageError("Could not load messages. Check your connection and retry.");
        setMessagesLoading(false);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeId, messageReload, user]);

  useEffect(() => {
    if (!activeId || !user) {
      if (messageChannelRef.current) { messageChannelRef.current.unsubscribe(); messageChannelRef.current = null; }
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`afterfur-messages:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        (payload: any) => {
          const row = payload.new as MessageRow | null;
          if (!row) return;
          const message = toMessage(row);
          if (!message) return;
          if (sentIdsRef.current.has(message.id)) return;
          setMessages((current) => {
            if (current.some((m) => m.id === message.id)) return current;
            return [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-100);
          });
          setConversations((current) => current.map((c) => c.id === activeId ? { ...c, lastMessage: message } : c).sort((a, b) => (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")));
          setFailedSends((prev) => { const next = { ...prev }; delete next[message.id]; return next; });
          if (message.sender_id !== user.id) {
            if (activeId === message.conversation_id) {
              void markMessagesRead(activeId, [message.id]);
            } else {
              setUnreadCounts((prev) => { const next = { ...prev }; next[message.conversation_id] = (next[message.conversation_id] ?? 0) + 1; return next; });
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          messageChannelRef.current = null;
        }
      });
    messageChannelRef.current = { unsubscribe: () => { supabase.removeChannel(channel); } };
    return () => {
      messageChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeId, user]);

  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, conversations]);

  async function handleRequest(id: string, action: 'accept'|'reject') {
    setRequestAction(id);
    try {
      const res = await fetch(`/api/messages/requests/${id}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action }) });
      if (res.ok) {
        await loadRequests();
        await loadConversations();
      }
    } catch {}
    setRequestAction(null);
  }

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
      const res = await fetch('/api/messages/requests', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ toUserId: profile.id }) });
      if (res.status === 409) { setError('Request already exists.'); return; }
      if (!res.ok) { setError('Could not send request.'); return; }
      setRecipient("");
      await loadRequests();
    } catch {
      setError("Could not start the conversation. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function doSendMessage(content: string, dedupKey: string) {
    const supabase = createClient();
    if (!supabase || !user || !activeId || !content || submittingRef.current) return;
    if (sentIdsRef.current.has(dedupKey)) { setMessageError("Message already being sent."); return; }
    submittingRef.current = true;
    setSubmitting(true); setMessageError("");
    try {
      const { data, error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: user.id, content }).select("id,conversation_id,sender_id,content,created_at").single();
      sentIdsRef.current.add(dedupKey);
      if (insertError || !data) {
        setFailedSends((prev) => ({ ...prev, [dedupKey]: { content, createdAt: new Date().toISOString() } }));
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
      // Notify the other participant (server-side enforces blocks, prefs, muting, dedup).
      void fetch(`/api/messages/${activeId}/notify`, { method: "POST" });
    } catch {
      setFailedSends((prev) => ({ ...prev, [dedupKey]: { content, createdAt: new Date().toISOString() } }));
      setMessageError("Could not confirm delivery. Your draft is still here; check the conversation before retrying.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (content.length > 2000) { setMessageError("Messages must be 2,000 characters or fewer."); return; }
    const dedupKey = `${activeId}:${content}:${Date.now()}`;
    void doSendMessage(content, dedupKey);
  }

  async function loadMoreMessages() {
    if (!activeId || !user || messagesLoading) return;
    const oldest = messages[0];
    if (!oldest) return;
    setMessagesLoading(true);
    const supabase = createClient();
    if (!supabase) { setMessagesLoading(false); return; }
    const { data, error: queryError } = await supabase.from("messages").select("id,conversation_id,sender_id,content,created_at").eq("conversation_id", activeId).order("created_at", { ascending: true }).lt("created_at", oldest.created_at).limit(50);
    if (queryError) { setMessageError(queryError.message); setMessagesLoading(false); return; }
    const more = (data ?? []).flatMap((row) => { const message = toMessage(row); return message ? [message] : []; });
    setMessages((current) => [...more, ...current].slice(-150));
    setMessagePage(oldest.created_at);
    setMessagesLoading(false);
  }

  async function retrySend(key: string) {
    const failed = failedSends[key];
    if (!failed) return;
    setFailedSends((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setMessageError("");
    const dedupKey = `${activeId}:${failed.content}:${Date.now()}`;
    void doSendMessage(failed.content, dedupKey);
  }

  async function toggleMute(conversationId: string) {
    const currentlyMuted = mutedConversations.has(conversationId);
    const supabase = createClient();
    if (!supabase || !user) return;
    try {
      if (currentlyMuted) {
        const { error } = await supabase.from("conversation_mutes").delete().eq("conversation_id", conversationId).eq("user_id", user.id);
        if (error) throw error;
        setMutedConversations((prev) => { const next = new Set(prev); next.delete(conversationId); return next; });
        setConversations((current) => current.map((c) => c.id === conversationId ? { ...c, muted: false } : c));
      } else {
        const { error } = await supabase.from("conversation_mutes").insert({ conversation_id: conversationId, user_id: user.id });
        if (error) throw error;
        setMutedConversations((prev) => { const next = new Set(prev); next.add(conversationId); return next; });
        setConversations((current) => current.map((c) => c.id === conversationId ? { ...c, muted: true } : c));
        setUnreadCounts((prev) => { const next = { ...prev }; next[conversationId] = 0; return next; });
      }
    } catch {
      setError("Could not update mute status. Please try again.");
    }
  }

  async function markMessagesRead(conversationId: string, messageIds: string[]) {
    if (!conversationId || messageIds.length === 0) return;
    const newIds = messageIds.filter((id) => !readReceipts.has(id));
    if (newIds.length === 0) return;
    try {
      const res = await fetch('/api/messages/read-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, messageIds: newIds }),
      });
      if (res.ok) {
        setReadReceipts((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch {}
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!activeId || !user) return;
    const validationError = validateMediaFile(file);
    if (validationError) { setMessageError(validationError); return; }
    if (file.size > 25 * 1024 * 1024) { setMessageError("File is too large. Maximum size is 25 MB."); return; }

    setAttachmentUploading(true);
    setMessageError("");
    const supabase = createClient();
    if (!supabase) { setAttachmentUploading(false); return; }

    try {
      const path = storagePathFor({ id: user.id }, file);
      const { error: uploadError, data } = await supabase.storage.from("message_attachments").upload(path, file);
      if (uploadError) {
        const msg = typeof uploadError === "object" && uploadError !== null && "message" in uploadError ? String((uploadError as unknown as Record<string, unknown>).message) : String(uploadError);
        setMessageError(msg);
        setAttachmentUploading(false);
        return;
      }
      if (!data?.path) {
        setMessageError("Upload succeeded but no path returned.");
        setAttachmentUploading(false);
        return;
      }

      // Create a placeholder message first to attach the file to, or register after message send.
      // For now, register as an attachment reference. The actual message content will reference it.
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (!profile) { setAttachmentUploading(false); return; }

      const { data: msgData, error: msgError } = await supabase.from("messages").insert({
        conversation_id: activeId,
        sender_id: user.id,
        content: `[Attachment] ${file.name}`,
      }).select("id,conversation_id,sender_id,content,created_at").single();

      if (msgError || !msgData) { setMessageError(msgError?.message ?? "Could not create message for attachment."); setAttachmentUploading(false); return; }

      const { error: attachError } = await supabase.from("message_attachments").insert({
        message_id: msgData.id,
        conversation_id: activeId,
        uploader_id: user.id,
        storage_path: path,
        bucket_id: "message_attachments",
        media_type: file.type,
        file_size: file.size,
      });

      if (attachError) { setMessageError(attachError.message); setAttachmentUploading(false); return; }

      const sent = toMessage(msgData);
      if (sent) {
        setMessages((current) => [...current.filter((m) => m.id !== sent.id), sent].slice(-100));
        setConversations((current) => current.map((c) => c.id === activeId ? { ...c, lastMessage: sent } : c).sort((a, b) => (b.lastMessage?.created_at ?? "").localeCompare(a.lastMessage?.created_at ?? "")));
      }
      setDraft("");
      void fetch(`/api/messages/${activeId}/notify`, { method: "POST" });
    } catch {
      setMessageError("Attachment upload failed. Please try again.");
    } finally {
      setAttachmentUploading(false);
      event.target.value = "";
    }
  }

  if (!user) return <Shell><PageHeader title="Messages" /><EmptyState title="Sign in to view messages" body="Your conversations appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Messages" subtitle="Private conversations between members." />
      <div className="grid min-h-[65vh] md:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.35fr)]">
        <aside className={`${activeId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-b border-af-border md:border-b-0 md:border-r`} aria-label="Conversation list">
          <form onSubmit={startConversation} className="flex gap-2 border-b border-af-border p-3">
            <label className="sr-only" htmlFor="new-message-username">Start conversation by username</label>
            <input id="new-message-username" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Message a username" className="af-field min-w-0 flex-1 px-3 text-sm" />
            <button type="submit" disabled={submitting || !recipient.trim()} className="min-h-11 rounded-md bg-af-brand px-3 text-sm font-semibold text-white disabled:opacity-50">Request</button>
          </form>
          {requests.incoming.length>0 && <div className="border-b border-af-border p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-af-muted">Incoming requests ({requests.incoming.length})</p>{requests.incoming.map((r:any)=>(<div key={r.id} className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2">{r.profile?.avatar_url?<img src={r.profile.avatar_url} alt="" className="h-8 w-8 rounded-full"/>:<div className="h-8 w-8 rounded-full bg-af-surface-2"/>}{r.profile?<span className="text-sm">@{r.profile.username}</span>:<span className="text-sm">User</span>}</div><div className="flex gap-2"><button onClick={()=>handleRequest(r.id,'accept')} disabled={requestAction===r.id} className="min-h-8 rounded-md px-2 text-xs bg-af-brand text-white">Accept</button><button onClick={()=>handleRequest(r.id,'reject')} disabled={requestAction===r.id} className="min-h-8 rounded-md px-2 text-xs border border-af-border">Reject</button></div></div>))}</div>}
          {requests.outgoing.length>0 && <div className="border-b border-af-border p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-af-muted">Outgoing requests ({requests.outgoing.length})</p>{requests.outgoing.map((r:any)=>(<div key={r.id} className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2">{r.profile?.avatar_url?<img src={r.profile.avatar_url} alt="" className="h-8 w-8 rounded-full"/>:<div className="h-8 w-8 rounded-full bg-af-surface-2"/>}{r.profile?<span className="text-sm">@{r.profile.username}</span>:<span className="text-sm">User</span>}</div><span className={`text-xs ${r.status==='pending'?'text-af-muted':'text-af-brand-soft'}`}>{r.status}</span></div>))}</div>}
          {error && <p role="alert" className="m-3 text-sm text-af-danger">{error}</p>}
          {loading ? <p className="p-5 text-sm text-af-muted">Loading conversations…</p> : conversations.length === 0 ? <p className="p-5 text-sm text-af-muted">No conversations yet. Start one with a username.</p> : (
            <ul className="min-h-0 flex-1 divide-y divide-af-border overflow-y-auto">
              {conversations.map((conversation) => {
                const peerUnread = conversation.unreadCount > 0 && activeId !== conversation.id;
                const isMuted = conversation.muted;
                return (
                  <li key={conversation.id}>
                    <button type="button" onClick={() => setActiveId(conversation.id)} aria-current={activeId === conversation.id ? "true" : undefined} className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-af-surface-2/60 ${activeId === conversation.id ? "bg-af-surface-2" : ""}`}>
                      <span className="relative shrink-0">
                        <Avatar peer={conversation.peer} />
                        {peerUnread && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-af-surface bg-af-brand" aria-label="Unread" title="Unread messages" />}
                        {isMuted && <span className="absolute right-0 top-3 h-2 w-2 rounded-full bg-af-muted" aria-label="Muted" title="Notifications muted" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-af-text">{conversation.peer?.display_name || conversation.peer?.username || "Conversation"}</span>
                          {conversation.lastMessage && <span className="shrink-0 text-[11px] text-af-muted">{formatTime(conversation.lastMessage.created_at)}</span>}
                          {peerUnread && <span className={`text-xs font-semibold ${isMuted ? "text-af-muted" : "text-af-brand"}`}>{conversation.unreadCount}</span>}
                        </span>
                        {conversation.peer && <span className="block truncate text-xs text-af-muted">@{conversation.peer.username}</span>}
                        <span className="mt-0.5 block truncate text-xs text-af-text-2">{conversation.lastMessage ? `${conversation.lastMessage.sender_id === user.id ? "You: " : ""}${conversation.lastMessage.content}` : "No messages yet"}</span>
                      </span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); void toggleMute(conversation.id); }} className={`min-h-8 shrink-0 rounded-md px-2 text-xs ${isMuted ? "bg-af-surface-2 text-af-muted" : "text-af-brand-soft hover:bg-af-surface-2"}`} aria-label={isMuted ? "Unmute conversation" : "Mute conversation"}>
                        {isMuted ? "Unmute" : "Mute"}
                      </button>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && !loading && <button type="button" onClick={() => { void loadConversations(); }} className="mx-3 mb-3 text-sm text-af-brand-soft">Retry</button>}
        </aside>

        <section className={`${activeId ? "flex" : "hidden md:flex"} min-h-0 flex-col`} aria-label="Conversation">
          {activeId && activeConversation ? <>
            <header className="flex items-center gap-3 border-b border-af-border px-4 py-3">
              <button type="button" onClick={() => setActiveId(null)} className="min-h-10 rounded-md px-2 text-sm text-af-muted hover:bg-af-surface-2 md:hidden">Back</button>
              <Avatar peer={activeConversation.peer} size="h-9 w-9" />
              <div className="min-w-0 flex-1">
                {activeConversation.peer && <Link href={`/${encodeURIComponent(activeConversation.peer.username)}`} className="block truncate text-sm font-semibold hover:underline">{activeConversation.peer.display_name || activeConversation.peer.username}</Link>}
                {activeConversation.peer && <span className="block truncate text-xs text-af-muted">@{activeConversation.peer.username}</span>}
              </div>
            </header>
            {messageError && <div role="alert" className="m-3 rounded-md bg-af-danger/10 p-3 text-sm text-af-danger">{messageError}<button type="button" onClick={() => setMessageReload((current) => current + 1)} className="ml-2 underline">Retry</button></div>}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {messagesLoading ? <p className="text-sm text-af-muted">Loading messages…</p> : messages.length === 0 ? <p className="text-center text-sm text-af-muted">Start the conversation.</p> : (
                <>
                  {messagePage && <button type="button" onClick={loadMoreMessages} disabled={messagesLoading} className="w-full py-2 text-xs text-af-brand-soft hover:bg-af-surface-2">Load more older messages</button>}
                  {messages.map((message) => {
                    const mine = message.sender_id === user.id;
                    const read = mine || readReceipts.has(message.id);
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "rounded-br-md bg-af-brand text-white" : "rounded-bl-md bg-af-surface-2 text-af-text"}`}>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          <time className={`mt-1 block text-[10px] opacity-70 ${mine ? "text-right" : "text-left"}`} dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                          {!mine && !read && <span className="mt-0.5 block text-[10px] text-af-muted">Delivered</span>}
                          {!mine && read && <span className="mt-0.5 block text-[10px] text-af-brand-soft">Read</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            <form onSubmit={sendMessage} className="border-t border-af-border p-3">
              <label htmlFor="message-draft" className="sr-only">Message</label>
              <textarea id="message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="Write a message…" className="af-field min-h-16 w-full resize-y px-3 py-2 text-sm" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <label htmlFor="message-attachment" className="flex items-center gap-1 text-xs text-af-muted hover:text-af-text cursor-pointer">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  Attach file
                </label>
                <input id="message-attachment" type="file" onChange={handleFileSelect} className="hidden" disabled={attachmentUploading} />
                <span className="text-xs text-af-muted">{draft.length}/2000</span>
                {attachmentUploading ? <span className="text-xs text-af-brand-soft animate-pulse">Uploading…</span> : null}
                <button type="submit" disabled={submitting || (!draft.trim() && !attachmentUploading) || messagesLoading} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Sending…" : attachmentUploading ? "Uploading…" : "Send"}</button>
              </div>
            </form>
            {Object.keys(failedSends).length > 0 && <div className="border-t border-af-border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-af-danger">Failed to send</p>
              {Object.entries(failedSends).map(([key, failed]) => (
                <div key={key} className="flex items-center justify-between gap-2 px-2 py-1 bg-af-danger/5 rounded-md border border-af-danger/20">
                  <span className="flex-1 truncate text-xs text-af-text">{failed.content}</span>
                  <button type="button" onClick={() => retrySend(key)} disabled={submitting} className="min-h-8 rounded-md px-2 text-xs border border-af-brand text-af-brand hover:bg-af-brand/10">Retry</button>
                  <button type="button" onClick={() => setFailedSends((prev) => { const next = { ...prev }; delete next[key]; return next; })} className="min-h-8 rounded-md px-2 text-xs text-af-muted hover:text-af-danger">Dismiss</button>
                </div>
              ))}
            </div>}
          </> : <div className="hidden flex-1 items-center justify-center md:flex"><p className="text-sm text-af-muted">Choose a conversation or start a new one.</p></div>}
        </section>
      </div>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
