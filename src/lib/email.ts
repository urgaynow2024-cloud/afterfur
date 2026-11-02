export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ ok: boolean; error?: string }>;
}

export function getEmailProvider(): EmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return {
    async send(message) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
        });
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `Resend ${res.status}: ${body}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
      }
    },
  };
}
