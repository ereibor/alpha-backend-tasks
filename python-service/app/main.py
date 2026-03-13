from fastapi import FastAPI
from contextlib import asynccontextmanager 

from app.api.briefings import router as briefings_router
from app.api.health import router as health_router
from app.api.sample_items import router as sample_items_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Server is running! visit http://127.0.0.1:8000/docs")
    yield
    print("Server shutting down...")


app = FastAPI(title="InsightOps Starter Service", version="0.1.0", lifespan=lifespan)

app.include_router(health_router)
app.include_router(sample_items_router)
app.include_router(briefings_router)

@app.get("/")
def root() -> dict[str, str]:
    return {"service": "InsightOps", "status": "starter-ready"}