# Shortly URL Shortener

Shortly is a small URL shortener built with Node.js, MongoDB, HTML, CSS, and
browser JavaScript. It accepts HTTP or HTTPS URLs, generates short codes, and
optionally supports custom aliases.

## Live application

**Production URL:** <https://url-shortner-tan-iota.vercel.app/>

Production link creation and redirects require the MongoDB environment
variables described below.

## Features

1. Shorten HTTP and HTTPS URLs.
2. Generate random six character URL safe codes.
3. Choose aliases from 3–32 letters, numbers, hyphens, or underscores.
4. Redirect short links with HTTP 302 responses.
5. Copy generated URLs from the browser.
6. Use the same MongoDB storage locally and on Vercel.
7. Limit each client IP address to 10 create requests per minute.

## Run locally

Install dependencies and start the server:

```bash
npm install
npm start
```

Open <http://localhost:3000/>.

The included `.env` file is a safe placeholder. Replace its `MONGODB_URI`
with your real MongoDB Atlas connection string before running the app:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=shortly
MONGODB_COLLECTION=links
PORT=3000
HOST=localhost
```

Never commit a real MongoDB URI. `.env` is ignored by Git.

## MongoDB Atlas setup

1. Create a free MongoDB Atlas cluster at <https://www.mongodb.com/atlas>.
2. Create a database user and password.
3. Choose **Connect → Drivers → Node.js** and copy the connection string.
4. Replace the username, password, and cluster host in `.env`.
5. In **Network Access**, add your development IP address.
6. For a temporary deployment test, `0.0.0.0/0` allows connections from Vercel,
   but use stricter network controls where possible.

The application creates the `links` collection, its unique `code` index, and
the rate limit collection automatically.

## Vercel deployment

In Vercel Project Settings → Environment Variables, add these variables for
Production:

```text
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=shortly
MONGODB_COLLECTION=links
```

Then redeploy. Do not put the MongoDB URI in browser code or commit it to
GitHub.

Verify the deployment:

```bash
curl -i -X POST https://url-shortner-tan-iota.vercel.app/api/shorten \
  -H 'content-type: application/json' \
  --data '{"url":"https://example.com"}'
```

## API

### Create a short link

```http
POST /api/shorten
Content-Type: application/json
```

Request:

```json
{
  "url": "https://example.com/a-long-path",
  "customCode": "example"
}
```

`customCode` is optional. A successful response is `201 Created`:

```json
{
  "code": "example",
  "shortUrl": "https://your-domain.example/example",
  "url": "https://example.com/a-long-path"
}
```

The API returns `400` for invalid input, `409` for an occupied custom alias,
`405` for unsupported methods, `429` when the client IP exceeds the rate
limit, and `503` when MongoDB is unavailable.

## Rate limiting

The create endpoint allows 10 requests from each client IP address during a
60 second window. MongoDB stores the counters, so the limit is shared across
Vercel serverless instances. Expired counters are removed automatically by a
MongoDB TTL index. A rejected request includes a `Retry After` response header.

## Project structure

```text
.
├── api/
│   ├── redirect.js       # Vercel redirect function
│   └── shorten.js        # Vercel create-link function
├── lib/
│   └── links.js          # Validation and MongoDB helpers
├── public/
│   ├── app.js            # Form submission and copy behavior
│   ├── index.html        # Application markup
│   └── styles.css        # Application styles
├── server.js             # Local Node.js HTTP server
└── vercel.json           # Clean short-link rewrite
```

## Limitations

1. There is no authentication.
2. Anyone can reserve an available custom alias.
3. Links do not expire automatically.
4. Add URL safety checks, analytics, and deletion controls before using this as
   a public service.
