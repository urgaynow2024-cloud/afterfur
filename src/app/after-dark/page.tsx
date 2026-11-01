import { Shell, PageHeader, EmptyState } from "@/components/Shell";

const AFTER_DARK_ENABLED = process.env.AFTER_DARK_ENABLED === "true";

export default function AfterDark() {
  if (!AFTER_DARK_ENABLED) {
    return (
      <Shell>
        <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
        <EmptyState title="After Dark is unavailable" body="After Dark is not currently available. Adult content access requires verified eligibility and approved age-assurance controls." />
      </Shell>
    );
  }
  return (
    <Shell>
      <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
      <EmptyState title="Your after-dark space" body="Eligible content appears here when your account meets the platform's access requirements." />
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
