# College Event Management System

ClubHub is a small web application for managing college clubs, events, students, and event registrations. It includes a Node.js/Express API, a SQLite database, and a static HTML/CSS/JavaScript frontend.

## Features

- View and manage students, clubs, and events
- Register students for events and manage registrations
- Admin dashboard with summary counts
- SQLite database initialized automatically by the backend

## Requirements

- Node.js 20 or later
- npm

## Run locally

1. Open a terminal in the `backend` directory.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Optionally copy `.env.example` to `.env` and set `PORT` if you want to use a port other than `3000`.
4. Start the server:

   ```sh
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in a browser. The backend serves the frontend and API from the same origin.

The SQLite database is created at `database/club_management.db` when the backend starts. It is intentionally excluded from Git so local student records are not published. On a new setup, the backend creates the tables and inserts sample data if the student table is empty.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET, POST | `/api/students` | List or add students |
| PUT, DELETE | `/api/students/:id` | Update or remove a student |
| GET, POST | `/api/clubs` | List or add clubs |
| PUT, DELETE | `/api/clubs/:id` | Update or remove a club |
| GET, POST | `/api/events` | List or add events |
| PUT, DELETE | `/api/events/:id` | Update or remove an event |
| GET, POST | `/api/registrations` | List or add registrations |
| DELETE | `/api/registrations/:id` | Remove a registration |
| GET | `/api/dashboard` | Get dashboard totals |
| POST | `/api/login` | Demo admin login |

## Project layout

- `backend/` — Express API, SQLite setup, and npm configuration
- `database/schema.sql` — MySQL schema and example seed statements
- `frontend/` — Static web pages, styles, and browser-side code

The running application uses SQLite and initializes its schema in `backend/db.js`. `database/schema.sql` is a separate MySQL schema/reference script.

## Security note

This is a demo project, not production-ready authentication. The admin password is hard-coded and shown in the demo login page. Do not deploy it publicly or use real student information without replacing the authentication and adding appropriate access controls.
