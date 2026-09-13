# Example custom agent environment.
# Extend the published Synthetic Users base image with extra OS packages or tools.
FROM quay.io/rh-ee-mpk/synthetic-users:latest

USER 0
RUN dnf install -y --nodocs golang && dnf clean all
USER 1001
