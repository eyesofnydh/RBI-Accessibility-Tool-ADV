# Image for hosting the tester (for example on Render).
# It is Microsoft's Playwright image: Chromium and every system library it needs are already inside.
# The version in this tag must match the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /app

# The browser is already in the image, so npm must not download it again.
ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    A11Y_HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Render sets PORT itself (10000 by default); the app reads it.
EXPOSE 10000

CMD ["npx", "tsx", "src/app.ts", "--no-open"]
