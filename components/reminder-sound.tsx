"use client";
import { useEffect, useState } from "react";
import { journalFetch } from "@/lib/journal-key";
import { useAndroidBridge, type AndroidBridge } from "@/lib/android-bridge";

let audio: AudioContext | undefined;
export const audioReadyEvent = "grove-audio-ready";

export function ring() {
  if (!audio || audio.state !== "running") return false;
  for (const [offset, hz, duration] of [
    [0, 784, 0.13],
    [0.19, 1047, 0.13],
    [0.47, 784, 0.13],
    [0.66, 1175, 0.24],
  ]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime + offset;
    osc.type = "square";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
    gain.gain.setValueAtTime(0.1, t + duration - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + duration);
  }
  navigator.vibrate?.([120, 95, 120, 160, 250]);
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
  return response;
}

type TestResult = {
  state: "accepted" | "failed" | "none" | "queued" | "unconfirmed";
  sentAt?: number;
};

export function SoundSettings() {
  const android = useAndroidBridge();
  return android ? <AndroidAlertSettings android={android} /> : <BrowserSoundSettings />;
}

type AndroidAlertStatus = { enabled: boolean; exact: boolean };
function AndroidAlertSettings({ android }: { android: AndroidBridge }) {
  const [status, setStatus] = useState<AndroidAlertStatus>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible")
        android.request<AndroidAlertStatus>("alertStatus").then(setStatus).catch(() => {});
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("habit-grove-android-resumed", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("habit-grove-android-resumed", update);
    };
  }, [android]);

  async function change(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const result = await android.request<AndroidAlertStatus>(action);
      setStatus(result);
      if (action === "testAlert")
        setMessage(result.exact
          ? "Test in 10 seconds. Press Home and lock your phone."
          : "Test queued. Android may delay it until Alarms & reminders is allowed.");
      if (action === "enableAlerts" && !result.enabled)
        setMessage("Allow notifications in Android settings to enable reminders.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change reminders.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sound-settings">
      <strong>Android reminder alerts</strong>
      <div className="choices">
        {!status?.enabled ? (
          <button disabled={busy} onClick={() => void change("enableAlerts")}>Enable Android alerts</button>
        ) : (
          <>
            <button disabled={busy} onClick={() => void change("testAlert")}>Test with app closed</button>
            {!status.exact && <button disabled={busy} onClick={() => void change("exactAlarms")}>Allow on-time alerts</button>}
            <button disabled={busy} onClick={() => void change("alertSettings")}>Android sound settings</button>
            <button disabled={busy} onClick={() => void change("disableAlerts")}>Turn off alerts</button>
          </>
        )}
      </div>
      <small role="status">{message || (status?.enabled && !status.exact
        ? "Allow Alarms & reminders in Android settings for alerts at the scheduled time."
        : "Scheduled alerts use a classic electronic tone with vibration.")}</small>
    </section>
  );
}

function BrowserSoundSettings() {
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
      const test = await deviceRequest("test", sub.endpoint);
      const { delaySeconds } = (await test.json()) as { delaySeconds: number };
      setState(
        `Test scheduled in ${delaySeconds} seconds. Press Home and lock your phone. When you return, tap Check test result.`,
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
  async function checkTest() {
    setBusy(true);
    try {
      const reg = await workerReady();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) throw Error("Enable phone notifications for this device again.");
      const response = await deviceRequest("test-status", sub.endpoint);
      const { state: result, sentAt } = (await response.json()) as TestResult;
      const time = sentAt
        ? new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(sentAt)
        : "";
      setState({
        accepted: `The push service accepted the test at ${time}. If it appeared silently, set Chrome or Habit Grove notifications to Alerting in Android settings.`,
        failed: "The push service failed the test. Turn off alerts, then enable phone notifications again.",
        none: "Send a phone notification test first.",
        queued: "The test is still pending. Check again in a few seconds.",
        unconfirmed: "The server could not confirm the test. Try sending it again.",
      }[result]);
    } catch (error) {
      setState(
        error instanceof Error ? error.message : "Could not check the test result.",
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
            ? "Test with app closed"
            : "Enable phone notifications"}
        </button>
        {background && (
          <button disabled={busy} onClick={checkTest}>
            Check test result
          </button>
        )}
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
