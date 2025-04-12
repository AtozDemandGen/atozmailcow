FROM node:18-alpine

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

EXPOSE 2525

CMD ["node", "index.js"]
