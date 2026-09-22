# syntax=docker/dockerfile:1
#
# Web app image: the Vite build served by nginx, which also forwards /api to the API so that the browser sees a single
# origin (first-party cookies, no CORS). The build context is the REPOSITORY ROOT:
#   docker build -f frontend/Dockerfile -t capacity-connect-web .
#
# To host the web app and the API on different origins instead, build with
#   --build-arg VITE_API_URL=https://api.example.gov.in/api
# and set COOKIE_SAMESITE / COOKIE_SECURE / FRONTEND_URL on the API accordingly (see docs/deployment.md).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY frontend ./frontend
ARG VITE_API_URL=
ARG VITE_SHOW_DEMO_ACCOUNTS=false
ENV VITE_API_URL=$VITE_API_URL VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN npm run build -w frontend

FROM nginx:1.27-alpine
# nginx renders templates in /etc/nginx/templates with the environment on start; only API_* and CSP_* variables are
# substituted, so nginx's own $variables are left alone.
ENV API_UPSTREAM=api:4000 \
    CSP_EXTRA_ORIGINS= \
    NGINX_ENVSUBST_FILTER=^(API|CSP)_
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
