"use client";
import { useEffect, useState } from "react";
import { journalFetch } from "@/lib/journal-key";

let audio: AudioContext | undefined;
export const audioReadyEvent = "grove-audio-ready";

export function ring() {
  if (!audio || audio.state !== "running") return false;
  for (const [offset, hz] of [
    [0, 660],
    [0.24, 880],
  ]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime + offset;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.32, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + 0.41);
  }
  return true;
}

export function useAudioUnlock() {
  useEffect(() => {
    const resume = () => {
      if (!soundEnabled() || audio?.state === "running") return;
      unlock()
        .then(() => {
          window.dispatchEvent(new Event(audioReadyEvent));
        })
        .catch(() => {});
    };
    // Mobile browsers grant touch activation on pointerup.
    document.addEventListener("pointerup", resume);
    document.addEventListener("keydown", resume);
    return () => {
      document.removeEventListener("pointerup", resume);
      document.removeEventListener("keydown", resume);
    };
  }, []);
}

export function soundEnabled() {
  return localStorage.getItem("grove.chime") === "on";
}
async function unlock() {
  if (!audio || audio.state === "closed") audio = new AudioContext();
  if (audio.state !== "running") await audio.resume();
}
function workerReady() {
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        reject(
          Error(
            "The notification service did not start. Reload Habit Grove and try again.",
          ),
        ),
      8000,
    );
    navigator.serviceWorker.ready.then(
      (reg) => {
        window.clearTimeout(timeout);
        resolve(reg);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
async function deviceRequest(action: string, endpoint: string) {
  const response = await journalFetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, endpoint }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw Error(
      body?.error || "Could not reach the reminder service. Try again.",
    );
  }
}

export function SoundSettings() {
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [background, setBackground] = useState(false);
  useEffect(() => {
    setEnabled(soundEnabled());
    setBackground(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        localStorage.getItem("grove.push") === "on",
    );
  }, []);

  async function testChime() {
    localStorage.setItem("grove.chime", "on");
    setEnabled(true);
    try {
      await unlock();
      setState(
        ring()
          ? "Chime played. If it was quiet, turn up media volume."
          : "Tap Test chime again to allow sound.",
      );
    } catch {
      setState(
        "This browser could not start the chime. Try opening Habit Grove in Chrome.",
      );
    }
  }
  async function enableAndTest() {
    setBusy(true);
    setState("Connecting to the phone’s notification service…");
    try {
      if (
        typeof Notification === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw Error(
          "Open Habit Grove directly in Chrome to enable phone notifications.",
        );
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        localStorage.removeItem("grove.push");
        setBackground(false);
        throw Error(
          "Notifications are off. Allow notifications for this site in Chrome, then try again.",
        );
      }
      const reg = await workerReady();
      const keyResponse = await journalFetch("/api/reminders");
      if (!keyResponse.ok)
        throw Error("The reminder service is unavailable. Try again.");
      const { key } = (await keyResponse.json()) as { key: string };
      const bytes = Uint8Array.from(
        atob(key.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      let sub = await reg.pushManager.getSubscription();
      if (
        sub?.options.applicationServerKey &&
        !new Uint8Array(sub.options.applicationServerKey).every(
          (byte, i) => byte === bytes[i],
        )
      ) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      try {
        await deviceRequest("enable", sub.endpoint);
      } catch (error) {
        if (!(error instanceof Error) || !/old journal/.test(error.message))
          throw error;
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        await deviceRequest("enable", sub.endpoint);
      }
      localStorage.setItem("grove.push", "on");
      setBackground(true);
      await deviceRequest("test", sub.endpoint);
      setState(
        "Test sent to this device. Check your notification shade. If it’s quiet, check that Chrome or Habit Grove notifications are set to Alerting.",
      );
    } catch (error) {
      setState(
        error instanceof Error
          ? error.message
          : "Could not send the test notification.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await deviceRequest("disable", sub.endpoint);
        await sub.unsubscribe();
      }
      localStorage.removeItem("grove.chime");
      localStorage.removeItem("grove.push");
      setEnabled(false);
      setBackground(false);
      setState("Sound alerts off on this device.");
    } catch {
      setState("Could not turn off device alerts. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sound-settings">
      <strong>Reminder alerts</strong>
      <div className="choices">
        <button disabled={busy} onClick={testChime}>
          {enabled ? "Test chime" : "Enable in-app chime"}
        </button>
        <button disabled={busy} onClick={enableAndTest}>
          {background
            ? "Test phone notification"
            : "Enable phone notifications"}
        </button>
        {(enabled || background) && (
          <button disabled={busy} onClick={disable}>
            Turn off alerts
          </button>
        )}
      </div>
      <small role="status">
        {state ||
          "The in-app chime uses media volume. Phone notifications use your device’s alert settings."}
      </small>
    </section>
  );
}
