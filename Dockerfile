FROM python:3.11-slim-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency file
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your actual code
COPY backend/ ./backend/
COPY eval/ ./eval/

# Set Python path
ENV PYTHONPATH=/app

# Run the FastAPI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
