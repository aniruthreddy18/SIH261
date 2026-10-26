import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";

export default function NotFound() {
  return (
    <Card className="mt-8">
      <EmptyState icon={<FileQuestion />} title="Record not found" description="It may not exist, or you may not have access to it." action={<Link href="/" className="text-sm font-medium text-accent hover:underline">Back to Command Centre</Link>} />
    </Card>
  );
}
