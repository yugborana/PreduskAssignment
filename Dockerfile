FROM python:3.11-slim-bookworm

# 1. Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copy and install dependencies first (for caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy the folders
# Note: Ensure these folders have __init__.py files
COPY backend/ ./backend/
COPY eval/ ./eval/

# 4. Set PYTHONPATH to the current working directory
ENV PYTHONPATH=/app

# 5. Use the list format for CMD and dynamic PORT
# Railway automatically assigns a PORT environment variable
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]