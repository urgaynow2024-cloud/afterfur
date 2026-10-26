import { Shell, PageHeader, EmptyState } from "@/components/Shell";

export default function AfterDark() {
  return (
    <Shell>
      <PageHeader title="After Dark" />
      <EmptyState title="Your after-dark space" body="Eligible content appears here when your account meets the platform's access requirements." />
    </Shell>
  );
}
