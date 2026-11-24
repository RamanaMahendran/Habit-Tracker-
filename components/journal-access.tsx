"use client";
import { useState } from "react";
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
    [confirmed, setConfirmed] = useState(false);
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
  async function restore() {
    const key = parseRecoveryCode(input);
    if (!key) {
      setNotice("Enter the full code from your recovery file.");
      return;
    }
    setBusy(true);
    try {
      if (key === (await journalKey())) {
        setNotice("This device already uses that journal.");
        return;
      }
      const response = await journalFetch("/api/journal?after=0", {}, key);
      if (!response.ok) throw Error("Could not check that journal. Try again.");
      const data = (await response.json()) as { events: unknown[] };
      if (!data.events.length)
        throw Error(
          "No saved habits were found for this code. Check the code and try again.",
        );
      if (hasHabits && !confirmed) {
        setNotice(
          "Save this device’s current recovery code before switching journals.",
        );
        return;
      }
      storeJournalKey(key);
      location.reload();
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
          <small>Anyone with this code can access your habits.</small>
        </div>
      )}
      <details>
        <summary>Open an existing journal</summary>
        <label>
          Recovery code
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="HG1-…"
          />
        </label>
        {hasHabits && (
          <label className="confirmkey">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I saved the recovery code for this device’s current journal.
          </label>
        )}
        <button
          className="secondary"
          disabled={busy || !input.trim()}
          onClick={restore}
        >
          Open journal
        </button>
      </details>
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
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
