import * as http from "http";
import { processIdentityReconciliation } from "./identify";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/identify") {

    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        console.log("Incoming request:", data);

        const result = await processIdentityReconciliation(data.email, data.phoneNumber);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        console.error("Error processing request:", err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Bad Request" }));
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not Found" }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});