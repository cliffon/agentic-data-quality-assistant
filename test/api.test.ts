import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { stubSuggester } from "../src/ai/stubSuggester.js";
import { buildServer } from "../src/api/server.js";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const app = buildServer({ suggester: stubSuggester, bodyLimit: 5_000 });
afterAll(() => app.close());

const post = (payload: string, type = "application/json") =>
  app.inject({ method: "POST", url: "/v1/analyze", headers: { "content-type": type }, payload });

describe("API", () => {
  it("GET /health", async () => expect((await app.inject("/health")).json()).toEqual({ status: "ok" }));

  it("analyzes JSON", async () => {
    const res = await post(fixture("sample-input.json"));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.total_rows).toBe(2);
    expect(body.candidates.length).toBe(3);
  });

  it("analyzes CSV (bad row becomes a candidate, not an error)", async () => {
    const res = await post(fixture("sample.csv"), "text/csv");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.total_rows).toBe(4);
    expect(body.candidates.some((c: { issue_type: string; row_index: number }) => c.issue_type === "malformed_row" && c.row_index === 3)).toBe(true);
    expect(body.candidates.some((c: { issue_type: string }) => c.issue_type === "unsupported_unit_of_measure")).toBe(true);
  });

  it("empty array is 200 with nothing", async () => {
    const res = await post("[]");
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates).toEqual([]);
  });

  it.each([["invalid JSON", "{nope"], ["non-array JSON", '{"a":1}'], ["empty body", ""]])("400 for %s", async (_n, payload) => {
    const res = await post(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_input" });
  });

  it("400 for invalid CSV", async () => expect((await post('a,b\n"x,1\n', "text/csv")).statusCode).toBe(400));

  it("413 over the body limit, no stack trace", async () => {
    const res = await post(JSON.stringify(Array(500).fill({ item_id: "1", item_description: "x" })));
    expect(res.statusCode).toBe(413);
    expect(res.body).not.toContain("at ");
  });

  it("415 for unsupported content type", async () => expect((await post("x", "text/plain")).statusCode).toBe(415));
  it("404 for unknown route", async () => expect((await app.inject("/nope")).statusCode).toBe(404));
});
