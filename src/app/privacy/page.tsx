import { Shell, PageHeader } from "@/components/Shell";
import PolicySection from "@/components/PolicySection";

export default function Page() {
  return (
    <Shell>
      <PageHeader title="Privacy Policy" />
      <PolicySection part="D" title="Privacy Policy" />
    </Shell>
  );
}
