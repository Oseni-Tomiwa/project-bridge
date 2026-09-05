import { createServer } from "node:http";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.API_PORT ?? "3000", 10);

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method === "GET" && request.url === "/capabilities") {
    response.writeHead(200).end(
      JSON.stringify({
        codename: "Project Bridge",
        status: "foundation",
        implemented: ["health endpoint", "provider-neutral contracts"],
        notImplemented: [
          "speech integrations",
          "conversation orchestration",
          "downstream actions",
          "benchmark execution",
        ],
      }),
    );
    return;
  }

  response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, host, () => {
  console.log(`Project Bridge API shell listening at http://${host}:${port}`);
});
