const STORAGE = "habit-grove.journal-key.v1";
const PREFIX = "HG1-";
const KEY_PATTERN = /^[0-9a-f]{64}$/;
let startup: Promise<string> | undefined;

export function parseRecoveryCode(input: string): string | null {
  const key = input
    .trim()
    .replace(/^HG1-/i, "")
    .replace(/[\s-]/g, "")
    .toLowerCase();
  return KEY_PATTERN.test(key) ? key : null;
}

export function formatRecoveryCode(key: string) {
  return PREFIX + key.match(/.{1,8}/g)!.join("-");
}

export function storeJournalKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw Error("Invalid journal key.");
  localStorage.setItem(STORAGE, key);
  startup = Promise.resolve(key);
}

export function onJournalSwitch(event: StorageEvent) {
  if (
    (event.key === STORAGE || event.key === null) &&
    event.oldValue !== event.newValue
  )
    location.reload();
}

export function journalKey() {
  if (!startup) {
    const getOrCreate = () => {
      const existing = localStorage.getItem(STORAGE);
      if (existing && KEY_PATTERN.test(existing)) return existing;
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const key = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      localStorage.setItem(STORAGE, key);
      return key;
    };
    startup = (
      navigator.locks
        ? navigator.locks.request(STORAGE, getOrCreate)
        : Promise.resolve().then(getOrCreate)
    ).catch(() => {
      startup = undefined;
      throw Error("Allow browser storage to open your private journal.");
    });
  }
  return startup;
}

export async function journalFetch(
  path: string,
  init: RequestInit = {},
  key?: string,
) {
  const headers = new Headers(init.headers);
  headers.set("X-Habit-Journal-Key", key ?? (await journalKey()));
  return fetch(path, {
    ...init,
    headers,
    cache: "no-store",
    mode: "same-origin",
  });
}
