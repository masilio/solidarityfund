# Social Solidarity Fund Management System

A full-stack scaffold implementing the workflow you described end to end:
Response Staff → Resource Management Staff → Authorized Approver →
disbursement, plus Contributor → confirmation → fund inflow, RBAC,
audit logging, and filterable PDF/Excel/Word reporting.

- `backend/`  — FastAPI + SQLModel + PostgreSQL, JWT auth, bcrypt, RBAC, audit log, report engine.
  Every table matches your pasted data dictionary field-for-field (see `backend/README.md`
  "Schema notes" for the two deliberate exceptions, both flagged inline in `app/models.py`).
- `frontend/` — Next.js SPA + Bootstrap + custom CSS. Every entity has list / view / edit / delete
  where the real workflow calls for it, using popup form modals (responsive multi-column layout,
  no scrollbar on typical forms) and toast alerts on every action (success or a specific error
  message, never a silent failure).

Start with `backend/README.md` and `frontend/README.md` for setup steps.

## Deployment options

### Option A — Docker (recommended, one command)
Runs Postgres, the API and the frontend together, each in its own
container.
```bash
cp .env.example .env      # edit JWT_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD
docker compose up --build -d
```
- Frontend: http://localhost:3000
- API + docs: http://localhost:8000/docs
- Postgres data persists in the `sf_db_data` volume between restarts.
- `docker compose logs -f backend` to confirm the admin account was seeded.
- `docker compose down` stops everything; add `-v` to also wipe the database volume.
- To point the frontend at a different API origin (e.g. deploying frontend
  and backend on separate hosts), set `NEXT_PUBLIC_API_URL` in `.env`
  before building — it's baked into the frontend bundle at build time, so
  changing it later requires a rebuild (`docker compose build frontend`).
- For a real deployment, also update `allow_origins` in
  `backend/app/main.py` to your actual frontend domain, and put both
  services behind HTTPS (e.g. a reverse proxy like Caddy or Nginx, or your
  cloud provider's load balancer) rather than exposing them directly.

### Option B — Local (run each service yourself)
```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL to your local/managed Postgres
uvicorn app.main:app --reload --port 8000
# -> creates tables + seeds roles + one ADMINISTRATOR (see .env for creds)

# Frontend (new terminal)
cd frontend && npm install
cp .env.local.example .env.local
npm run dev            # http://localhost:3000
```
This requires a PostgreSQL server already running locally (or reachable)
before you start the backend — Docker Option A provisions one for you.

---
Either way: log in with the seeded administrator, then use **Users &
Roles** to create Response Staff, Resource Management Staff, Approver and
Contributor accounts and assign roles.
