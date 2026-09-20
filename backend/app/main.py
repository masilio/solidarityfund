from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.seed import run as seed_run
from app.routers import (auth, users, households, disasters, assessments, support_requests,
                          approvals, distributions, contributions, inventory, reports, audit,)

app = FastAPI(title="Social Solidarity Fund Management System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","https://sfmfront.vercel.app"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, households, disasters, assessments, support_requests, approvals, distributions, contributions, inventory, reports, audit,):
    app.include_router(r.router)


@app.on_event("startup")
def on_startup():
    init_db()
    seed_run()


@app.get("/health")
def health():
    return {"status": "ok"}
