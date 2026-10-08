import "./environment";
import { voices } from "../lib/voices";
import { validateVapiConfiguration } from "../lib/vapi";
import { AppError } from "../lib/errors";
const keys = [
  "BETTER_AUTH_SECRET",
  "MONGODB_URI",
  "BLOB_READ_WRITE_TOKEN",
  "VAPI_PRIVATE_KEY",
  "VAPI_ASSISTANT_ID",
  "VAPI_MODEL_ID",
  "VAPI_WEBHOOK_SECRET",
  "APP_BASE_URL",
];
const missing = keys.filter((k) => !process.env[k]);
let configuredVoices: string[] = [];
let invalid: string | undefined;
try {
  configuredVoices = voices().map((v) => v.id);
  if (!missing.length) validateVapiConfiguration();
} catch (error) {
  invalid =
    error instanceof AppError
      ? error.message
      : "Invalid service configuration.";
}
console.log({ missing, configuredVoices, ...(invalid ? { invalid } : {}) });
if (missing.length || !configuredVoices.length || invalid) process.exitCode = 1;
