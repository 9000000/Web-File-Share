FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and clean cache
RUN npm install --production --omit=dev && \
    npm cache clean --force && \
    rm -rf /tmp/*

# Copy only necessary files
COPY server.js index.html style.css ./

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 37000

# Use non-root user
USER node

# Start server
CMD ["node", "server.js"]
