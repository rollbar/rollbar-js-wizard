### `@rollbar/wizard` – Rollbar Next.js Setup Wizard

Automated CLI wizard to add Rollbar to an existing Next.js application.  
It detects your project structure, scaffolds the right config, and wires up error handling, Session Replay, and source maps for you.

> **Note:** Today this wizard only supports Next.js projects. Vue and Svelte support are planned for future releases.

---

### Features

- **Next.js-aware project detection**:
  - Detects App Router (`app/`), Pages Router (`pages/`), or both.
  - Detects TypeScript vs JavaScript.
  - Detects your package manager (`npm`, `yarn`, `pnpm`).

- **Vercel + Rollbar Integration aware**:
  - Asks if you are deploying with Vercel.
  - If you have installed the Rollbar integration in Vercel, you can paste the names of the environment variables it created.
  - Uses those Vercel-managed env vars throughout the generated config without writing tokens into `.env.local`.

- **Rollbar setup for client + server**:
  - Creates `rollbar.server.config.(ts|js)` for server-side and edge handlers.
  - Creates `rollbar.edge.config.(ts|js)` for edge runtimes.
  - Creates `rollbar.client.config.(ts|js)` for browser-side error tracking and Session Replay.

- **Next.js integration**:
  - Configures or creates `next.config.(js|mjs|ts)` when source maps are enabled.
  - Sets up an `instrumentation.(ts|js)` hook when needed.
  - Adds App Router `global-error.(tsx|jsx)` and/or Pages Router `_error.(tsx|jsx)` if not present.

- **Source maps & deployment tracking**:
  - Generates a `scripts/upload-sourcemaps.(ts|js)` helper.
  - Installs required packages (e.g. `form-data`, `node-fetch`, `glob`, plus `tsx` and types when needed).
  - Adds a `postbuild` script to run the upload script.
  - Optionally configures Rollbar code versioning for deployment tracking.

- **Environment configuration**:
  - Updates `.env.local` with Rollbar tokens (non-Vercel) or helpful comments (Vercel).
  - Ensures `.env.local` is in `.gitignore`.

- **Optional example page & API route**:
  - Can generate a `rollbar-example-page` and example API route to validate your setup.

---

### Requirements

- **Node.js**: `>=16.0.0`
- **Framework**: Next.js (App Router, Pages Router, or both)
- **Project**: Run the wizard from the root of your Next.js app (where `package.json` lives)
- **Rollbar**: Server and client project access tokens (unless using Vercel’s Rollbar integration)

---

### Installation

You can use the wizard via `npx`, or install it as a dev dependency, or globally.

- **Using `npx` (recommended to start):**

```bash
cd my-nextjs-app
npx @rollbar/wizard
```

- **As a dev dependency:**

```bash
npm install --save-dev @rollbar/wizard
# or
yarn add -D @rollbar/wizard
# or
pnpm add -D @rollbar/wizard
```

Then:

```bash
cd my-nextjs-app
npx rollbar-wizard
# or, depending on your package manager
pnpm exec rollbar-wizard
yarn rollbar-wizard
```

- **Globally (optional):**

```bash
npm install -g @rollbar/wizard
rollbar-wizard
```

---

### Basic Usage (Next.js)

From your Next.js project root:

```bash
# Let the wizard auto-detect that this is a Next.js app
rollbar-wizard

# Or explicitly specify the framework
rollbar-wizard nextjs
```

The wizard will:

1. Inspect your project to detect:
   - App Router / Pages Router / both
   - TypeScript / JavaScript
   - Package manager
2. Ask how you deploy (e.g. Vercel vs non-Vercel).
3. Ask for:
   - Rollbar server access token
   - Rollbar client access token
   - Environment name (e.g. `production`, `staging`)
   - Whether to enable deployment tracking
   - Whether to enable source maps
   - Whether to enable Session Replay
   - Whether to create an example page.
4. Apply changes and print a summary of what it configured.

---


### What the Wizard Changes in Your Next.js App

Depending on your answers and project structure, the wizard may:

- **Config files**:
  - Create or overwrite:
    - `rollbar.server.config.(ts|js)`
    - `rollbar.edge.config.(ts|js)`
    - `rollbar.client.config.(ts|js)`

- **Next.js config**:
  - Create or update:
    - `next.config.js`, `next.config.mjs`, or `next.config.ts`
  - Ensures `productionBrowserSourceMaps: true` when source maps are enabled.
  - Uses a minimal config when it detects an “empty” config file.

- **Instrumentation**:
  - Create `instrumentation.(ts|js)` at the project root or under `src/`, or
  - Print a snippet you can paste into your existing instrumentation file, and ask you to confirm before continuing.

- **Error pages**:
  - For **Pages Router**:
    - Create `_error.(tsx|jsx)` under `pages/` or `src/pages/` if one does not exist.
  - For **App Router**:
    - Create `global-error.(tsx|jsx)` under your `app/` tree if one does not exist.

- **Example page & API route (optional)**:
  - App Router:
    - `app/rollbar-example-page/page.(tsx|jsx)`
    - `app/api/rollbar-example-api/route.(ts|js)`
  - Pages Router:
    - `pages/rollbar-example-page.(tsx|jsx)` (or under `src/pages/`)
    - `pages/api/rollbar-example-api.(ts|js)`

- **Environment variables**:
  - Update `.env.local`:
    - For non-Vercel:
      - `ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN=...`
      - `NEXT_PUBLIC_ROLLBAR_PROJECT_ACCESS_CLIENT_TOKEN=...`
      - Optional `ROLLBAR_CODE_VERSION=...`
    - For Vercel:
      - Adds comments documenting which Vercel env vars you configured.
  - Ensure `.env.local` is ignored by Git by updating `.gitignore`.

- **Source maps**:
  - Create `scripts/upload-sourcemaps.(ts|js)` with a ready-to-run upload script.
  - Install and/or add to `devDependencies`:
    - `form-data`, `node-fetch`, `glob`
    - `tsx` and `@types/glob` for TypeScript projects.
  - Add or extend your `postbuild` script to run the upload script.
  - Update `tsconfig.json` to exclude `scripts/` from type checking.

---

### Using Vercel with the Rollbar Integration

If you indicate that you are deploying with Vercel:

- The wizard will first confirm that you are using Vercel.
- In your Vercel project, after installing the Rollbar integration, Vercel creates environment variables for your Rollbar client and server tokens.
- The wizard asks you to paste the *names* of those environment variables (for example `VERCEL_ROLLBAR_CLIENT_TOKEN` and `VERCEL_ROLLBAR_SERVER_TOKEN`).
- It then configures all generated Rollbar code (server, edge, and client config, plus source map upload) to read from those Vercel env vars.
- It avoids writing tokens into `.env.local`; instead, it only adds comments that reference the Vercel env vars for clarity.
- Deployment tracking is treated as handled by Vercel; the wizard skips its own deployment-tracking prompt in that mode.

---

### Validating Your Setup

After running the wizard:

1. **Install dependencies** (if you used `--skip-install`):

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. **Start your app**:

   ```bash
   npm run dev
   ```

3. **If you created the example page**:
   - Visit `/rollbar-example-page` in your browser.
   - Trigger client- and server-side errors to see them appear in Rollbar.

4. **Verify source maps** (if enabled):
   - Build and deploy your app, then trigger an error in production.
   - Check that stack traces in Rollbar are symbolicated to your original source.

---

### Limitations

- **Framework support**:
  - Only Next.js is supported today.
  - The wizard expects a `package.json` with `next` in `dependencies` or `devDependencies`.

- **Project shape**:
  - Assumes a relatively standard Next.js layout:
    - `app/` and/or `pages/` under the project root or `src/`.
  - Non-standard layouts may require manual adjustments after running the wizard.

- **Token management**:
  - For non-Vercel setups, tokens are written into `.env.local` on your machine.
  - You are responsible for configuring secrets in CI and production environments.

---

### Roadmap

Planned improvements (subject to change):

- **Vue support**:
  - CLI mode (e.g. `rollbar-wizard vue`) with framework-specific templates.
- **Svelte/SvelteKit support**:
  - CLI mode (e.g. `rollbar-wizard svelte`) with appropriate routing and error-handling integration.
- **Additional platform presets**:
  - More guided flows for other hosting providers beyond Vercel.

If you have specific requirements for Vue or Svelte, opening an issue with your use case will help shape the initial implementation.

---

### Contributing

Issues and pull requests are welcome.

- **Bugs / Feature requests**: open an issue on the GitHub repository.
- **Local development**:
  - Build with `npm run build`
  - Run tests with `npm test`
  - Use `npm run dev` for TypeScript watch mode while testing the CLI in a sample Next.js app.

---

### License

MIT License.
