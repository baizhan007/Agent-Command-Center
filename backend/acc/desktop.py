"""Run the local API for the packaged ACC desktop application."""

import os

import uvicorn

from acc.main import app


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("ACC_API_PORT", "8765")), log_level="warning")
