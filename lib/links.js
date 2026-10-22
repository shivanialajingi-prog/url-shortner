const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const clientOptions = { appName: 'shortly-url-shortener' };

let clientPromise;
let databasePromise;

function validateLinkInput(body) {
  const originalUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  const customCode = typeof body?.customCode === 'string' ? body.customCode.trim() : '';

  let parsedUrl;
  try {
    parsedUrl = new URL(originalUrl);
  } catch {
    return { error: 'Enter a valid URL.' };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { error: 'Only HTTP and HTTPS links are supported.' };
  }
  if (customCode && !CODE_PATTERN.test(customCode)) {
    return {
      error: 'Custom aliases must be 3–32 characters using letters, numbers, _ or -.',
    };
  }
  return { url: parsedUrl.toString(), customCode };
}

function createCode() {
  return crypto.randomBytes(5).toString('base64url').slice(0, CODE_LENGTH);
}

function isValidCode(code) {
  return CODE_PATTERN.test(code);
}

async function getCollection() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, clientOptions);
    clientPromise = client.connect();
  }
  if (!databasePromise) {
    databasePromise = clientPromise.then((client) => {
      return client.db(process.env.MONGODB_DB || 'shortly');
    });
  }
  const collection = (await databasePromise).collection(
    process.env.MONGODB_COLLECTION || 'links',
  );
  await collection.createIndex({ code: 1 }, { unique: true });
  return collection;
}

async function getRateLimitCollection() {
  if (!databasePromise) await getCollection();
  return (await databasePromise).collection('rate_limits');
}

async function consumeRateLimit(ip) {
  const collection = await getRateLimitCollection();
  await collection.createIndex({ ip: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_WINDOW_MS);
  const result = await collection.findOneAndUpdate(
    { ip },
    [
      {
        $set: {
          count: {
            $cond: [
              { $lte: [{ $ifNull: ['$expiresAt', now]}, now] },
              1,
              { $add: [{ $ifNull: ['$count', 0] }, 1] },
            ],
          },
          expiresAt: {
            $cond: [
              { $lte: [{ $ifNull: ['$expiresAt', now]}, now] },
              expiresAt,
              '$expiresAt',
            ],
          },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' },
  );
  const record = result.value || result;
  return {
    allowed: record.count <= RATE_LIMIT,
    retryAfter: Math.max(1, Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  return (forwardedFor ? forwardedFor.split(',')[0].trim() : request.socket.remoteAddress) || 'unknown';
}

async function getLink(code) {
  return (await getCollection()).findOne({ code });
}

async function saveLink(code, link) {
  try {
    await (await getCollection()).insertOne({ code, ...link });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

module.exports = {
  CODE_PATTERN,
  createCode,
  getLink,
  isValidCode,
  consumeRateLimit,
  getClientIp,
  saveLink,
  validateLinkInput,
};
