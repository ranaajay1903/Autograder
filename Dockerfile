# Use Node 20 as it is more stable for build environments than Node 24
FROM node:20-bookworm

# Install the Java Development Kit (JDK) for javac support
RUN apt-get update && apt-get install -y default-jdk

WORKDIR /usr/src/app

# Copy root package files
COPY package*.json ./

# Copy backend and frontend package files to install dependencies first (caching)
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Use your root script to install all dependencies
RUN npm run install-all

# Copy the rest of the source code
COPY . .

# Build the frontend (as defined in your root package.json)
RUN npm run build

# Expose the backend port
EXPOSE 5000

# Start the application using your root start script
CMD ["npm", "start"]