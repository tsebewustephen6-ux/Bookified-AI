import { describe, expect, it } from "vitest";
import {
  metadataSchema,
  PDF_LIMIT,
  COVER_LIMIT,
  queryTerms,
  escapeRegex,
} from "../../lib/validation";
import { chunkPages } from "../../lib/chunks";
import { plans, resolvePlan, utcPeriod } from "../../lib/plans";
import { pdfSignature, coverSignature } from "../../lib/storage";
import { appendTranscript } from "../../lib/transcripts";
import { slug } from "../../lib/books";
import { sameOrigin, body, secretEqual } from "../../lib/security";
import { baseUrl } from "../../lib/env";
describe("validation and source contracts", () => {
  const metadata = {
    title: " A book ",
    author: " Someone ",
    personaId: "verified",
    fileSizeBytes: 100,
    idempotencyKey: "d043371b-3210-4f5d-a391-cb775ca45f1e",
  };
  it("trims required metadata and rejects oversize/foreign identity inputs", () => {
    expect(metadataSchema.parse(metadata).title).toBe("A book");
    for (const extra of [
      { ownerId: "foreign" },
      { title: "" },
      { title: "x".repeat(201) },
      { fileSizeBytes: PDF_LIMIT + 1 },
      { coverType: "image/png", coverSizeBytes: COVER_LIMIT + 1 },
    ])
      expect(metadataSchema.safeParse({ ...metadata, ...extra }).success).toBe(
        false,
      );
  });
  it("preserves AI and never generates regex from punctuation", () => {
    expect(queryTerms("AI?")).toEqual(["AI"]);
    expect(queryTerms(".*[]()+")).toEqual([]);
    expect(new RegExp(escapeRegex(".*[]")).test(".*[]")).toBe(true);
  });
  it("chunks with overlap and page provenance", () => {
    const pages = [
      {
        page: 1,
        text: Array.from({ length: 490 }, (_, i) => "w" + i).join(" "),
      },
      {
        page: 2,
        text: Array.from({ length: 510 }, (_, i) => "z" + i).join(" "),
      },
    ];
    const chunks = chunkPages(pages);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].pageEnd).toBe(2);
    expect(chunks[1].content.split(" ").slice(0, 75)).toEqual(
      chunks[0].content.split(" ").slice(-75),
    );
    expect(chunks[2].segmentIndex).toBe(2);
    expect(chunkPages([{ page: 1, text: "   " }])).toEqual([]);
  });
  it("slugs support same titles without collision", () => {
    expect(
      new Set(Array.from({ length: 100 }, () => slug("Same Title"))).size,
    ).toBe(100);
    expect(slug("書")).toMatch(/^book-/);
  });
  it("checks PDF and image signatures", () => {
    expect(pdfSignature(Buffer.from("%PDF-1.7"))).toBe(true);
    expect(pdfSignature(Buffer.from("<html>"))).toBe(false);
    expect(coverSignature(Buffer.from("<svg/>"), "image/png")).toBe(false);
  });
});
describe("plan contracts", () => {
  it("uses UTC calendar boundaries including year transition", () => {
    expect(utcPeriod(new Date("2026-12-31T23:59:59Z")).end.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(
      utcPeriod(new Date("2026-10-01T00:00:00Z")).start.toISOString(),
    ).toBe("2026-10-01T00:00:00.000Z");
  });
  it("resolves pro first and respects canceled paid periods", () => {
    expect(
      resolvePlan([
        { status: "active", plan: { slug: "standard" } },
        { status: "active", plan: { slug: "pro" } },
      ]),
    ).toBe("pro");
    expect(
      resolvePlan(
        [{ status: "canceled", plan: { slug: "pro" }, periodEnd: 2000 }],
        1000,
      ),
    ).toBe("pro");
    expect(
      resolvePlan(
        [{ status: "canceled", plan: { slug: "pro" }, periodEnd: 2000 }],
        2000,
      ),
    ).toBe("free");
    expect(resolvePlan([{ status: "upcoming", plan: { slug: "pro" } }])).toBe(
      "free",
    );
    expect(plans.pro.sessions).toBeNull();
    expect([
      plans.free.duration,
      plans.standard.duration,
      plans.pro.duration,
    ]).toEqual([300, 900, 3600]);
  });
});
describe("boundary controls", () => {
  it("rejects malformed callback configuration without exposing it", () => {
    for (const value of [
      "bad-url",
      "https://user:secret@bookified.example",
      "https://bookified.example/path",
    ]) {
      process.env.APP_BASE_URL = value;
      expect(() => baseUrl()).toThrow("application origin");
    }
  });
  it("rejects cross-origin cookie mutations", () => {
    process.env.APP_BASE_URL = "https://bookified.example";
    expect(() =>
      sameOrigin(
        new Request("https://bookified.example", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://bookified.example", {
          headers: { origin: "https://bookified.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("bounds streamed JSON independently of content-length", async () => {
    await expect(
      body(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ long: "x".repeat(100) }),
        }),
        30,
      ),
    ).rejects.toThrow("too large");
    expect(secretEqual("secret", "secreT")).toBe(false);
  });
  it("keeps partials separate and deduplicates repeated finals", () => {
    let messages = appendTranscript([], {
      type: "transcript",
      role: "user",
      transcriptType: "partial",
      transcript: "what",
    });
    messages = appendTranscript(messages, {
      type: "transcript",
      role: "user",
      transcriptType: "final",
      transcript: "what is AI",
      id: "m1",
    });
    messages = appendTranscript(messages, {
      type: "transcript",
      role: "user",
      transcriptType: "final",
      transcript: "what is AI",
      id: "m1",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].final).toBe(true);
  });
});
