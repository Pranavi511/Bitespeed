import * as http from "http";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/identify") {

    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      const data = JSON.parse(body);

      console.log("Incoming request:", data);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "endpoint working" }));
    });
  }
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});