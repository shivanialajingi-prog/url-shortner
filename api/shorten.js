const {
  createCode,
  consumeRateLimit,
  getClientIp,
  saveLink,
  validateLinkInput,
} = require('../lib/links');

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.json(body);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  try {
    const limit = await consumeRateLimit(getClientIp(request));
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfter));
      return sendJson(response, 429, { error: 'Too many requests. Try again shortly.' });
    }
  } catch (error) {
    console.error('Could not check rate limit:', error.message);
    return sendJson(response, 503, { error: 'MongoDB storage is not configured or unavailable.' });
  }

  const input = validateLinkInput(request.body);
  if (input.error) return sendJson(response, 400, { error: input.error });

  try {
    let code = input.customCode || createCode();
    if (input.customCode) {
      if (!(await saveLink(code, { url: input.url, createdAt: new Date().toISOString() }))) {
        return sendJson(response, 409, { error: 'That alias is already in use.' });
      }
    } else {
      let saved = false;
      for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
        code = createCode();
        saved = await saveLink(code, {
          url: input.url,
          createdAt: new Date().toISOString(),
        });
      }
      if (!saved) throw new Error('Could not allocate a unique short code.');
    }

    const host = request.headers.host;
    const protocol = request.headers['x-forwarded-proto'] || 'https';
    return sendJson(response, 201, {
      code,
      shortUrl: `${protocol}://${host}/${code}`,
      url: input.url,
    });
  } catch (error) {
    console.error('Could not create short link:', error.message);
    return sendJson(response, 503, {
      error: 'MongoDB storage is not configured or unavailable.',
    });
  }
};
