"use client";
import { useState, type FormEvent } from "react";
import {
  formatRecoveryCode,
  journalKey,
  journalFetch,
  parseRecoveryCode,
  storeJournalKey,
} from "@/lib/journal-key";
import { saveFile } from "@/lib/downloads";

export function JournalAccess({
  hasHabits,
  legacyAvailable,
  onImport,
}: {
  hasHabits: boolean;
  legacyAvailable: boolean;
  onImport: () => Promise<void>;
}) {
  const [input, setInput] = useState(""),
    [manageCode, setManageCode] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [needsBackup, setNeedsBackup] = useState(false);
  async function downloadCode() {
    try {
      const code = formatRecoveryCode(await journalKey());
      saveFile(
        "Habit Grove recovery code\n\n" +
          code +
          "\n\nKeep this private. Anyone with this code can open and change your journal. On another device, open Habit Grove, choose Journal access and enter this code.\n",
        "text/plain;charset=utf-8",
        "habit-grove-recovery.txt",
      );
      setNotice("Recovery file downloaded. Keep it somewhere private.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function hasSavedData(key: string) {
    const response = await journalFetch("/api/journal?after=0", {}, key);
    if (!response.ok)
      throw Error("Could not reach the cloud journal. Try again.");
    const { events } = (await response.json()) as { events?: unknown[] };
    if (!Array.isArray(events))
      throw Error("Could not read the cloud journal. Try again.");
    return events.length > 0;
  }
  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const key = parseRecoveryCode(input);
    if (!key) {
      setNotice(
        "That code is incomplete or invalid. On the device with your habits, open Journal access and copy the full HG1 code.",
      );
      return;
    }
    setBusy(true);
    setNotice("Checking the recovery code…");
    try {
      const currentKey = await journalKey();
      if (!(await hasSavedData(key))) {
        setNotice(
          key === currentKey
            ? "This is the code for this device’s empty journal. Use the code shown on your laptop where your habits are visible."
            : "No data was found for this code. Use the code shown on the device where your habits are visible.",
        );
        return;
      }
      if (key !== currentKey) {
        if (!confirmed && (hasHabits || (await hasSavedData(currentKey)))) {
          setNeedsBackup(true);
          setNotice(
            "Save this device’s recovery code and tick the checkbox to keep access to its journal.",
          );
          return;
        }
        storeJournalKey(key);
      }
      location.replace("/?view=habits");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="journalaccess">
      <div
        className="journal-modes"
        role="group"
        aria-label="Journal access options"
      >
        <button
          aria-pressed={!manageCode}
          onClick={() => {
            setManageCode(false);
            setShown("");
            setNotice("");
          }}
          disabled={busy}
        >
          Open another journal
        </button>
        <button
          aria-pressed={manageCode}
          onClick={() => {
            setManageCode(true);
            setNotice("");
          }}
          disabled={busy}
        >
          This device’s code
        </button>
      </div>
      {manageCode ? (
        <div>
          <p>
            {hasHabits
              ? "Use this code on another device to open your saved habits."
              : "This device currently shows no saved habits. To recover habits from another device, open its journal instead."}
          </p>
          <div className="recoveryactions">
            <button className="primary" onClick={downloadCode}>
              Save recovery code
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  setShown(shown ? "" : formatRecoveryCode(await journalKey()));
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              {shown ? "Hide code" : "Show code"}
            </button>
          </div>
          {shown && (
            <div className="recoverycode">
              <code>{shown}</code>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shown);
                    setNotice("Recovery code copied.");
                  } catch {
                    setNotice(
                      "Select the code above and copy it, or save the recovery file.",
                    );
                  }
                }}
              >
                Copy code
              </button>
              <small>
                Keep this code private. It opens this device’s journal.
              </small>
            </div>
          )}
        </div>
      ) : (
        <form className="recover-journal" onSubmit={restore}>
          <p>
            Paste the recovery code from the browser where your habits are
            visible.
          </p>
          <label>
            Recovery code
            <input
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="go"
              disabled={busy}
              spellCheck={false}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setNotice("");
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                const key = parseRecoveryCode(pasted);
                if (!key) return;
                e.preventDefault();
                setInput(formatRecoveryCode(key));
                setNotice("");
              }}
              placeholder="HG1-…"
            />
          </label>
          {(hasHabits || needsBackup) && (
            <label className="confirmkey">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I saved the recovery code for this device’s current journal.
            </label>
          )}
          <button className="secondary" disabled={busy || !input.trim()}>
            {busy ? "Checking…" : "Open journal"}
          </button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      <details open={legacyAvailable || undefined}>
        <summary>Import an older account-based journal</summary>
        {legacyAvailable ? (
          <>
            <p>Your previous habits are available on this device.</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onImport();
                  setNotice("Previous habits imported.");
                } catch (e) {
                  setNotice((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import previous habits
            </button>
          </>
        ) : (
          <p>
            If you used the original account-based app,{" "}
            <a
              href="/signin-with-chatgpt?return_to=%2F%3Fprevious%3D1"
              target="_top"
            >
              verify your previous account
            </a>{" "}
            once to look for its habits.
          </p>
        )}
      </details>
    </div>
  );
}
