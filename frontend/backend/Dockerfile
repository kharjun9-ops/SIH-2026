# Stage 1: Build the React/Vite Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend + Full-Stack Host
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
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code and datasets
COPY backend ./backend

# Ensure /app/data exists and links to backend/data
RUN ln -sf /app/backend/data /app/data

# Copy built frontend assets from Stage 1 into frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

WORKDIR /app/backend

# Default PORT for Render (Render sets $PORT dynamically)
ENV PORT=8000
EXPOSE ${PORT}

# Run FastAPI with uvicorn bound to $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
