# Dockerfile for Traffic Digital Twin backend (FastAPI)
# Uses python:3.11-slim and installs a CPU TensorFlow wheel to avoid host issues

FROM python:3.11-slim

WORKDIR /app

# Install system deps for pip build wheels if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  wget \
  git \
  && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN python -m pip install --upgrade pip setuptools wheel

# Install runtime Python packages (cpu tf to avoid GPU dependencies)
# Install core runtime packages separately to reduce chance of build problems
RUN pip install fastapi uvicorn[standard] pandas numpy scikit-learn tensorflow-cpu==2.15.0

# Copy app sources
COPY . /app

# Expose port
EXPOSE 8000

# Run the API server
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
