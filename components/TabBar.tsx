"use client";

import type { Tab } from "@/lib/ui";
import { CalendarIcon, GaugeIcon, HomeIcon, SparkleIcon, UserIcon } from "./icons";
import { useTheme } from "./ThemeContext";

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { theme } = useTheme();
  const stoic = theme === "stoic";
  // ストイックでは AI のタブを「コーチ」と呼ぶ
  const tabs: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
    { id: "home", label: "ホーム", Icon: HomeIcon },
    { id: "calendar", label: "カレンダー", Icon: CalendarIcon },
    { id: "ai", label: stoic ? "コーチ" : "AI", Icon: stoic ? GaugeIcon : SparkleIcon },
    { id: "settings", label: "マイページ", Icon: UserIcon },
  ];

  return (
    <nav className="border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur stoic:bg-bg" aria-label="メニュー">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <li key={id} className="relative flex-1">
              {/* ストイックは、選んだタブの上に線を引く */}
              {stoic && <span className={`absolute inset-x-0 -top-px h-0.5 ${active ? "bg-accent" : "bg-transparent"}`} />}
              <button
                onClick={() => onChange(id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 pt-2.5 pb-1 text-[10px] font-medium transition ${active ? "text-accent-ink" : "text-muted"} ${stoic && active ? "font-bold" : ""}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} />
                {label}
                <span className={`mt-0.5 h-0.5 w-6 rounded-full ${active && !stoic ? "bg-accent" : "bg-transparent"}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
