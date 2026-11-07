# FindIt: Smart Lost & Found

This version uses a Node.js and Express server with MongoDB. The browser must open the app through the server at `http://localhost:3000`; do not open `index.html` directly from File Explorer.

## 1. Create a MongoDB database

For a beginner setup, use MongoDB Atlas:

1. Create an Atlas account and a project, then create a free cluster.
2. In **Database Access**, create a database user and password. These are separate from your Atlas website login.
3. In **Network Access**, add your current IP address.
4. Open the cluster's **Connect** screen and copy the Node.js connection string.

Atlas only accepts database connections from IP addresses on the project's access list. Keep the entry limited to your own current IP for local development.

## 2. Set the connection string

In PowerShell, from this project folder, run:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace `MONGODB_URI` with the connection string from Atlas. Replace `<password>` with the database user's password and add the database name `smart_lost_found` before the `?` options, for example:

```text
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/smart_lost_found?retryWrites=true&w=majority
```

If the password contains characters such as `@`, `#`, `/`, or `:`, URL-encode those characters in the URI. Set `JWT_SECRET` to a long random string (at least 32 characters). Keep `.env` private; it is excluded from Git.

## 3. Install and start the app

Run these commands in PowerShell inside the `uptoskill` folder:

```powershell
npm install
npm run dev
```

Wait for `Connected to MongoDB` and `FindIt is running at http://localhost:3000`, then open [http://localhost:3000](http://localhost:3000).

Create an account, log in, then submit a report. User accounts and item reports are saved in MongoDB. The database and collections are created automatically when the first account or report is saved. The app uses `users` and `items` collections in the `smart_lost_found` database.

## What is connected

- Registration and login use Express API routes. Passwords are hashed with bcrypt; the server returns a JWT for the browser session.
- Public reports load from `GET /api/items`.
- Creating a report sends it to `POST /api/items`; a valid login is required.
- Optional images up to 1 MB are stored as data in the MongoDB item document for this learning project.

This is a learning project. For production, use a secure cookie-based session or carefully protect browser tokens, store images in object storage, and add rate limits and account recovery.

## Deploy on Render

The Express server serves both the pages and the API, so deploy this as one Render **Web Service**.

1. Create a GitHub repository for this project. In PowerShell, run these commands from the `uptoskill` folder:

   ```powershell
   git init
   git add .
   git status --short
   ```

   Check that `.env` and `node_modules` are not listed. Then commit and push the project to your new GitHub repository:

   ```powershell
   git commit -m "Prepare FindIt for deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Replace the GitHub URL with the URL for your repository. The `.gitignore` file excludes `.env` and `node_modules`; never upload `.env` to GitHub.

2. In Render, choose **New → Web Service**, connect your GitHub account, and select this repository.
3. Use these service settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. In the Render service's **Environment** settings, add `MONGODB_URI` with the Atlas connection string and `JWT_SECRET` with a long random secret. Do not set these in frontend files or commit them to GitHub. Render sets `PORT` automatically.
5. Allow the Render service to reach MongoDB Atlas. In Render, open the service and use **Connect → Outbound** to view its outbound IP ranges. Add the listed ranges to the Atlas project's **Network Access** IP access list. Atlas blocks connections from IPs that are not on that list.
6. Click **Deploy**. When the deploy finishes, open the Render `onrender.com` URL, create an account, and submit a report. Confirm the report appears in Atlas Data Explorer under `smart_lost_found` → `items`.

Render's free service may sleep when idle and take longer to respond on the next visit. See Render's current [Web Services documentation](https://render.com/docs/web-services) and [environment variable guide](https://render.com/docs/configure-environment-variables) for current plan and deployment details.
