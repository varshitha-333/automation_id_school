/* ============================================================
 * setupProxy.js  —  Frontend → Flask backend proxy (CRA / Webpack 5)
 * ============================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * 1. Removes the CRA console warnings:
 *      DEP_WEBPACK_DEV_SERVER_ON_AFTER_SETUP_MIDDLEWARE
 *      DEP_WEBPACK_DEV_SERVER_ON_BEFORE_SETUP_MIDDLEWARE
 *    by using the modern `http-proxy-middleware` API directly.
 *
 * 2. Replaces the noisy "Proxy error: Could not proxy request /api/...
 *    to http://localhost:5000/ (ECONNREFUSED)" stack traces with a
 *    single, friendly one-line message + a clean JSON 503 response,
 *    so the React UI's "Offline" detection works without flooding the
 *    terminal with red errors.
 *
 * HOW TO USE
 * ----------
 *   • Place this file at:  <project-root>/src/setupProxy.js
 *   • Install (once):       npm install --save-dev http-proxy-middleware
 *   • Make sure package.json contains NO top-level "proxy" field
 *     (or set it to "http://localhost:5000" — either works; this file
 *     wins when present).
 *   • Start Flask on port 5000 (or set BACKEND_URL env var to override).
 *   • Then `npm start` for the React app.
 *
 * ENV OVERRIDES
 * -------------
 *   BACKEND_URL=http://127.0.0.1:5000   # default
 *   You can also point at a remote dev server, e.g.
 *   BACKEND_URL=https://my-staging.example.com  npm start
 * ============================================================ */

/* ============================================================
 * setupProxy.js  —  Frontend → Flask backend proxy (CRA / Webpack 5)
 * ============================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * 1. Removes the CRA console warnings:
 *      DEP_WEBPACK_DEV_SERVER_ON_AFTER_SETUP_MIDDLEWARE
 *      DEP_WEBPACK_DEV_SERVER_ON_BEFORE_SETUP_MIDDLEWARE
 *    by using the modern `http-proxy-middleware` API directly.
 *
 * 2. Replaces the noisy "Proxy error: Could not proxy request /api/...
 *    to http://localhost:5000/ (ECONNREFUSED)" stack traces with a
 *    single, friendly one-line message + a clean JSON 503 response,
 *    so the React UI's "Offline" detection works without flooding the
 *    terminal with red errors.
 *
 * 3. FIX: Large PDF downloads (13 MB+) were failing with
 *    net::ERR_FAILED 200 (OK) — the server sent all bytes successfully
 *    but the CRA proxy dropped the response mid-stream because:
 *      a) Node's http.IncomingMessage has a default highWaterMark of
 *         16 KB — too small for large binary blobs. We raise it to 8 MB.
 *      b) http-proxy-middleware was compressing/decompressing the stream
 *         via its built-in selfHandleResponse. We disable that for /file
 *         endpoints so the raw bytes pass through untouched.
 *
 * HOW TO USE
 * ----------
 *   • Place this file at:  <project-root>/src/setupProxy.js
 *   • Install (once):       npm install --save-dev http-proxy-middleware
 *   • Make sure package.json contains NO top-level "proxy" field
 *     (or set it to "http://localhost:5000" — either works; this file
 *     wins when present).
 *   • Start Flask on port 5000 (or set BACKEND_URL env var to override).
 *   • Then `npm start` for the React app.
 *
 * ENV OVERRIDES
 * -------------
 *   BACKEND_URL=http://127.0.0.1:5000   # default
 *   You can also point at a remote dev server, e.g.
 *   BACKEND_URL=https://my-staging.example.com  npm start
 * ============================================================ */

const { createProxyMiddleware } = require('http-proxy-middleware');

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000';

// How large a PDF can be before we warn in the proxy log.
// Current largest observed: ~15 MB (700 students). Set headroom to 100 MB.
const LARGE_RESPONSE_WARN_BYTES = 100 * 1024 * 1024;

let lastErrorLog = 0;
function logBackendDown(reqUrl, err) {
  // Throttle: log at most once every 5 s so a polling endpoint
  // (e.g. /api/system/stats every 2 s) doesn't spam the console.
  const now = Date.now();
  if (now - lastErrorLog < 5000) return;
  lastErrorLog = now;
  // eslint-disable-next-line no-console
  console.warn(
    `[proxy] Backend ${BACKEND} is unreachable (${err.code || err.message}).` +
    `  ➜  Start Flask:  python app.py   (waiting for ${reqUrl} ...)`
  );
}

module.exports = function (app) {

  // ── PDF file download proxy ───────────────────────────────────────────────
  // Separate rule for /api/jobs/*/file endpoints — these return large binary
  // blobs (up to ~100 MB). We use selfHandleResponse=false so the raw bytes
  // are piped straight through without any buffering or decompression by
  // http-proxy-middleware. This fixes net::ERR_FAILED 200 (OK) on large PDFs.
  app.use(
    /^\/api\/jobs\/[^/]+\/file$/,
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      ws: false,
      logLevel: 'warn',
      selfHandleResponse: false,   // ← KEY FIX: stream bytes directly, no buffering
      proxyTimeout: 10 * 60 * 1000,
      timeout:      10 * 60 * 1000,
      on: {
        proxyReq(proxyReq, req) {
          // Remove Accept-Encoding so Flask sends uncompressed bytes.
          // Compressed streams are fine for JSON but for a pre-compressed
          // PDF they just add CPU overhead and can confuse the proxy pipe.
          proxyReq.setHeader('Accept-Encoding', 'identity');
          // eslint-disable-next-line no-console
          console.log(`[proxy-pdf] → ${req.method} ${req.url}`);
        },
        proxyRes(proxyRes, req, res) {
          const cl = parseInt(proxyRes.headers['content-length'] || '0', 10);
          // eslint-disable-next-line no-console
          console.log(
            `[proxy-pdf] ← ${proxyRes.statusCode} | content-length=${cl} bytes (${(cl/1024/1024).toFixed(2)} MB) | url=${req.url}`
          );
          if (cl > LARGE_RESPONSE_WARN_BYTES) {
            // eslint-disable-next-line no-console
            console.warn(`[proxy-pdf] ⚠ Very large response (${(cl/1024/1024).toFixed(1)} MB) — streaming through`);
          }
          // Set a large highWaterMark on the response socket so Node's
          // stream machinery doesn't back-pressure and drop bytes on
          // large binary payloads.
          if (res.socket) {
            res.socket._writableState && (res.socket._writableState.highWaterMark = 8 * 1024 * 1024);
          }
        },
        error(err, req, res) {
          // eslint-disable-next-line no-console
          console.error(`[proxy-pdf] ERROR on ${req.url}:`, err.message);
          if (res.headersSent) { try { res.end(); } catch (_) {} return; }
          res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: false, error: 'proxy_pdf_error', message: err.message }));
        },
      },
    })
  );

  // ── All other /api/* routes ───────────────────────────────────────────────
  app.use(
    '/api',
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      ws: false,
      logLevel: 'warn',
      // Long downloads (multi-page PDF, ZIP of cards) must not time out.
      proxyTimeout: 10 * 60 * 1000,   // 10 min
      timeout:      10 * 60 * 1000,
      onError(err, req, res) {
        logBackendDown(req.url, err);
        if (res.headersSent) {
          try { res.end(); } catch (_) {}
          return;
        }
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({
          ok: false,
          error: 'backend_unreachable',
          backend: BACKEND,
          hint: 'Start the Flask backend (python app.py) on port 5000.',
        }));
      },
    })
  );
};