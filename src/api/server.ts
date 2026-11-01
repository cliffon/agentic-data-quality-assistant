import Fastify, { type FastifyInstance } from "fastify";
import type { Suggester } from "../ai/suggester.js";
import { parseJson } from "../input/parseJson.js";
import { InputError } from "../input/errors.js";
import { parseCsv } from "../input/parseCsv.js";
import { analyze } from "../pipeline/analyze.js";

export interface ServerOptions {
  suggester?: Suggester;
  bodyLimit?: number;
}

export function buildServer({ suggester, bodyLimit = 1_048_576 }: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ bodyLimit });

  // We parse JSON ourselves so a bad body is a 400 with our error shape.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(["application/json", "text/csv"], { parseAs: "string" }, (_req, body, done) => done(null, body));

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/v1/analyze", async (req, reply) => {
    try {
      const text = typeof req.body === "string" ? req.body : "";
      const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim();
      const rows = type === "text/csv" ? parseCsv(text) : parseJson(text);
      return await analyze(rows, suggester);
    } catch (e) {
      if (e instanceof InputError) return reply.code(400).send({ error: "invalid_input", detail: e.message });
      throw e;
    }
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found" }));
  app.setErrorHandler((err: { statusCode?: number; code?: string }, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) return reply.code(500).send({ error: "internal_error" }); // never leak stack traces
    return reply.code(status).send({ error: err.code === "FST_ERR_CTP_BODY_TOO_LARGE" ? "payload_too_large" : "bad_request" });
  });
  return app;
}
