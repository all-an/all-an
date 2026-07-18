# ---------- Stage 1: build the Angular bundle ----------
FROM node:24-alpine AS frontend
WORKDIR /frontend

# package files first so npm ci is cached until dependencies actually change
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: build the jar with the bundle inside ----------
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build

COPY pom.xml ./
RUN mvn -B dependency:go-offline

COPY src ./src
# Angular's dist becomes Spring Boot's static content, so one jar serves both
COPY --from=frontend /frontend/dist/frontend/browser/ ./src/main/resources/static/
RUN mvn -B clean package -DskipTests

# ---------- Stage 3: runtime ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
COPY --from=backend /build/target/*.jar app.jar
USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
