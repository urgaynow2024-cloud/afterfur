import { Shell, PageHeader } from "@/components/Shell";
import PolicySection from "@/components/PolicySection";

export default function Page() {
  return (
    <Shell>
      <PageHeader title="Safety" />
      <PolicySection part="F" title="Reporting, Moderation, Appeals and Enforcement" />
    </Shell>
  );
}
