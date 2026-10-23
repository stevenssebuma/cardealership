import assert from "node:assert/strict";
import { AuthApiError, login, register } from "../features/auth/services/authApi";

const user = { id: 7, email: "driver@example.com", name: "Devine Driver", role: "user" };
let receivedUrl = "";
let receivedBody: Record<string, string> = {};

const successfulFetcher: typeof fetch = async (input, init) => {
  receivedUrl = String(input);
  receivedBody = JSON.parse(String(init?.body)) as Record<string, string>;
  return new Response(JSON.stringify({
    success: true,
    message: "Login successful",
    token: "test-access-token",
    user,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

const loginResponse = await login("driver@example.com", "secret", { fetcher: successfulFetcher });
assert.equal(receivedUrl, "/api/auth/login");
assert.deepEqual(receivedBody, { email: "driver@example.com", password: "secret" });
assert.equal(loginResponse.token, "test-access-token");
assert.equal(loginResponse.user.id, "7");

await register("Devine Driver", "driver@example.com", "secret", {
  fetcher: async (input, init) => {
    receivedUrl = String(input);
    receivedBody = JSON.parse(String(init?.body)) as Record<string, string>;
    return new Response(JSON.stringify({
      success: true,
      message: "Registration successful",
      token: "test-registration-token",
      user,
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  },
});
assert.equal(receivedUrl, "/api/auth/register");
assert.deepEqual(receivedBody, { name: "Devine Driver", email: "driver@example.com", password: "secret" });

for (const [status, expectedCode] of [[401, "INVALID_CREDENTIALS"], [500, "AUTH_SERVER_ERROR"]] as const) {
  await assert.rejects(
    login("driver@example.com", "secret", {
      fetcher: async () => new Response(JSON.stringify({ message: "Backend detail" }), { status }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthApiError);
      assert.equal(error.code, expectedCode);
      assert.equal(error.status, status);
      assert.equal(error.message.includes("Backend detail"), status === 401);
      return true;
    },
  );
}

await assert.rejects(
  register("Devine Driver", "driver@example.com", "secret", { fetcher: async () => { throw new Error("offline"); } }),
  (error: unknown) => error instanceof AuthApiError && error.code === "AUTH_REQUEST_FAILED",
);

console.log(JSON.stringify({ suite: "authApi", passed: 10, failed: 0 }, null, 2));
