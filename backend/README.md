# Backend

The backend is an Express API that serves the frontend and stores application data in SQLite.

## Start

```sh
npm install
npm start
```

By default, the application listens on port `3000`. To change it, create `backend/.env` from the repository's `.env.example` and set `PORT`.

The SQLite database is created at `database/club_management.db` on startup. It is local data and should not be committed.

Database migrations in `migrations/` are applied automatically at startup. Club logos and banners are stored as files in `backend/uploads/clubs/` rather than in SQLite; uploads accept JPEG, PNG, and WebP up to 5 MB.

See the [project README](../README.md) for the API endpoint list and full setup instructions.
