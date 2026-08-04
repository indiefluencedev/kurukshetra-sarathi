/* Push handling, imported into the generated service worker.
 *
 * vite-plugin-pwa runs in generateSW mode, so the service worker is written by
 * Workbox and there is no source file of ours to add a listener to. Rather
 * than switching the whole build to injectManifest for two event handlers,
 * this file is pulled in with `workbox.importScripts` — the precache logic
 * stays generated and untouched, and push lives in twenty readable lines.
 *
 * This file is served as-is from public/, so it must be plain ES5-ish JS: it
 * never passes through the bundler.
 */

self.addEventListener("push", function (event) {
  // A push with no data, or data that will not parse, must still show
  // something. A silent notification is indistinguishable from a broken one,
  // and the visitor already granted permission expecting to be told.
  var payload = { title: "Kurukshetra Saarthi", body: "", url: "/", tag: "kuk" };
  if (event.data) {
    try {
      var d = event.data.json();
      payload.title = d.title || payload.title;
      payload.body = d.body || payload.body;
      payload.url = d.url || payload.url;
      payload.tag = d.tag || payload.tag;
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Same tag replaces rather than stacks: the cron may fire twice for one
      // event, and two identical notifications read as a broken app.
      tag: payload.tag,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: payload.url },
      // The audience is elderly visitors who may have the phone in a pocket.
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";

  // Focus a tab that already has the app rather than opening a second one.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) {
          list[i].navigate && list[i].navigate(target);
          return list[i].focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
