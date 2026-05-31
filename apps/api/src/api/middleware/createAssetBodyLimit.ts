import { bodyLimit } from "hono/body-limit";

export const CREATE_ASSET_BODY_MAX_BYTES = 16 * 1024;

export const createAssetBodyLimit = bodyLimit({
  maxSize: CREATE_ASSET_BODY_MAX_BYTES,
  onError: (c) => c.json({ error: "Request body exceeds the 16 KiB limit" }, 413),
});
