"use client";
import { useEffect, useRef, useState } from "react";
import { journalFetch } from "@/lib/journal-key";
let audio: AudioContext | undefined;
export function ring() {
  if (!audio || audio.state !== "running") return;
  navigator.serviceWorker?.controller?.postMessage({
    type: "grove-chime",
    at: Date.now(),
  });
  for (const [offset, hz] of [
    [0, 660],
    [0.24, 880],
  ]) {
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      t = audio.currentTime + offset;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.41);
  }
}
export function useAudioUnlock() {
  useEffect(() => {
    const resume = () => {
      if (soundEnabled()) unlock().catch(() => {});
    };
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => {
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
  }, []);
}
export function soundEnabled() {
  return localStorage.getItem("grove.chime") === "on";
}
async function unlock() {
  audio ??= new AudioContext();
  await audio.resume();
}
export function SoundSettings() {
  const [state, setState] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setEnabled(soundEnabled());
    return () => {
      mounted.current = false;
    };
  }, []);
  async function enable() {
    setBusy(true);
    try {
      // Both permission requests start within the user's tap.
      const permission =
        typeof Notification !== "undefined"
          ? Notification.requestPermission().catch(() => "denied")
          : Promise.resolve("unsupported");
      await unlock().catch(() => {});
      ring();
      localStorage.setItem("grove.chime", "on");
      setEnabled(true);
      if (
        (await permission) !== "granted" ||
        !("PushManager" in window) ||
        !("serviceWorker" in navigator)
      ) {
        setState(
          "In-app chime enabled. Allow browser notifications in device settings for background alerts.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyResponse = await journalFetch("/api/reminders");
      if (!keyResponse.ok) throw Error();
      const { key } = (await keyResponse.json()) as { key: string };
      const bytes = Uint8Array.from(
        atob(key.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      let sub = await reg.pushManager.getSubscription();
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      const response = await journalFetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", endpoint: sub.endpoint }),
      });
      if (!response.ok) throw Error();
      localStorage.setItem("grove.push", "on");
      setState(
        "Sound enabled. Background alerts use your phone’s notification sound and may arrive late.",
      );
      await reg.showNotification("Habit Grove sound test", {
        body: "If this was quiet, check your browser’s notification sound and Do Not Disturb settings.",
        tag: "grove-test",
        silent: false,
      });
    } catch {
      setState(
        "Background alerts could not be enabled. Tap Enable sound alerts to retry. The in-app chime uses media volume.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration(),
        sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await journalFetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disable", endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.removeItem("grove.chime");
      localStorage.removeItem("grove.push");
      setEnabled(false);
      setState("Sound alerts off on this device.");
    } catch {
      setState("Could not turn off device alerts. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sound-settings">
      <strong>Reminder sound</strong>
      <div className="choices">
        <button disabled={busy} onClick={enable}>
          {enabled &&
          typeof window !== "undefined" &&
          localStorage.getItem("grove.push") === "on"
            ? "Test sound"
            : "Enable sound alerts"}
        </button>
        {enabled && (
          <button disabled={busy} onClick={disable}>
            Turn off sound
          </button>
        )}
      </div>
      <small role="status">
        {state ||
          "Enable a chime in the app and notifications when it’s closed."}
      </small>
    </section>
  );
}
