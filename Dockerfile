# Kenya Watch: one container serving the API, the citizen/staff app and the
# Agency Case Portal. MongoDB is external (for example MongoDB Atlas).

# 1. Build the React app.
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Train the experimental category model from the synthetic corpus and export
#    the runtime file the API reads (about 20 seconds).
FROM python:3.12-slim AS model
WORKDIR /app
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt
COPY ml/src ml/src
COPY ml/data/synthetic ml/data/synthetic
RUN python -m ml.src.train ml/data/synthetic/kenya_watch_synthetic_combined.csv > /dev/null

# 3. Runtime image: API dependencies only.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./
COPY agency-portal/ /app/agency-portal/
COPY --from=frontend /app/frontend/build /app/frontend/build
COPY --from=model /app/ml/artifacts/category_model.runtime.json /app/ml/artifacts/category_model.runtime.json
USER node
EXPOSE 5000
CMD ["node", "index.js"]
