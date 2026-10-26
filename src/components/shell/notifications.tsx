"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Dropdown, DropdownContent, DropdownTrigger } from "@/components/ui/dropdown";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  link: string | null;
  severity: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({ items, unread }: { items: NotificationView[]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="relative rounded-md p-2 text-ink-2 hover:bg-subtle" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white tabular">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-ink">Notifications</p>
          {unread > 0 && (
            <button disabled={pending} onClick={() => start(() => markNotificationsReadAction())} className="flex items-center gap-1 text-[11px] text-accent hover:underline">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No notifications.</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "#"}
              onClick={() => !n.readAt && start(() => markNotificationsReadAction([n.id]))}
              className={cn("block border-b border-border px-3 py-2.5 last:border-0 hover:bg-subtle", !n.readAt && "bg-accent-soft/50")}
            >
              <div className="flex items-start gap-2">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : n.severity === "HIGH" || n.severity === "CRITICAL" ? "bg-bad" : "bg-accent")} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                  <p className="mt-1 text-[10.5px] text-faint">{new Date(n.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="border-t border-border px-3 py-2 text-[10.5px] text-faint">In-app notifications only. No e-mail is sent in this prototype.</p>
      </DropdownContent>
    </Dropdown>
  );
}
