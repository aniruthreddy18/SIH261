"use client";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { logoutAction } from "@/app/actions/auth";

export function UserMenu({ name, email, roleLabel, institution }: { name: string; email: string; roleLabel: string; institution?: string | null }) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-subtle" aria-label="Account menu">
          <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
            {name.replace(/^(Dr|Prof|Ar|Sri)\.?\s+/, "").split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[12.5px] font-medium leading-4 text-ink">{name}</span>
            <span className="block text-[11px] leading-4 text-muted">{roleLabel}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted" />
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <DropdownLabel>
          <span className="block font-medium text-ink">{name}</span>
          <span className="block">{email}</span>
          <span className="mt-1 block text-[11px] text-accent">{roleLabel}</span>
          {institution && <span className="block text-[11px]">{institution}</span>}
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem disabled>
          <UserRound /> Server-enforced role permissions
        </DropdownItem>
        <DropdownItem onSelect={() => logoutAction()}>
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
