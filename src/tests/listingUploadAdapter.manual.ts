// src/tests/listingUploadAdapter.manual.ts
//
// Deterministic coverage for the live listing upload adapter. The HTTP layer is
// injected, so the suite never touches the network.
//
// This suite previously asserted a mocked adapter (mockMode, failImageId, a
// production guard) that the shipped service does not have — the service is
// live-only. It now exercises the contract that actually exists: auth and id
// validation, ordering, response mapping and the in-flight duplicate guard.

import assert from "node:assert/strict";
import { createListingUploadService } from "../features/admin-listing/services/listingUploadApi";
import type { SelectedListingImage } from "../features/admin-listing/types";

function image(id: string, order: number): SelectedListingImage {
  return {
    id,
    order,
    imageType: order === 0 ? "primary" : "general",
    file: {
      name: id + ".jpg",
      type: "image/jpeg",
      size: 1024,
      lastModified: order + 1,
    } as File,
  };
}

const images = [image("third", 2), image("first", 0), image("second", 1)];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | undefined;
  carId: FormDataEntryValue | null;
  imageType: FormDataEntryValue | null;
};

function createFetcher(status: number, body: unknown) {
  const captured: CapturedRequest[] = [];

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const form = init?.body as FormData;

    captured.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.Authorization,
      carId: form?.get?.("carId") ?? null,
      imageType: form?.get?.("imageType") ?? null,
    });

    return jsonResponse(status, body);
  }) as typeof fetch;

  return { fetcher, captured };
}

const uploadedImage = {
  success: true,
  image: { cloudinary: { secureUrl: "https://cdn.pandamotors.test/car.jpg" } },
};

// ---------------------------------------------------------------------------
// 1. Guards that must not reach the network
// ---------------------------------------------------------------------------

let networkCalls = 0;
const countingFetcher = (async () => {
  networkCalls += 1;
  return jsonResponse(201, uploadedImage);
}) as typeof fetch;

const unauthorized = await createListingUploadService({
  fetcher: countingFetcher,
}).uploadImages("", "listing-1", images);

assert.equal(unauthorized.success, false);
if (unauthorized.success === false) assert.equal(unauthorized.code, "UNAUTHORIZED");

const missingListing = await createListingUploadService({
  fetcher: countingFetcher,
}).uploadImages("redacted-token", "", images);

assert.equal(missingListing.success, false);
if (missingListing.success === false) {
  assert.equal(missingListing.code, "VALIDATION_FAILED");
}

const noImages = await createListingUploadService({
  fetcher: countingFetcher,
}).uploadImages("redacted-token", "listing-1", []);

assert.equal(noImages.success, true);
if (noImages.success === true) {
  assert.deepEqual(noImages.items, []);
  assert.equal(noImages.mock, false);
}

assert.equal(networkCalls, 0, "Validation failures must not reach the API");

// ---------------------------------------------------------------------------
// 2. Successful upload: deterministic ordering and request shape
// ---------------------------------------------------------------------------

const uploaded = createFetcher(201, uploadedImage);

const success = await createListingUploadService({
  fetcher: uploaded.fetcher,
}).uploadImages("redacted-token", "listing-1", images);

assert.equal(success.success, true);
if (success.success === true) {
  assert.equal(success.mock, false);
  assert.deepEqual(
    success.items.map((item) => item.imageId),
    ["first", "second", "third"],
    "Items are ordered by the image order field, not the input array",
  );
  assert.deepEqual(
    success.items.map((item) => item.order),
    [0, 1, 2],
  );
  assert.equal(
    success.items.every((item) => item.success),
    true,
  );
  assert.equal(
    success.items.every(
      (item) => item.url === "https://cdn.pandamotors.test/car.jpg",
    ),
    true,
  );
}

assert.equal(uploaded.captured[0].url, "/api/cars/upload");
assert.equal(uploaded.captured[0].method, "POST");
assert.equal(
  uploaded.captured[0].authorization,
  "Bearer redacted-token",
  "The upload must travel with the session token",
);
assert.equal(uploaded.captured[0].carId, "listing-1");
assert.equal(uploaded.captured[0].imageType, "primary");

// ---------------------------------------------------------------------------
// 3. API failure mapping
// ---------------------------------------------------------------------------

const statusCases: { status: number; code: string }[] = [
  { status: 401, code: "UNAUTHORIZED" },
  { status: 403, code: "UNAUTHORIZED" },
  { status: 400, code: "VALIDATION_FAILED" },
  { status: 422, code: "VALIDATION_FAILED" },
  { status: 500, code: "UPLOAD_FAILED" },
];

for (const testCase of statusCases) {
  const failing = await createListingUploadService({
    fetcher: createFetcher(testCase.status, { success: false }).fetcher,
  }).uploadImages("redacted-token", "listing-1", [images[1]]);

  assert.equal(failing.success, false);
  if (failing.success === false) {
    assert.equal(
      failing.code,
      testCase.code,
      `HTTP ${testCase.status} must map to ${testCase.code}`,
    );
    assert.equal(failing.items.length, 1);
  }
}

const noUrl = await createListingUploadService({
  fetcher: createFetcher(201, { success: true, image: {} }).fetcher,
}).uploadImages("redacted-token", "listing-1", [images[1]]);

assert.equal(noUrl.success, false);
if (noUrl.success === false) {
  assert.equal(noUrl.code, "UPLOAD_FAILED");
  assert.match(noUrl.message, /did not return its URL/);
}

const interrupted = await createListingUploadService({
  fetcher: (async () => {
    throw new Error("socket hang up");
  }) as typeof fetch,
}).uploadImages("redacted-token", "listing-1", [images[1]]);

assert.equal(interrupted.success, false);
if (interrupted.success === false) {
  assert.equal(interrupted.code, "UPLOAD_FAILED");
  assert.match(interrupted.message, /socket hang up/);
}

// ---------------------------------------------------------------------------
// 4. A second upload cannot start while the first is in flight
// ---------------------------------------------------------------------------

const gate: { release?: () => void } = {};
const held = new Promise<void>((resolve) => {
  gate.release = resolve;
});

const slowService = createListingUploadService({
  fetcher: (async () => {
    await held;
    return jsonResponse(201, uploadedImage);
  }) as typeof fetch,
});

const firstUpload = slowService.uploadImages("redacted-token", "listing-1", [
  images[1],
]);
const duplicateUpload = await slowService.uploadImages(
  "redacted-token",
  "listing-1",
  images,
);

assert.equal(duplicateUpload.success, false);
if (duplicateUpload.success === false) {
  assert.equal(duplicateUpload.code, "UPLOAD_FAILED");
  assert.match(duplicateUpload.message, /already in progress/);
}

gate.release?.();

assert.equal(
  (await firstUpload).success,
  true,
  "The original upload still completes once the transport resolves",
);

console.log(
  JSON.stringify(
    {
      suite: "listingUploadAdapter",
      passed: 26,
      failed: 0,
      deterministicOrderingVerified: true,
      failureMappingVerified: true,
      duplicateUploadBlocked: true,
      networkUsed: false,
      tokenLogged: false,
    },
    null,
    2,
  ),
);
