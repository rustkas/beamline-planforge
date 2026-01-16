import { create_app } from "./server";

const port = Number(process.env.PORT ?? 3001);
const app = create_app();

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`api-core listening on http://localhost:${port}`);
