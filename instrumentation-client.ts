import { initBotId } from "botid/client/core";

// BotID uses Web Crypto (e.g. importKey). Browsers only expose crypto.subtle in a
// secure context (HTTPS, or localhost / loopback). Plain http://<public-ip> is not
// secure — init would throw and break chat. Server-side checkBotId is already optional.
if (
  typeof globalThis !== "undefined" &&
  "isSecureContext" in globalThis &&
  globalThis.isSecureContext === true
) {
  initBotId({
    protect: [
      {
        path: "/api/chat",
        method: "POST",
      },
    ],
  });
}
