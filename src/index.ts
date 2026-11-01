import { buildServer } from "./api/server.js";
import { stubSuggester } from "./ai/stubSuggester.js";

const port = Number(process.env["PORT"] ?? 3000);
const app = buildServer({ suggester: stubSuggester });
app.listen({ port, host: "127.0.0.1" }).then(() => console.log(`Item data-quality assistant listening on http://127.0.0.1:${port}`));
