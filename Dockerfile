# Use the official Playwright image as the base image for runtime (includes browsers and system dependencies)
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Set working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Install dependencies and build frontend
RUN npm install
RUN npm run build:client

# Expose the port that the Express app runs on
EXPOSE 3001
ENV PORT=3001

# Command to run the application
CMD ["npm", "start"]
