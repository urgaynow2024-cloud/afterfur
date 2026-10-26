import { Shell, PageHeader, EmptyState } from "@/components/Shell";

export default function Explore() {
  return (
    <Shell>
      <PageHeader title="Explore" />
      <EmptyState title="Find your corner of AfterFur" body="Search for creators, interests and conversations." action={{ label: "Search", href: "/search" }} />
    </Shell>
  );
}
