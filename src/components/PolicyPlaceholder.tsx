import { EmptyState, PageHeader, Shell } from "@/components/Shell";

export default function PolicyPlaceholder({ title }: { title: string }) {
  return (
    <Shell>
      <PageHeader title={title} />
      <EmptyState
        title={`${title} content is not available yet`}
        body="The published information for this page has not been added. Please check back later."
        action={{ label: "Return home", href: "/" }}
      />
    </Shell>
  );
}
