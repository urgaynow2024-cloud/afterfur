import { Shell, PageHeader } from "@/components/Shell";
import PolicySection from "@/components/PolicySection";

export default function Page() {
  return (
    <Shell>
      <PageHeader title="Terms of Service" />
      <PolicySection part="A" title="Terms of Service" />
    </Shell>
  );
}
