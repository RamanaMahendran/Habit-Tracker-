export async function owner(req: Request) {
  const key = req.headers.get("x-habit-journal-key");
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return null;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return (
    "journal:" +
    Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
