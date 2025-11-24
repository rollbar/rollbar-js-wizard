# Local Testing Guide

This guide explains how to test the rollbar-wizard locally before publishing to npm.

## Prerequisites

1. Build the wizard:
   ```bash
   cd rollbar-wizard
   npm run build
   ```

2. Link the wizard globally:
   ```bash
   cd rollbar-wizard
   npm link
   ```

## Testing in Your Next.js App

### Option 1: Use the globally linked wizard (Recommended)

Since the wizard is linked globally, you can use it directly:

```bash
cd nextjs-app
rollbar-wizard nextjs
```

Or let it auto-detect:
```bash
cd nextjs-app
rollbar-wizard
```

### Option 2: Use npx with local path

```bash
cd nextjs-app
npx ../rollbar-wizard
```

### Option 3: Use node directly

```bash
cd nextjs-app
node ../rollbar-wizard/bin/rollbar-wizard.js nextjs
```

## Testing Workflow

1. **Make changes to the wizard:**
   ```bash
   cd rollbar-wizard
   # Edit files in src/
   npm run build  # Rebuild after changes
   ```

2. **Test in your Next.js app:**
   ```bash
   cd nextjs-app
   rollbar-wizard nextjs
   ```

3. **Verify the setup:**
   - Check that files were created correctly
   - Verify configuration files
   - Test that the app runs without errors

## Quick Test Commands

### Test with all prompts:
```bash
cd nextjs-app
rollbar-wizard nextjs
```

### Test with non-interactive mode:
```bash
cd nextjs-app
rollbar-wizard nextjs \
  --access-token YOUR_TEST_TOKEN \
  --environment development \
  --yes
```

### Test without installing packages:
```bash
cd nextjs-app
rollbar-wizard nextjs --skip-install
```

## Cleaning Up After Testing

To remove the global link:
```bash
npm unlink -g @rollbar/wizard
```

To remove any files created by the wizard in your test app:
```bash
cd nextjs-app
# Remove generated files
rm -f rollbar.*.config.ts rollbar.*.config.js
rm -f instrumentation.ts instrumentation.js
rm -f .env.local
# Remove example page if created
rm -rf app/rollbar-example-page
rm -rf pages/rollbar-example-page*
```

## Troubleshooting

### "Command not found"
Make sure you've run `npm link` in the rollbar-wizard directory.

### "The wizard needs to be built first"
Run `npm run build` in the rollbar-wizard directory.

### Changes not reflecting
After making changes to the wizard source code, always rebuild:
```bash
cd rollbar-wizard
npm run build
```

### Module not found errors
Make sure all dependencies are installed:
```bash
cd rollbar-wizard
npm install
```

## Development Tips

1. **Watch mode for development:**
   ```bash
   cd rollbar-wizard
   npm run dev  # Runs tsc --watch
   ```
   Then in another terminal, test your changes:
   ```bash
   cd nextjs-app
   rollbar-wizard nextjs
   ```

2. **Check what files will be created:**
   Run the wizard in a test directory first to see what it generates.

3. **Test different scenarios:**
   - With TypeScript
   - Without TypeScript
   - With App Router
   - With Pages Router
   - With both routers

