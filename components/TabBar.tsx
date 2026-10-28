"use client";

import type { Tab } from "@/lib/ui";
import { CalendarIcon, HomeIcon, SettingsIcon, SparkleIcon } from "./icons";

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "ホーム", Icon: HomeIcon },
  { id: "calendar", label: "カレンダー", Icon: CalendarIcon },
  { id: "ai", label: "AI", Icon: SparkleIcon },
  { id: "settings", label: "設定", Icon: SettingsIcon },
];

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="メニュー">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <li key={id} className="flex-1">
              <button
                onClick={() => onChange(id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium transition ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
