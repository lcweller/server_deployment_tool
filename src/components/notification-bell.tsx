"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useHostRealtimeEvents } from "@/lib/realtime/use-host-realtime-events";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  severity: string;
  title: string;
  message: string;
  linkHref: string | null;
  createdAt: string;
  readAt: string | null;
};

function bucketLabel(d: Date): string {
  const today = new Date();
  const y = (x: Date) =>
    x.getFullYear() === today.getFullYear() &&
    x.getMonth() === today.getMonth() &&
    x.getDate() === today.getDate();
  if (y(d)) return "Today";
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return "Yesterday";
  }
  return "Earlier";
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=25");
      if (!res.ok) return;
      const j = (await res.json()) as {
        notifications?: Row[];
        unreadCount?: number;
      };
      setItems(j.notifications ?? []);
      setUnread(j.unreadCount ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  const updatePanelPosition = useCallback(() => {
    const el = triggerWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(384, window.innerWidth - 16);
    setPanelStyle({
      position: "fixed",
      top: r.bottom + 4,
      left: Math.min(r.right - maxW, window.innerWidth - maxW - 8),
      width: maxW,
      zIndex: 80,
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useHostRealtimeEvents(() => {
    void load();
  });

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onWin = () => updatePanelPosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerWrapRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    void load();
  };

  const groups = new Map<string, Row[]>();
  for (const it of items) {
    const b = bucketLabel(new Date(it.createdAt));
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(it);
  }

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            data-testid="notification-dropdown"
            style={panelStyle}
            className="bg-popover text-popover-foreground ring-foreground/10 z-[100] min-h-[4.5rem] rounded-lg border p-0 shadow-md ring-1"
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-sm font-medium">Notifications</span>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-primary text-xs underline"
                  onClick={() => void markAllRead()}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                  No notifications yet.
                </div>
              ) : (
                [...groups.entries()].map(([label, rows]) => (
                  <div key={label}>
                    <div className="text-muted-foreground bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase">
                      {label}
                    </div>
                    {rows.map((n) => (
                      <Link
                        key={n.id}
                        href={n.linkHref ?? "/notifications"}
                        className={cn(
                          "block border-b px-3 py-2 text-left last:border-0",
                          !n.readAt && "bg-accent/30"
                        )}
                        onClick={() => {
                          if (!n.readAt) {
                            void fetch(`/api/notifications/${n.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ read: true }),
                            }).then(() => load());
                          }
                          setOpen(false);
                        }}
                      >
                        <div className="text-xs font-medium">{n.title}</div>
                        <div className="text-muted-foreground line-clamp-2 text-[11px]">
                          {n.message}
                        </div>
                        <div className="text-muted-foreground mt-0.5 text-[10px]">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </Link>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="border-t px-2 py-2 text-center">
              <Link
                href="/notifications"
                className="text-primary text-sm underline"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={triggerWrapRef} className="relative shrink-0">
        <button
          type="button"
          aria-expanded={open}
          aria-label="Notifications"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "relative h-8 w-8 shrink-0"
          )}
          onClick={() => {
            setOpen((o) => {
              const next = !o;
              if (next) queueMicrotask(() => updatePanelPosition());
              return next;
            });
          }}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </div>
      {panel}
    </>
  );
}
