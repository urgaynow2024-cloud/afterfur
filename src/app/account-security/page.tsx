import { Shell, PageHeader } from "@/components/Shell";
import PolicySection from "@/components/PolicySection";

export default function Page() {
  return (
    <Shell>
      <PageHeader title="Account Security, Deletion and Data Requests" />
      <PolicySection part="G" title="Account Security, Deletion and Data Requests" />
    </Shell>
  );
}

export const dynamic = 'force-dynamic';

