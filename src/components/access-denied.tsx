import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <Card>
      <EmptyState icon={<ShieldOff />} title="You do not have access to this page" description="Access is enforced on the server according to your role. Contact a system administrator if you believe you need access." />
    </Card>
  );
}
