"use client";
import { useState } from "react";
import { Replace, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UploadPanel } from "./upload-panel";

export function UploadDialog({ applicationId, categories, defaultCategory, replace, maxMb, label, variant = "outline" }: { applicationId: string; categories: { code: string; name: string }[]; defaultCategory?: string; replace?: { documentId: string; categoryCode: string; label: string }; maxMb: number; label?: string; variant?: "outline" | "default" | "ghost" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant={variant}>{replace ? <Replace /> : <Upload />} {label ?? (replace ? "Replace" : "Upload")}</Button>
      </DialogTrigger>
      <DialogContent title={replace ? "Replace document" : "Upload document"} description="Files are validated (type, size, content) and stored privately. Extraction runs immediately after upload.">
        <UploadPanel applicationId={applicationId} categories={categories} defaultCategory={defaultCategory} replace={replace} maxMb={maxMb} />
      </DialogContent>
    </Dialog>
  );
}
