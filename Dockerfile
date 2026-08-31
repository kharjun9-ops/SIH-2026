FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for GDAL, OpenCV, and compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code and data
COPY backend ./backend
COPY data ./data

WORKDIR /app/backend

# Default PORT for Render (Render sets $PORT dynamically)
ENV PORT=8000
EXPOSE ${PORT}

# Run FastAPI with uvicorn bound to $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
