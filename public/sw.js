self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/?view=chat"));
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Habit Grove reminder", {
      body: "Open Habit Grove to view your check-ins.",
      icon: "/icon-192.png",
      tag: "grove-due",
      renotify: true,
      silent: false,
    }),
  );
});
