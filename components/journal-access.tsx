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
      if (!(await hasSavedData(key))) {
        setNotice(
          "This code opens an empty journal. Copy the code from the browser that shows your habits.",
        );
        return;
      }
      const currentKey = await journalKey();
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
      <p>
        This device remembers your private cloud journal. Save its recovery code
        to open it on another device or after clearing browser data.
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
          <small>Anyone with this code can access your habits.</small>
        </div>
      )}
      <form className="recover-journal" onSubmit={restore}>
        <h3>Open an existing journal</h3>
        <p>Use the code from the device where your habits appear.</p>
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
        {notice && <p role="status">{notice}</p>}
      </form>
      <details open={legacyAvailable || undefined}>
        <summary>Bring over habits from version 1.0</summary>
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
