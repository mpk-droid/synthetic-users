# Stage 1: Build the React frontend
FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS frontend-build

USER 0
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --ignore-scripts
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend + developer tools for agent mode
FROM registry.access.redhat.com/ubi9/python-312:latest

USER 0
RUN dnf install -y --nodocs --allowerasing git make curl nodejs npm && dnf clean all

WORKDIR /opt/app-root/src

COPY backend/pyproject.toml .
RUN pip install --no-cache-dir ".[k8s]" docker

COPY backend/ .
COPY --from=frontend-build /build/dist /opt/app-root/src/static

RUN chmod +x /opt/app-root/src/entrypoint.sh && \
    mkdir -p /tmp/workspace && \
    chown -R 1001:0 /opt/app-root/src

USER 1001

EXPOSE 8000 8080

ENTRYPOINT ["/opt/app-root/src/entrypoint.sh"]
