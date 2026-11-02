# Backend

The backend is an Express API that serves the frontend and stores application data in SQLite.

## Start

```sh
npm install
npm start
```

By default, the application listens on port `3000`. To change it, create `backend/.env` from the repository's `.env.example` and set `PORT`.

The SQLite database is created at `database/club_management.db` on startup. It is local data and should not be committed.

See the [project README](../README.md) for the API endpoint list and full setup instructions.
