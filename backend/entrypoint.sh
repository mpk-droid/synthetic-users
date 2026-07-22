#!/bin/sh
set -e

case "${SU_ROLE:-orchestrator}" in
  orchestrator)
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
    ;;
  agent)
    exec uvicorn app.agent_server:app --host 0.0.0.0 --port 8080
    ;;
  *)
    echo "SU_ROLE must be 'orchestrator' or 'agent', got: ${SU_ROLE}" >&2
    exit 1
    ;;
esac
