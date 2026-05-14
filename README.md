# jc.cool

A small Node.js + Express link-in-bio app with user accounts and SQLite storage.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Open in browser:

```text
http://localhost:3000
```

## Deploy to Render

1. Push this repository to GitHub.
2. Go to https://render.com and log in.
3. Create a new **Web Service**.
4. Link your GitHub repo.
5. Set the build command to:

```bash
npm install
```

6. Set the start command to:

```bash
npm start
```

7. Ensure Render uses the default port. `server.js` already reads `process.env.PORT`.
8. Deploy.

### Notes

- `server.js` serves both the website and the API.
- `jc_cool.db` is created automatically on first run if it doesn't exist.
- For persistent data on Render, use a managed database or persistent disk if you need long-term storage.

## Share your app

If Render gives you a URL like `https://jc-cool.onrender.com`, send that to your friends.

If you want a custom domain later, you can configure it in Render.
