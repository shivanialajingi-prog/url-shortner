require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const {
  createCode,
  consumeRateLimit,
  getClientIp,
  getLink,
  isValidCode,
  saveLink,
  validateLinkInput,
} = require('./lib/links');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || 'localhost';
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const extension = path.extname(filePath);
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
    response.end(content);
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) reject(new Error('Request body is too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function createShortLink(request, response) {
  try {
    const input = validateLinkInput(JSON.parse(await readRequestBody(request)));
    if (input.error) return sendJson(response, 400, { error: input.error });

    let code = input.customCode || createCode();
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
      if (!input.customCode && attempt > 0) code = createCode();
      saved = await saveLink(code, { url: input.url, createdAt: new Date().toISOString() });
    }
    if (!saved) {
      return sendJson(response, input.customCode ? 409 : 503, {
        error: input.customCode ? 'That alias is already in use.' : 'Could not allocate a unique short code.',
      });
    }
    const host = request.headers.host || `${HOST}:${PORT}`;
    sendJson(response, 201, { code, shortUrl: `http://${host}/${code}`, url: input.url });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(response, 400, { error: 'Request must contain valid JSON.' });
    console.error('Could not create short link:', error.message);
    sendJson(response, 503, { error: 'MongoDB storage is not configured or unavailable.' });
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (request.method === 'POST' && requestUrl.pathname === '/api/shorten') {
    try {
      const limit = await consumeRateLimit(getClientIp(request));
      if (!limit.allowed) {
        response.setHeader('Retry-After', String(limit.retryAfter));
        sendJson(response, 429, { error: 'Too many requests. Try again shortly.' });
        return;
      }
    } catch (error) {
      console.error('Could not check rate limit:', error.message);
      sendJson(response, 503, { error: 'MongoDB storage is not configured or unavailable.' });
      return;
    }
    await createShortLink(request, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname !== '/') {
    const code = requestUrl.pathname.slice(1);
    if (isValidCode(code)) {
      try {
        const link = await getLink(code);
        if (link) {
          response.writeHead(302, { Location: link.url });
          response.end();
          return;
        }
      } catch (error) {
        console.error('Could not resolve short link:', error.message);
        response.writeHead(503);
        response.end('MongoDB storage is not configured or unavailable.');
        return;
      }
    }
  }
  if (request.method === 'GET') return serveStatic(response, requestUrl.pathname);
  sendJson(response, 405, { error: 'Method not allowed.' });
});

server.listen(PORT, HOST, () => {
  console.log(`URL shortener running at http://${HOST}:${PORT}`);
});
