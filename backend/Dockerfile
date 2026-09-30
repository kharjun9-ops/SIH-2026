FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for GDAL, OpenCV, Open3D (EGL/GL/GOMP), and compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libegl1 \
    libglx0 \
    libopengl0 \
    libgomp1 \
    libglib2.0-0 \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Default PORT for Render or local Docker (Render sets $PORT dynamically)
ENV PORT=8000
EXPOSE ${PORT}

# Run FastAPI with uvicorn bound to $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
