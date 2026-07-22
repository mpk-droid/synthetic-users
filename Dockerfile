# Stage 1: Build the React frontend
FROM node:22-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --ignore-scripts
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend + developer tools for agent mode
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    make \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Node.js for agents evaluating Node-based projects
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml .
RUN pip install --no-cache-dir . docker

COPY backend/ .
COPY --from=frontend-build /build/dist /app/static

RUN chmod +x /app/entrypoint.sh

RUN mkdir -p /workspace

EXPOSE 8000 8080

ENTRYPOINT ["/app/entrypoint.sh"]
