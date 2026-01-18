FROM python:3.11-slim-bookworm

# 1. Install system dependencies
# build-essential is needed for some python packages like uvicorn[standard]
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copy and install dependencies first (for caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy your application code
COPY backend/ ./backend/
COPY eval/ ./eval/

# 4. Set PYTHONPATH so python can find your 'backend' module
ENV PYTHONPATH=/app

# 5. Start the application
# Render automatically injects the PORT environment variable.
# We use shell format ("sh", "-c") to ensure the variable expands correctly.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]