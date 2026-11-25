self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/?view=chat"));
});

let lastChime = 0;
self.addEventListener("message", (event) => {
  if (event.data?.type === "grove-chime") lastChime = Date.now();
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const active =
        windows.some((w) => w.visibilityState === "visible") &&
        Date.now() - lastChime < 15 * 60000;
      await self.registration.showNotification("Habit Grove reminder", {
        body: "You have a check-in due. Open your planner to record the actual time.",
        icon: "/icon-192.png",
        tag: "grove-due",
        renotify: !active,
        silent: active,
      });
    })(),
  );
});
