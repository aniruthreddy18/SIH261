"use client";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mt-8">
      <EmptyState icon={<AlertTriangle />} title="Something went wrong" description="The page could not be loaded. No changes were made. Try again, and contact an administrator if the problem persists." action={<Button size="sm" onClick={reset}>Try again</Button>} />
    </Card>
  );
}
