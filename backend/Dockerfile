# Dockerfile for persistent Node.js backend on Render/Koyeb
FROM node:20-slim

# Install litestream binary (the powerhouse for persistence)
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz

# Set working directory
WORKDIR /app

# Install dependencies (cached if package.json hasn't changed)
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Ensure the DB directory exists and run script is executable
RUN mkdir -p /app/db && chmod +x /app/run.sh

# Environment variables (Defaults for Render/Railway)
ENV PORT=4000
ENV NODE_ENV=production

# Expose the API port
EXPOSE 4000

# Start via the replication script
CMD ["/app/run.sh"]
