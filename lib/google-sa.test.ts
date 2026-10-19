import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { serviceAccountToken, parseServiceAccount } from "./google-sa";

describe("conta de servico", () => {
  it("assina um JWT RS256 valido e troca-o por um token", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    let assertion = "";
    vi.stubGlobal("fetch", async (_url: string, init: any) => {
      assertion = new URLSearchParams(init.body).get("assertion")!;
      return new Response(JSON.stringify({ access_token: "ya29.x", expires_in: 3600 }), { status: 200 });
    });
    const r = await serviceAccountToken(JSON.stringify({ client_email: "bot@p.iam.gserviceaccount.com", private_key: pem }));
    expect(r.token).toBe("ya29.x");
    const [h, c, sig] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toMatchObject({ iss: "bot@p.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token" });
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("rejeita JSON invalido", () => {
    expect(parseServiceAccount("{}")).toBeNull();
    expect(parseServiceAccount("nao e json")).toBeNull();
  });
});
