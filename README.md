# Figma Clone

A DOM-based Figma clone built with Next.js for rapid prototyping. This project prioritizes speed of iteration and team usability over perfect architecture.

Giorgio Caviglia (gcaviglia@figma.com)

## Getting Started

### Development

First, run the development server:

```bash
npm install
npm run dev
# or
yarn install
yarn dev
# or
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Importing Figma Files

To open an existing Figma file in production you will need a Figma's [access token](https://www.figma.com/developers/api#access-tokens) first. Once you obtained it, you can use it to open a specific file, using the file ID (found when copying a Figma file link).

At this point you can pass both the token and the file ID to your URL, using `figma-token` and `figma-file` URL params.

http://localhost:3000?figma-token={YOUR_TOKEN_HERE}&figma-file={YOUR_FIGMA_FILE_ID_HERE}

## Building for Production

### Standard Build

For a standard Next.js production build:

```bash
npm run build
npm run start
```

### Static Export

To build a static version that can be deployed to any web server:

```bash
# Basic static build (outputs to 'out' directory)
npm run build:static

# Custom build with base path and asset prefix
npm run build:static:custom -- --base-path=/figma-clone
npm run build:static:custom -- --base-path=/my-app --asset-prefix=https://cdn.example.com

# Serve static build locally for testing
npm run serve:static
```

#### Static Build Options

- **`--base-path=<path>`**: Set the base path for deployment in subdirectories (e.g., `/figma-clone`)
- **`--asset-prefix=<url>`**: Set the asset prefix for CDN deployment
- **`--help`**: Show all available options

#### Examples

```bash
# Deploy to root of domain
npm run build:static:custom

# Deploy to subdirectory
npm run build:static:custom -- --base-path=/figma-clone

# Deploy with CDN
npm run build:static:custom -- --asset-prefix=https://cdn.example.com

# Deploy to subdirectory with CDN
npm run build:static:custom -- --base-path=/my-app --asset-prefix=https://cdn.example.com
```

The static files will be generated in the `out` directory and can be uploaded to any web server or CDN.

## Deployment

### Static Hosting

After running the static build, upload the contents of the `out` directory to:

- GitHub Pages
- Netlify
- Vercel (static)
- AWS S3 + CloudFront
- Any web server

### Server Hosting

For server-side rendering, deploy the standard Next.js build to:

- Vercel (recommended)
- Railway
- Heroku
- Any Node.js hosting provider

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.
