# Use an official node image as the base image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Create uploads directory structure (without contents)
RUN mkdir -p uploads

# Expose the port (Cloud Run sets PORT=8080 automatically)
# Note: EXPOSE is just documentation; the app listens on process.env.PORT
EXPOSE 8080

# Start the application
# Use node directly for better error visibility and faster startup
CMD ["node", "server.js"]