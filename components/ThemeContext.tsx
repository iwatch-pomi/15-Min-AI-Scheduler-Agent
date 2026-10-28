"use client";

import { createContext, useContext } from "react";
import type { Arc, Theme } from "@/lib/theme";

// 画面のデザイン（やさしい／ストイック）と挑戦の設定。文言や部品の出し分けに使う
export const ThemeContext = createContext<{ theme: Theme; arc: Arc | null }>({ theme: "soft", arc: null });

export const useTheme = () => useContext(ThemeContext);
