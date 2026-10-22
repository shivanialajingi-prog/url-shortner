const { getLink, isValidCode } = require('../lib/links');

module.exports = async function handler(request, response) {
  const code = request.query.code;
  if (request.method !== 'GET' || typeof code !== 'string' || !isValidCode(code)) {
    return response.status(404).send('Not found');
  }

  try {
    const link = await getLink(code);
    if (!link) return response.status(404).send('Short link not found');
    return response.redirect(302, link.url);
  } catch (error) {
    console.error('Could not resolve short link:', error.message);
    return response.status(503).send('MongoDB storage is not configured or unavailable');
  }
};
