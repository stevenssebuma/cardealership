"use strict";

import fs from "node:fs";
import nodePath from "node:path";
import crypto from "node:crypto";
import { sanitizeImageFilename } from "../../utils/validateImageUpload.js";
import { fileURLToPath } from "node:url";
const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));

export const createLocalImageStorage = (options = {}) => {
  const storageRoot = nodePath.resolve(options.storageRoot || nodePath.join(__dirname, "../../uploads/cars"));
  const publicPrefix = options.publicPrefix || "/uploads/cars";

  const resolveStoragePath = (storageKey) => {
    const resolvedPath = nodePath.resolve(storageRoot, storageKey);
    if (resolvedPath !== storageRoot && !resolvedPath.startsWith(`${storageRoot}${nodePath.sep}`)) {
      throw new Error("Unsafe storage path rejected.");
    }
    return resolvedPath;
  };

  const store = async (file) => {
    const vehicleSegment = String(file.vehicleId).replace(/[^A-Za-z0-9_-]/g, "");
    const clientSegment = String(file.clientFileId).replace(/[^A-Za-z0-9_-]/g, "");
    const safeFileName = sanitizeImageFilename(file.fileName);
    const uniquePrefix = crypto.randomUUID();
    const storageKey = nodePath.join(vehicleSegment, `${uniquePrefix}-${clientSegment}-${safeFileName}`);
    const destinationPath = resolveStoragePath(storageKey);

    await fs.promises.mkdir(nodePath.dirname(destinationPath), { recursive: true });
    await fs.promises.writeFile(destinationPath, file.buffer, { flag: "wx" });

    return Object.freeze({
      storageKey,
      url: `${publicPrefix}/${storageKey.split(nodePath.sep).map(encodeURIComponent).join("/")}`
    });
  };

  const remove = async (storageKey) => {
    const storagePath = resolveStoragePath(storageKey);
    try {
      await fs.promises.unlink(storagePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };

  return Object.freeze({
    store,
    remove,
    resolveStoragePath
  });
};
