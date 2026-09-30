FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 5173 10000

CMD ["/bin/sh", "-c", "if [ -n \"$BACKEND_URL\" ]; then sed -i \"s|http://127.0.0.1:8000|$BACKEND_URL|g\" /etc/nginx/conf.d/default.conf; fi; if [ -n \"$PORT\" ]; then sed -i \"s|listen 10000;|listen $PORT;|g\" /etc/nginx/conf.d/default.conf; fi; exec nginx -g 'daemon off;'"]
