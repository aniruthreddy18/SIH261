"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-md border border-border bg-surface p-1 shadow-lg", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-ink [&_svg]:size-4", className)} {...props} />;
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-xs text-muted", className)} {...props} />;
}

export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
