import { registerOTel } from "@vercel/otel";

export function register() {
  if (process.env.VERCEL !== "1") {
    return;
  }

  registerOTel({ serviceName: "chatbot" });
}
