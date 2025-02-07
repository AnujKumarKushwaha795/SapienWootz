FROM node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    unzip \
    curl \
    xvfb \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create directory for screenshots
RUN mkdir -p /tmp/screenshots

# Set environment variables
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV DISPLAY=:99

# Add Xvfb init script
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1280x1024x24 &\nexec "$@"' > /entrypoint.sh \
    && chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["node", "src/index.js"] 