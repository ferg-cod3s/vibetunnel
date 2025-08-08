(() => {
  // src/client/sw.ts
  var NOTIFICATION_TAG_PREFIX = "vibetunnel-";
  self.addEventListener("install", (_event) => {
    console.log("[SW] Installing service worker");
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    console.log("[SW] Activating service worker");
    event.waitUntil(
      // Take control of all pages
      self.clients.claim()
    );
  });
  self.addEventListener("push", (event) => {
    console.log("[SW] Push event received");
    if (!event.data) {
      console.warn("[SW] Push event has no data");
      return;
    }
    let payload;
    try {
      payload = event.data.json();
    } catch (error) {
      console.error("[SW] Failed to parse push payload:", error);
      return;
    }
    event.waitUntil(handlePushNotification(payload));
  });
  self.addEventListener("notificationclick", (event) => {
    console.log("[SW] Notification clicked:", event.notification.tag);
    event.notification.close();
    const data = event.notification.data;
    event.waitUntil(handleNotificationClick(event.action, data));
  });
  self.addEventListener("notificationclose", (event) => {
    console.log("[SW] Notification closed:", event.notification.tag);
    const data = event.notification.data;
    if (data.type === "session-exit" || data.type === "session-error") {
    }
  });
  async function handlePushNotification(payload) {
    const { title, body, icon, badge, data, actions, tag, requireInteraction } = payload;
    try {
      const notificationOptions = {
        body,
        icon: icon || "/apple-touch-icon.png",
        badge: badge || "/favicon-32.png",
        data,
        tag: tag || `${NOTIFICATION_TAG_PREFIX}${data.type}-${Date.now()}`,
        requireInteraction: requireInteraction || data.type === "session-error",
        silent: false,
        // @ts-expect-error - renotify is a valid option but not in TypeScript types
        renotify: true,
        actions: actions || getDefaultActions(data),
        timestamp: data.timestamp
      };
      if ("vibrate" in navigator) {
        notificationOptions.vibrate = getVibrationPattern(data.type);
      }
      await self.registration.showNotification(title, notificationOptions);
      console.log("[SW] Notification shown:", title);
    } catch (error) {
      console.error("[SW] Failed to show notification:", error);
    }
  }
  function getDefaultActions(data) {
    const baseActions = [
      {
        action: "dismiss",
        title: "Dismiss"
      }
    ];
    switch (data.type) {
      case "session-exit":
      case "session-error":
      case "session-start":
      case "command-finished":
      case "command-error": {
        return [
          {
            action: "view-session",
            title: "View Session"
          },
          ...baseActions
        ];
      }
      case "system-alert": {
        return [
          {
            action: "view-logs",
            title: "View Logs"
          },
          ...baseActions
        ];
      }
      default:
        return baseActions;
    }
  }
  function getVibrationPattern(notificationType) {
    switch (notificationType) {
      case "session-error":
      case "command-error":
        return [200, 100, 200, 100, 200];
      // Urgent pattern
      case "session-exit":
        return [100, 50, 100];
      // Short notification
      case "session-start":
        return [50];
      // Very brief
      case "command-finished":
        return [75, 50, 75];
      // Medium notification
      case "system-alert":
        return [150, 75, 150];
      // Moderate pattern
      default:
        return [100];
    }
  }
  async function handleNotificationClick(action, data) {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    for (const client of clients) {
      if (client.url.includes(self.location.origin)) {
        try {
          await client.focus();
          client.postMessage({
            type: "notification-action",
            action,
            data
          });
          return;
        } catch (error) {
          console.warn("[SW] Failed to focus client:", error);
        }
      }
    }
    let url = self.location.origin;
    switch (action) {
      case "view-session": {
        if (data.type === "session-exit" || data.type === "session-error" || data.type === "session-start" || data.type === "command-finished" || data.type === "command-error") {
          url += `/session/${data.sessionId}`;
        }
        break;
      }
      case "view-logs": {
        url += "/logs";
        break;
      }
      default:
        break;
    }
    try {
      await self.clients.openWindow(url);
    } catch (error) {
      console.error("[SW] Failed to open window:", error);
    }
  }
  self.addEventListener("message", (event) => {
    const { data } = event;
    switch (data.type) {
      case "CLEAR_NOTIFICATIONS": {
        clearAllNotifications();
        break;
      }
      case "SKIP_WAITING": {
        self.skipWaiting();
        break;
      }
    }
  });
  async function clearAllNotifications() {
    try {
      const notifications = await self.registration.getNotifications();
      for (const notification of notifications) {
        if (notification.tag?.startsWith(NOTIFICATION_TAG_PREFIX)) {
          notification.close();
        }
      }
      console.log("[SW] Cleared all VibeTunnel notifications");
    } catch (error) {
      console.error("[SW] Failed to clear notifications:", error);
    }
  }
  console.log("[SW] Service worker loaded");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2NsaWVudC9zdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8vIDxyZWZlcmVuY2Ugbm8tZGVmYXVsdC1saWI9XCJ0cnVlXCIgLz5cbi8vLyA8cmVmZXJlbmNlIGxpYj1cImVzMjAyMFwiIC8+XG4vLy8gPHJlZmVyZW5jZSBsaWI9XCJ3ZWJ3b3JrZXJcIiAvPlxuXG5kZWNsYXJlIGNvbnN0IHNlbGY6IFNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmV4cG9ydCB7fTtcblxuLy8gTm90aWZpY2F0aW9uIHRhZyBwcmVmaXggZm9yIFZpYmVUdW5uZWwgbm90aWZpY2F0aW9uc1xuY29uc3QgTk9USUZJQ0FUSU9OX1RBR19QUkVGSVggPSAndmliZXR1bm5lbC0nO1xuXG4vLyBUeXBlcyBmb3IgcHVzaCBub3RpZmljYXRpb24gcGF5bG9hZHNcbmludGVyZmFjZSBTZXNzaW9uRXhpdERhdGEge1xuICB0eXBlOiAnc2Vzc2lvbi1leGl0JztcbiAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gIHNlc3Npb25OYW1lPzogc3RyaW5nO1xuICBjb21tYW5kPzogc3RyaW5nO1xuICBleGl0Q29kZTogbnVtYmVyO1xuICBkdXJhdGlvbj86IG51bWJlcjtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXNzaW9uU3RhcnREYXRhIHtcbiAgdHlwZTogJ3Nlc3Npb24tc3RhcnQnO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgc2Vzc2lvbk5hbWU/OiBzdHJpbmc7XG4gIGNvbW1hbmQ/OiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2Vzc2lvbkVycm9yRGF0YSB7XG4gIHR5cGU6ICdzZXNzaW9uLWVycm9yJztcbiAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gIHNlc3Npb25OYW1lPzogc3RyaW5nO1xuICBjb21tYW5kPzogc3RyaW5nO1xuICBlcnJvcjogc3RyaW5nO1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFN5c3RlbUFsZXJ0RGF0YSB7XG4gIHR5cGU6ICdzeXN0ZW0tYWxlcnQnO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGxldmVsOiAnaW5mbycgfCAnd2FybmluZycgfCAnZXJyb3InO1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENvbW1hbmRGaW5pc2hlZERhdGEge1xuICB0eXBlOiAnY29tbWFuZC1maW5pc2hlZCc7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICBjb21tYW5kOiBzdHJpbmc7XG4gIGV4aXRDb2RlOiBudW1iZXI7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ29tbWFuZEVycm9yRGF0YSB7XG4gIHR5cGU6ICdjb21tYW5kLWVycm9yJztcbiAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gIGNvbW1hbmQ6IHN0cmluZztcbiAgZXhpdENvZGU6IG51bWJlcjtcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbnR5cGUgTm90aWZpY2F0aW9uRGF0YSA9XG4gIHwgU2Vzc2lvbkV4aXREYXRhXG4gIHwgU2Vzc2lvblN0YXJ0RGF0YVxuICB8IFNlc3Npb25FcnJvckRhdGFcbiAgfCBTeXN0ZW1BbGVydERhdGFcbiAgfCBDb21tYW5kRmluaXNoZWREYXRhXG4gIHwgQ29tbWFuZEVycm9yRGF0YTtcblxuaW50ZXJmYWNlIFB1c2hOb3RpZmljYXRpb25QYXlsb2FkIHtcbiAgdGl0bGU6IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBpY29uPzogc3RyaW5nO1xuICBiYWRnZT86IHN0cmluZztcbiAgZGF0YTogTm90aWZpY2F0aW9uRGF0YTtcbiAgYWN0aW9ucz86IEFycmF5PHtcbiAgICBhY3Rpb246IHN0cmluZztcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIGljb24/OiBzdHJpbmc7XG4gIH0+O1xuICB0YWc/OiBzdHJpbmc7XG4gIHJlcXVpcmVJbnRlcmFjdGlvbj86IGJvb2xlYW47XG59XG5cbi8vIEluc3RhbGwgZXZlbnRcbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignaW5zdGFsbCcsIChfZXZlbnQ6IEV4dGVuZGFibGVFdmVudCkgPT4ge1xuICBjb25zb2xlLmxvZygnW1NXXSBJbnN0YWxsaW5nIHNlcnZpY2Ugd29ya2VyJyk7XG5cbiAgLy8gRm9yY2UgYWN0aXZhdGlvbiBvZiBuZXcgc2VydmljZSB3b3JrZXJcbiAgc2VsZi5za2lwV2FpdGluZygpO1xufSk7XG5cbi8vIEFjdGl2YXRlIGV2ZW50XG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2FjdGl2YXRlJywgKGV2ZW50OiBFeHRlbmRhYmxlRXZlbnQpID0+IHtcbiAgY29uc29sZS5sb2coJ1tTV10gQWN0aXZhdGluZyBzZXJ2aWNlIHdvcmtlcicpO1xuXG4gIGV2ZW50LndhaXRVbnRpbChcbiAgICAvLyBUYWtlIGNvbnRyb2wgb2YgYWxsIHBhZ2VzXG4gICAgc2VsZi5jbGllbnRzLmNsYWltKClcbiAgKTtcbn0pO1xuXG4vLyBQdXNoIGV2ZW50IC0gaGFuZGxlIGluY29taW5nIHB1c2ggbm90aWZpY2F0aW9uc1xuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdwdXNoJywgKGV2ZW50OiBQdXNoRXZlbnQpID0+IHtcbiAgY29uc29sZS5sb2coJ1tTV10gUHVzaCBldmVudCByZWNlaXZlZCcpO1xuXG4gIGlmICghZXZlbnQuZGF0YSkge1xuICAgIGNvbnNvbGUud2FybignW1NXXSBQdXNoIGV2ZW50IGhhcyBubyBkYXRhJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IHBheWxvYWQ6IFB1c2hOb3RpZmljYXRpb25QYXlsb2FkO1xuXG4gIHRyeSB7XG4gICAgcGF5bG9hZCA9IGV2ZW50LmRhdGEuanNvbigpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tTV10gRmFpbGVkIHRvIHBhcnNlIHB1c2ggcGF5bG9hZDonLCBlcnJvcik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgZXZlbnQud2FpdFVudGlsKGhhbmRsZVB1c2hOb3RpZmljYXRpb24ocGF5bG9hZCkpO1xufSk7XG5cbi8vIE5vdGlmaWNhdGlvbiBjbGljayBldmVudCAtIGhhbmRsZSB1c2VyIGludGVyYWN0aW9uc1xuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdub3RpZmljYXRpb25jbGljaycsIChldmVudDogTm90aWZpY2F0aW9uRXZlbnQpID0+IHtcbiAgY29uc29sZS5sb2coJ1tTV10gTm90aWZpY2F0aW9uIGNsaWNrZWQ6JywgZXZlbnQubm90aWZpY2F0aW9uLnRhZyk7XG5cbiAgZXZlbnQubm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cbiAgY29uc3QgZGF0YSA9IGV2ZW50Lm5vdGlmaWNhdGlvbi5kYXRhIGFzIE5vdGlmaWNhdGlvbkRhdGE7XG5cbiAgZXZlbnQud2FpdFVudGlsKGhhbmRsZU5vdGlmaWNhdGlvbkNsaWNrKGV2ZW50LmFjdGlvbiwgZGF0YSkpO1xufSk7XG5cbi8vIE5vdGlmaWNhdGlvbiBjbG9zZSBldmVudCAtIHRyYWNrIGRpc21pc3NhbHNcbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignbm90aWZpY2F0aW9uY2xvc2UnLCAoZXZlbnQ6IE5vdGlmaWNhdGlvbkV2ZW50KSA9PiB7XG4gIGNvbnNvbGUubG9nKCdbU1ddIE5vdGlmaWNhdGlvbiBjbG9zZWQ6JywgZXZlbnQubm90aWZpY2F0aW9uLnRhZyk7XG5cbiAgY29uc3QgZGF0YSA9IGV2ZW50Lm5vdGlmaWNhdGlvbi5kYXRhIGFzIE5vdGlmaWNhdGlvbkRhdGE7XG5cbiAgLy8gT3B0aW9uYWw6IFNlbmQgYW5hbHl0aWNzIG9yIGNsZWFudXBcbiAgaWYgKGRhdGEudHlwZSA9PT0gJ3Nlc3Npb24tZXhpdCcgfHwgZGF0YS50eXBlID09PSAnc2Vzc2lvbi1lcnJvcicpIHtcbiAgICAvLyBDb3VsZCB0cmFjayBub3RpZmljYXRpb24gZGlzbWlzc2FsIG1ldHJpY3NcbiAgfVxufSk7XG5cbi8vIE5vIGJhY2tncm91bmQgc3luYyBuZWVkZWRcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlUHVzaE5vdGlmaWNhdGlvbihwYXlsb2FkOiBQdXNoTm90aWZpY2F0aW9uUGF5bG9hZCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IHRpdGxlLCBib2R5LCBpY29uLCBiYWRnZSwgZGF0YSwgYWN0aW9ucywgdGFnLCByZXF1aXJlSW50ZXJhY3Rpb24gfSA9IHBheWxvYWQ7XG5cbiAgdHJ5IHtcbiAgICAvLyBDcmVhdGUgbm90aWZpY2F0aW9uIG9wdGlvbnNcbiAgICBjb25zdCBub3RpZmljYXRpb25PcHRpb25zOiBOb3RpZmljYXRpb25PcHRpb25zID0ge1xuICAgICAgYm9keSxcbiAgICAgIGljb246IGljb24gfHwgJy9hcHBsZS10b3VjaC1pY29uLnBuZycsXG4gICAgICBiYWRnZTogYmFkZ2UgfHwgJy9mYXZpY29uLTMyLnBuZycsXG4gICAgICBkYXRhLFxuICAgICAgdGFnOiB0YWcgfHwgYCR7Tk9USUZJQ0FUSU9OX1RBR19QUkVGSVh9JHtkYXRhLnR5cGV9LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgcmVxdWlyZUludGVyYWN0aW9uOiByZXF1aXJlSW50ZXJhY3Rpb24gfHwgZGF0YS50eXBlID09PSAnc2Vzc2lvbi1lcnJvcicsXG4gICAgICBzaWxlbnQ6IGZhbHNlLFxuICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIHJlbm90aWZ5IGlzIGEgdmFsaWQgb3B0aW9uIGJ1dCBub3QgaW4gVHlwZVNjcmlwdCB0eXBlc1xuICAgICAgcmVub3RpZnk6IHRydWUsXG4gICAgICBhY3Rpb25zOiBhY3Rpb25zIHx8IGdldERlZmF1bHRBY3Rpb25zKGRhdGEpLFxuICAgICAgdGltZXN0YW1wOiBkYXRhLnRpbWVzdGFtcCxcbiAgICB9O1xuXG4gICAgLy8gQWRkIHZpYnJhdGlvbiBwYXR0ZXJuIGZvciBtb2JpbGUgZGV2aWNlc1xuICAgIGlmICgndmlicmF0ZScgaW4gbmF2aWdhdG9yKSB7XG4gICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIC0gdmlicmF0ZSBpcyBhIHZhbGlkIG9wdGlvbiBidXQgbm90IGluIFR5cGVTY3JpcHQgdHlwZXNcbiAgICAgIG5vdGlmaWNhdGlvbk9wdGlvbnMudmlicmF0ZSA9IGdldFZpYnJhdGlvblBhdHRlcm4oZGF0YS50eXBlKTtcbiAgICB9XG5cbiAgICAvLyBTaG93IHRoZSBub3RpZmljYXRpb25cbiAgICBhd2FpdCBzZWxmLnJlZ2lzdHJhdGlvbi5zaG93Tm90aWZpY2F0aW9uKHRpdGxlLCBub3RpZmljYXRpb25PcHRpb25zKTtcblxuICAgIGNvbnNvbGUubG9nKCdbU1ddIE5vdGlmaWNhdGlvbiBzaG93bjonLCB0aXRsZSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW1NXXSBGYWlsZWQgdG8gc2hvdyBub3RpZmljYXRpb246JywgZXJyb3IpO1xuICB9XG59XG5cbmludGVyZmFjZSBOb3RpZmljYXRpb25BY3Rpb24ge1xuICBhY3Rpb246IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZ2V0RGVmYXVsdEFjdGlvbnMoZGF0YTogTm90aWZpY2F0aW9uRGF0YSk6IE5vdGlmaWNhdGlvbkFjdGlvbltdIHtcbiAgY29uc3QgYmFzZUFjdGlvbnM6IE5vdGlmaWNhdGlvbkFjdGlvbltdID0gW1xuICAgIHtcbiAgICAgIGFjdGlvbjogJ2Rpc21pc3MnLFxuICAgICAgdGl0bGU6ICdEaXNtaXNzJyxcbiAgICB9LFxuICBdO1xuXG4gIHN3aXRjaCAoZGF0YS50eXBlKSB7XG4gICAgY2FzZSAnc2Vzc2lvbi1leGl0JzpcbiAgICBjYXNlICdzZXNzaW9uLWVycm9yJzpcbiAgICBjYXNlICdzZXNzaW9uLXN0YXJ0JzpcbiAgICBjYXNlICdjb21tYW5kLWZpbmlzaGVkJzpcbiAgICBjYXNlICdjb21tYW5kLWVycm9yJzoge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgIGFjdGlvbjogJ3ZpZXctc2Vzc2lvbicsXG4gICAgICAgICAgdGl0bGU6ICdWaWV3IFNlc3Npb24nLFxuICAgICAgICB9LFxuICAgICAgICAuLi5iYXNlQWN0aW9ucyxcbiAgICAgIF07XG4gICAgfVxuICAgIGNhc2UgJ3N5c3RlbS1hbGVydCc6IHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhY3Rpb246ICd2aWV3LWxvZ3MnLFxuICAgICAgICAgIHRpdGxlOiAnVmlldyBMb2dzJyxcbiAgICAgICAgfSxcbiAgICAgICAgLi4uYmFzZUFjdGlvbnMsXG4gICAgICBdO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGJhc2VBY3Rpb25zO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldFZpYnJhdGlvblBhdHRlcm4obm90aWZpY2F0aW9uVHlwZTogc3RyaW5nKTogbnVtYmVyW10ge1xuICBzd2l0Y2ggKG5vdGlmaWNhdGlvblR5cGUpIHtcbiAgICBjYXNlICdzZXNzaW9uLWVycm9yJzpcbiAgICBjYXNlICdjb21tYW5kLWVycm9yJzpcbiAgICAgIHJldHVybiBbMjAwLCAxMDAsIDIwMCwgMTAwLCAyMDBdOyAvLyBVcmdlbnQgcGF0dGVyblxuICAgIGNhc2UgJ3Nlc3Npb24tZXhpdCc6XG4gICAgICByZXR1cm4gWzEwMCwgNTAsIDEwMF07IC8vIFNob3J0IG5vdGlmaWNhdGlvblxuICAgIGNhc2UgJ3Nlc3Npb24tc3RhcnQnOlxuICAgICAgcmV0dXJuIFs1MF07IC8vIFZlcnkgYnJpZWZcbiAgICBjYXNlICdjb21tYW5kLWZpbmlzaGVkJzpcbiAgICAgIHJldHVybiBbNzUsIDUwLCA3NV07IC8vIE1lZGl1bSBub3RpZmljYXRpb25cbiAgICBjYXNlICdzeXN0ZW0tYWxlcnQnOlxuICAgICAgcmV0dXJuIFsxNTAsIDc1LCAxNTBdOyAvLyBNb2RlcmF0ZSBwYXR0ZXJuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBbMTAwXTsgLy8gRGVmYXVsdCBicmllZiB2aWJyYXRpb25cbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVOb3RpZmljYXRpb25DbGljayhhY3Rpb246IHN0cmluZywgZGF0YTogTm90aWZpY2F0aW9uRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBjbGllbnRzID0gYXdhaXQgc2VsZi5jbGllbnRzLm1hdGNoQWxsKHtcbiAgICB0eXBlOiAnd2luZG93JyxcbiAgICBpbmNsdWRlVW5jb250cm9sbGVkOiB0cnVlLFxuICB9KTtcblxuICAvLyBUcnkgdG8gZm9jdXMgZXhpc3Rpbmcgd2luZG93IGZpcnN0XG4gIGZvciAoY29uc3QgY2xpZW50IG9mIGNsaWVudHMpIHtcbiAgICBpZiAoY2xpZW50LnVybC5pbmNsdWRlcyhzZWxmLmxvY2F0aW9uLm9yaWdpbikpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5mb2N1cygpO1xuXG4gICAgICAgIC8vIFNlbmQgYWN0aW9uIHRvIHRoZSBjbGllbnRcbiAgICAgICAgY2xpZW50LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICB0eXBlOiAnbm90aWZpY2F0aW9uLWFjdGlvbicsXG4gICAgICAgICAgYWN0aW9uLFxuICAgICAgICAgIGRhdGEsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW1NXXSBGYWlsZWQgdG8gZm9jdXMgY2xpZW50OicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBObyBleGlzdGluZyB3aW5kb3csIG9wZW4gYSBuZXcgb25lXG4gIGxldCB1cmwgPSBzZWxmLmxvY2F0aW9uLm9yaWdpbjtcblxuICBzd2l0Y2ggKGFjdGlvbikge1xuICAgIGNhc2UgJ3ZpZXctc2Vzc2lvbic6IHtcbiAgICAgIGlmIChcbiAgICAgICAgZGF0YS50eXBlID09PSAnc2Vzc2lvbi1leGl0JyB8fFxuICAgICAgICBkYXRhLnR5cGUgPT09ICdzZXNzaW9uLWVycm9yJyB8fFxuICAgICAgICBkYXRhLnR5cGUgPT09ICdzZXNzaW9uLXN0YXJ0JyB8fFxuICAgICAgICBkYXRhLnR5cGUgPT09ICdjb21tYW5kLWZpbmlzaGVkJyB8fFxuICAgICAgICBkYXRhLnR5cGUgPT09ICdjb21tYW5kLWVycm9yJ1xuICAgICAgKSB7XG4gICAgICAgIHVybCArPSBgL3Nlc3Npb24vJHtkYXRhLnNlc3Npb25JZH1gO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3ZpZXctbG9ncyc6IHtcbiAgICAgIHVybCArPSAnL2xvZ3MnO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBKdXN0IG9wZW4gdGhlIG1haW4gcGFnZVxuICAgICAgYnJlYWs7XG4gIH1cblxuICB0cnkge1xuICAgIGF3YWl0IHNlbGYuY2xpZW50cy5vcGVuV2luZG93KHVybCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW1NXXSBGYWlsZWQgdG8gb3BlbiB3aW5kb3c6JywgZXJyb3IpO1xuICB9XG59XG5cbi8vIE5vIG9mZmxpbmUgbm90aWZpY2F0aW9uIGhhbmRsaW5nIG5lZWRlZFxuXG4vLyBObyBmZXRjaCBldmVudCBoYW5kbGVyIG5lZWRlZCAtIHdlIGRvbid0IGNhY2hlIGFueXRoaW5nXG5cbi8vIE1lc3NhZ2UgaGFuZGxlciBmb3IgY29tbXVuaWNhdGlvbiB3aXRoIG1haW4gdGhyZWFkXG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQ6IEV4dGVuZGFibGVNZXNzYWdlRXZlbnQpID0+IHtcbiAgY29uc3QgeyBkYXRhIH0gPSBldmVudDtcblxuICBzd2l0Y2ggKGRhdGEudHlwZSkge1xuICAgIGNhc2UgJ0NMRUFSX05PVElGSUNBVElPTlMnOiB7XG4gICAgICAvLyBDbGVhciBhbGwgVmliZVR1bm5lbCBub3RpZmljYXRpb25zXG4gICAgICBjbGVhckFsbE5vdGlmaWNhdGlvbnMoKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdTS0lQX1dBSVRJTkcnOiB7XG4gICAgICBzZWxmLnNraXBXYWl0aW5nKCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbn0pO1xuXG4vLyBObyBxdWV1ZWluZyBuZWVkZWRcblxuYXN5bmMgZnVuY3Rpb24gY2xlYXJBbGxOb3RpZmljYXRpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBhd2FpdCBzZWxmLnJlZ2lzdHJhdGlvbi5nZXROb3RpZmljYXRpb25zKCk7XG5cbiAgICBmb3IgKGNvbnN0IG5vdGlmaWNhdGlvbiBvZiBub3RpZmljYXRpb25zKSB7XG4gICAgICBpZiAobm90aWZpY2F0aW9uLnRhZz8uc3RhcnRzV2l0aChOT1RJRklDQVRJT05fVEFHX1BSRUZJWCkpIHtcbiAgICAgICAgbm90aWZpY2F0aW9uLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ1tTV10gQ2xlYXJlZCBhbGwgVmliZVR1bm5lbCBub3RpZmljYXRpb25zJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW1NXXSBGYWlsZWQgdG8gY2xlYXIgbm90aWZpY2F0aW9uczonLCBlcnJvcik7XG4gIH1cbn1cblxuY29uc29sZS5sb2coJ1tTV10gU2VydmljZSB3b3JrZXIgbG9hZGVkJyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQVFBLE1BQU0sMEJBQTBCO0FBK0VoQyxPQUFLLGlCQUFpQixXQUFXLENBQUMsV0FBNEI7QUFDNUQsWUFBUSxJQUFJLGdDQUFnQztBQUc1QyxTQUFLLFlBQVk7QUFBQSxFQUNuQixDQUFDO0FBR0QsT0FBSyxpQkFBaUIsWUFBWSxDQUFDLFVBQTJCO0FBQzVELFlBQVEsSUFBSSxnQ0FBZ0M7QUFFNUMsVUFBTTtBQUFBO0FBQUEsTUFFSixLQUFLLFFBQVEsTUFBTTtBQUFBLElBQ3JCO0FBQUEsRUFDRixDQUFDO0FBR0QsT0FBSyxpQkFBaUIsUUFBUSxDQUFDLFVBQXFCO0FBQ2xELFlBQVEsSUFBSSwwQkFBMEI7QUFFdEMsUUFBSSxDQUFDLE1BQU0sTUFBTTtBQUNmLGNBQVEsS0FBSyw2QkFBNkI7QUFDMUM7QUFBQSxJQUNGO0FBRUEsUUFBSTtBQUVKLFFBQUk7QUFDRixnQkFBVSxNQUFNLEtBQUssS0FBSztBQUFBLElBQzVCLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSxzQ0FBc0MsS0FBSztBQUN6RDtBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQVUsdUJBQXVCLE9BQU8sQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFHRCxPQUFLLGlCQUFpQixxQkFBcUIsQ0FBQyxVQUE2QjtBQUN2RSxZQUFRLElBQUksOEJBQThCLE1BQU0sYUFBYSxHQUFHO0FBRWhFLFVBQU0sYUFBYSxNQUFNO0FBRXpCLFVBQU0sT0FBTyxNQUFNLGFBQWE7QUFFaEMsVUFBTSxVQUFVLHdCQUF3QixNQUFNLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDN0QsQ0FBQztBQUdELE9BQUssaUJBQWlCLHFCQUFxQixDQUFDLFVBQTZCO0FBQ3ZFLFlBQVEsSUFBSSw2QkFBNkIsTUFBTSxhQUFhLEdBQUc7QUFFL0QsVUFBTSxPQUFPLE1BQU0sYUFBYTtBQUdoQyxRQUFJLEtBQUssU0FBUyxrQkFBa0IsS0FBSyxTQUFTLGlCQUFpQjtBQUFBLElBRW5FO0FBQUEsRUFDRixDQUFDO0FBSUQsaUJBQWUsdUJBQXVCLFNBQWlEO0FBQ3JGLFVBQU0sRUFBRSxPQUFPLE1BQU0sTUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLLG1CQUFtQixJQUFJO0FBRTdFLFFBQUk7QUFFRixZQUFNLHNCQUEyQztBQUFBLFFBQy9DO0FBQUEsUUFDQSxNQUFNLFFBQVE7QUFBQSxRQUNkLE9BQU8sU0FBUztBQUFBLFFBQ2hCO0FBQUEsUUFDQSxLQUFLLE9BQU8sR0FBRyx1QkFBdUIsR0FBRyxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQztBQUFBLFFBQ2hFLG9CQUFvQixzQkFBc0IsS0FBSyxTQUFTO0FBQUEsUUFDeEQsUUFBUTtBQUFBO0FBQUEsUUFFUixVQUFVO0FBQUEsUUFDVixTQUFTLFdBQVcsa0JBQWtCLElBQUk7QUFBQSxRQUMxQyxXQUFXLEtBQUs7QUFBQSxNQUNsQjtBQUdBLFVBQUksYUFBYSxXQUFXO0FBRTFCLDRCQUFvQixVQUFVLG9CQUFvQixLQUFLLElBQUk7QUFBQSxNQUM3RDtBQUdBLFlBQU0sS0FBSyxhQUFhLGlCQUFpQixPQUFPLG1CQUFtQjtBQUVuRSxjQUFRLElBQUksNEJBQTRCLEtBQUs7QUFBQSxJQUMvQyxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0scUNBQXFDLEtBQUs7QUFBQSxJQUMxRDtBQUFBLEVBQ0Y7QUFPQSxXQUFTLGtCQUFrQixNQUE4QztBQUN2RSxVQUFNLGNBQW9DO0FBQUEsTUFDeEM7QUFBQSxRQUNFLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLFlBQVEsS0FBSyxNQUFNO0FBQUEsTUFDakIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSyxpQkFBaUI7QUFDcEIsZUFBTztBQUFBLFVBQ0w7QUFBQSxZQUNFLFFBQVE7QUFBQSxZQUNSLE9BQU87QUFBQSxVQUNUO0FBQUEsVUFDQSxHQUFHO0FBQUEsUUFDTDtBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUssZ0JBQWdCO0FBQ25CLGVBQU87QUFBQSxVQUNMO0FBQUEsWUFDRSxRQUFRO0FBQUEsWUFDUixPQUFPO0FBQUEsVUFDVDtBQUFBLFVBQ0EsR0FBRztBQUFBLFFBQ0w7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUNFLGVBQU87QUFBQSxJQUNYO0FBQUEsRUFDRjtBQUVBLFdBQVMsb0JBQW9CLGtCQUFvQztBQUMvRCxZQUFRLGtCQUFrQjtBQUFBLE1BQ3hCLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFDSCxlQUFPLENBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQUE7QUFBQSxNQUNqQyxLQUFLO0FBQ0gsZUFBTyxDQUFDLEtBQUssSUFBSSxHQUFHO0FBQUE7QUFBQSxNQUN0QixLQUFLO0FBQ0gsZUFBTyxDQUFDLEVBQUU7QUFBQTtBQUFBLE1BQ1osS0FBSztBQUNILGVBQU8sQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBO0FBQUEsTUFDcEIsS0FBSztBQUNILGVBQU8sQ0FBQyxLQUFLLElBQUksR0FBRztBQUFBO0FBQUEsTUFDdEI7QUFDRSxlQUFPLENBQUMsR0FBRztBQUFBLElBQ2Y7QUFBQSxFQUNGO0FBRUEsaUJBQWUsd0JBQXdCLFFBQWdCLE1BQXVDO0FBQzVGLFVBQU0sVUFBVSxNQUFNLEtBQUssUUFBUSxTQUFTO0FBQUEsTUFDMUMsTUFBTTtBQUFBLE1BQ04scUJBQXFCO0FBQUEsSUFDdkIsQ0FBQztBQUdELGVBQVcsVUFBVSxTQUFTO0FBQzVCLFVBQUksT0FBTyxJQUFJLFNBQVMsS0FBSyxTQUFTLE1BQU0sR0FBRztBQUM3QyxZQUFJO0FBQ0YsZ0JBQU0sT0FBTyxNQUFNO0FBR25CLGlCQUFPLFlBQVk7QUFBQSxZQUNqQixNQUFNO0FBQUEsWUFDTjtBQUFBLFlBQ0E7QUFBQSxVQUNGLENBQUM7QUFFRDtBQUFBLFFBQ0YsU0FBUyxPQUFPO0FBQ2Qsa0JBQVEsS0FBSyxnQ0FBZ0MsS0FBSztBQUFBLFFBQ3BEO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFHQSxRQUFJLE1BQU0sS0FBSyxTQUFTO0FBRXhCLFlBQVEsUUFBUTtBQUFBLE1BQ2QsS0FBSyxnQkFBZ0I7QUFDbkIsWUFDRSxLQUFLLFNBQVMsa0JBQ2QsS0FBSyxTQUFTLG1CQUNkLEtBQUssU0FBUyxtQkFDZCxLQUFLLFNBQVMsc0JBQ2QsS0FBSyxTQUFTLGlCQUNkO0FBQ0EsaUJBQU8sWUFBWSxLQUFLLFNBQVM7QUFBQSxRQUNuQztBQUNBO0FBQUEsTUFDRjtBQUFBLE1BQ0EsS0FBSyxhQUFhO0FBQ2hCLGVBQU87QUFDUDtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBRUU7QUFBQSxJQUNKO0FBRUEsUUFBSTtBQUNGLFlBQU0sS0FBSyxRQUFRLFdBQVcsR0FBRztBQUFBLElBQ25DLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSwrQkFBK0IsS0FBSztBQUFBLElBQ3BEO0FBQUEsRUFDRjtBQU9BLE9BQUssaUJBQWlCLFdBQVcsQ0FBQyxVQUFrQztBQUNsRSxVQUFNLEVBQUUsS0FBSyxJQUFJO0FBRWpCLFlBQVEsS0FBSyxNQUFNO0FBQUEsTUFDakIsS0FBSyx1QkFBdUI7QUFFMUIsOEJBQXNCO0FBQ3RCO0FBQUEsTUFDRjtBQUFBLE1BQ0EsS0FBSyxnQkFBZ0I7QUFDbkIsYUFBSyxZQUFZO0FBQ2pCO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGLENBQUM7QUFJRCxpQkFBZSx3QkFBdUM7QUFDcEQsUUFBSTtBQUNGLFlBQU0sZ0JBQWdCLE1BQU0sS0FBSyxhQUFhLGlCQUFpQjtBQUUvRCxpQkFBVyxnQkFBZ0IsZUFBZTtBQUN4QyxZQUFJLGFBQWEsS0FBSyxXQUFXLHVCQUF1QixHQUFHO0FBQ3pELHVCQUFhLE1BQU07QUFBQSxRQUNyQjtBQUFBLE1BQ0Y7QUFFQSxjQUFRLElBQUksMkNBQTJDO0FBQUEsSUFDekQsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLHVDQUF1QyxLQUFLO0FBQUEsSUFDNUQ7QUFBQSxFQUNGO0FBRUEsVUFBUSxJQUFJLDRCQUE0QjsiLAogICJuYW1lcyI6IFtdCn0K
