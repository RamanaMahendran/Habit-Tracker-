"use client";
import { useEffect, useState } from "react";

export type AndroidBridge = {
  request<T = void>(action: string, args?: Record<string, unknown>): Promise<T>;
};
export const androidReady = "habit-grove-android-ready";

declare global {
  interface Window {
    habitGroveAndroid?: AndroidBridge;
  }
}

export function useAndroidBridge() {
  const [bridge, setBridge] = useState<AndroidBridge>();
  useEffect(() => {
    const attach = () => setBridge(window.habitGroveAndroid);
    attach();
    window.addEventListener(androidReady, attach);
    return () => window.removeEventListener(androidReady, attach);
  }, []);
  return bridge;
}

export function useAndroidReminderSync(
  android: AndroidBridge | undefined,
  deadlines: number[] | null,
) {
  useEffect(() => {
    if (!android || !deadlines) return;
    android.request("syncReminders", { deadlines }).catch(() => {});
  }, [android, deadlines]);
}
