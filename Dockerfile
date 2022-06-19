FROM node:16.3.0-alpine
RUN apk add  --no-cache ffmpeg


# Create app directory
WORKDIR /home/github/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --legacy-peer-deps
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

CMD [ "npm", "run", "dev" ]
