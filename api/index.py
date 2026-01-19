import sys
import os

# Temporary fix for .env encoding issues - REMOVED: Using .env file directly now
# os.environ["DATABASE_URL"] = ...
# os.environ["BETTER_AUTH_SECRET"] = ...
# os.environ["OPENROUTER_API_KEY"] = ...
# os.environ["GOOGLE_API_KEY"] = ...

from dotenv import load_dotenv

# Add the current directory to sys.path to prioritize local modules
current_dir = os.path.dirname(os.path.abspath(__file__))

# Explicitly load .env file
env_path = os.path.join(current_dir, '.env')
load_dotenv(env_path)
print(f"Loaded env from {env_path}")
print(f"OPENROUTER_API_KEY available: {'Yes' if os.getenv('OPENROUTER_API_KEY') else 'No'}")

sys.path.insert(0, current_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1.endpoints import tasks, auth, chat, conversations
from core.config import settings


from sqlmodel import SQLModel
from database.session import engine

# Disable redirect_slashes to avoid 307 redirects that cause CORS issues
app = FastAPI(title="Todo API", version="1.0.0", redirect_slashes=False)


@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)


# Add CORS middleware - must be added before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Include API routes
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["conversations"])


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.get("/")
def root():
    return {"message": "Welcome to the Todo API"}