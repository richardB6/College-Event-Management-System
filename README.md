# ClubHub

ClubHub brings campus clubs, events, and student registrations into one university platform. The application has a public discovery experience, a student portal, and a role-protected administration workspace.

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, and Recharts
- **Backend:** Node.js, Express, SQLite, bcrypt password hashing, and persistent HTTP-only sessions
- **Database:** SQLite with versioned, additive migrations

## Run locally

Requirements: Node.js 20+ and npm.

1. Install backend dependencies:

   ```sh
   cd backend
   npm install
   ```

2. Create `backend/.env` from `.env.example`. Set a private session secret (at least 32 characters in production), and adjust `PORT`, `NODE_ENV`, or `USN_PATTERN` if needed. Do not commit `.env`.
3. Install frontend dependencies and build the production UI:

   ```sh
   cd ../client
   npm install
   npm run build
   ```

   Vite writes the build to `frontend/dist`, which is ignored by Git.
4. Start the server:

   ```sh
   cd ../backend
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000).

For frontend development with hot reload, run `npm run dev` from `client` in a second terminal. The Vite development server proxies `/api` requests to the backend on port 3000.

## Accounts and access

- Students create their own account from **Student sign in → Create your student account**. Signup creates a new student record; legacy directory rows are not automatically claimed or assigned credentials.
- Student USNs follow `^2BU[0-9]{2}[A-Z]{2}[0-9]{3}$` by default. Configure a different regular expression with `USN_PATTERN`. Matching this format does **not** verify university enrollment.
- Administrator signup is not public. Provision the first administrator interactively from `backend` with `npm run admin:create`.
- Sessions are stored in SQLite and use HTTP-only, SameSite Strict cookies. State-changing API calls require a CSRF token. Student profile and registration records are restricted to the signed-in student and authorized administrators.

## Database and migrations

The database is `database/club_management.db`. On startup, the backend applies versioned migrations under `backend/migrations/`. The account/session/audit migration adds authentication fields and tables without deleting or rewriting existing club, event, registration, or student records. Existing students remain without accounts until separately registered.

Migration `002_academic_events_registrations.sql` adds the recognized department reference data, club memberships, event schedules and capacity, registration statuses and waitlists, notification storage, scheduling-conflict records, and waitlist settings. Migration `003_academic_years_one_to_four.sql` limits new and updated student records to academic years 1–4. Legacy branch labels are mapped only when they match a known department; other labels are retained and left unassigned.

Back up the database before deploying an application update that runs migrations. The backend seeds the sample campus records only when the student table is empty. The production server checks for expired waitlist offers once per minute; if the process is stopped, expiration processing resumes on startup and on registration-related requests. Notifications are in-app only; email delivery is not configured.

Administrators can change the waitlist confirmation window under **Admin → Settings** (5–1,440 minutes). The setting applies to newly created offers; it does not change deadlines already issued. Club organizers have access only to event and registration data for their assigned club.

## Tests

Run the backend integration tests against isolated in-memory SQLite databases:

```sh
cd backend
npm test
```

Run the frontend tests and production type-check/build:

```sh
cd client
npm test
npm run build
```

## Project layout

- `backend/` — Express API, SQLite initialization and migrations, session store, and administrator provisioning
- `client/` — React application, role-based pages, shared UI, and frontend tests
- `frontend/` — legacy static-page sources plus the generated `dist/` production bundle
- `database/` — local SQLite database and the separate schema reference
