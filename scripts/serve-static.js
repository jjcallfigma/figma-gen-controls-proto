#!/usr/bin/env node

const http = require("http");
const path = require("path");
const fs = require("fs");
const url = require("url");

// Parse command line arguments
const args = process.argv.slice(2);
const basePath =
  args.find((arg) => arg.startsWith("--base-path="))?.split("=")[1] || "";
const port = parseInt(
  args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || "3000"
);
const help = args.includes("--help") || args.includes("-h");

if (help) {
  console.log(`
Usage: node scripts/serve-static.js [options]

Options:
  --base-path=<path>     Base path that was used during build (e.g., --base-path=/frame-labels)
  --port=<number>        Port to serve on (default: 3000)
  --help, -h             Show this help message

Examples:
  node scripts/serve-static.js
  node scripts/serve-static.js --base-path=/frame-labels
  node scripts/serve-static.js --base-path=/frame-labels --port=8080

Note: The base-path should match what was used during the build process.
`);
  process.exit(0);
}

const outDir = path.join(__dirname, "..", "out");

// Check if out directory exists
if (!fs.existsSync(outDir)) {
  console.error(
    '❌ Error: "out" directory not found. Please run the build first:'
  );
  console.error("   npm run build:static");
  console.error("   or");
  console.error("   node scripts/build-static.js");
  process.exit(1);
}

console.log("🚀 Starting static file server...");
console.log(`📁 Serving files from: ${outDir}`);
if (basePath) {
  console.log(`🔗 Base path: ${basePath}`);
}
console.log(`🌐 Port: ${port}`);

// MIME type mapping
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;

  // Handle root redirect to base path
  if (basePath && pathname === "/") {
    res.writeHead(302, { Location: basePath + "/" });
    res.end();
    return;
  }

  // Remove base path from pathname if present
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length);
  } else if (basePath) {
    // If base path is set but pathname doesn't start with it, return 404
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(
      "<h1>404 - Not Found</h1><p>This site is served at " + basePath + "</p>"
    );
    return;
  }

  // Default to index.html for directories
  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  // Remove leading slash
  if (pathname.startsWith("/")) {
    pathname = pathname.slice(1);
  }

  const filePath = path.join(outDir, pathname);

  // Security check - make sure we're serving from outDir
  const resolvedPath = path.resolve(filePath);
  const resolvedOutDir = path.resolve(outDir);

  if (!resolvedPath.startsWith(resolvedOutDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // Try to serve 404.html if it exists
      const notFoundPath = path.join(outDir, "404.html");
      fs.access(notFoundPath, fs.constants.F_OK, (err404) => {
        if (!err404) {
          fs.readFile(notFoundPath, (readErr, data) => {
            if (!readErr) {
              res.writeHead(404, { "Content-Type": "text/html" });
              res.end(data);
            } else {
              res.writeHead(404, { "Content-Type": "text/plain" });
              res.end("404 - File Not Found");
            }
          });
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 - File Not Found");
        }
      });
      return;
    }

    // File exists, serve it
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 - Internal Server Error");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });
});

server.listen(port, () => {
  if (basePath) {
    console.log(`✅ Server started successfully!`);
    console.log(`🔗 Open your browser to: http://localhost:${port}${basePath}`);
  } else {
    console.log(`✅ Server started successfully!`);
    console.log(`🔗 Open your browser to: http://localhost:${port}`);
  }
  console.log("");
  console.log("Press Ctrl+C to stop the server");
});
