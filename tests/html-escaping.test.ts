import { describe, expect, it } from "bun:test";
import { escapeHtml } from "../src/utils.ts";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes ampersands before the entities it introduces", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary titles untouched", () => {
    expect(escapeHtml("Proxmox Container Dashboard")).toBe("Proxmox Container Dashboard");
  });

  it("neutralises a script tag in the dashboard title", () => {
    expect(escapeHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
});
