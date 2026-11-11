# Local development

## Prerequisites

- Node.js 24 and npm (included with Node.js). Node.js 26 is also supported.
- Git.

If you use nvm, run `nvm use` to select the version in `.nvmrc`.

## Install and run

From the repository directory:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Stop the local processes with Ctrl+C.

No Docker, cloud account, or external credentials are required.

## Check the environment

With the application running, use another terminal:

```sh
npm run smoke
```

Other development commands:

```sh
npm test
npm run typecheck
npm run build
```

Defaults work without configuration. To override them, copy `.env.example` to `.env`.

The local services are unauthenticated and must not be exposed to the public internet.
