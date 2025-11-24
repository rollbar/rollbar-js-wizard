import chalk from 'chalk';

type RollbarConfigOptions = {
  accessToken: string;
  environment: string;
  codeVersion?: string;
  enableReplay: boolean;
  enableSourcemaps: boolean;
};

export function getRollbarServerConfigContents(
  environment: string,
  codeVersion?: string,
  isVercel?: boolean,
  vercelServerTokenEnvVar?: string,
): string {
  const accessTokenEnvVar = isVercel && vercelServerTokenEnvVar
    ? vercelServerTokenEnvVar
    : 'ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN';
  
  return `// This file configures the initialization of Rollbar on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.rollbar.com/docs/rollbarjs-configuration-reference

import Rollbar from 'rollbar';

if (!process.env.${accessTokenEnvVar}) {
  throw new Error('${accessTokenEnvVar} environment variable is required');
}

const rollbarConfig = {
  accessToken: process.env.${accessTokenEnvVar},
  environment: process.env.NODE_ENV || '${environment}',
  captureUncaught: true,
  captureUnhandledRejections: true,${
    codeVersion
      ? `
  codeVersion: process.env.ROLLBAR_CODE_VERSION || '${codeVersion}',`
      : `
  codeVersion: process.env.ROLLBAR_CODE_VERSION,`
  }
  payload: {
    server: {
      root: process.cwd(),
    },
  },
};

const rollbar = new Rollbar(rollbarConfig);

export default rollbar;
`;
}

export function getRollbarEdgeConfigContents(
  environment: string,
  codeVersion?: string,
  isVercel?: boolean,
  vercelServerTokenEnvVar?: string,
): string {
  const accessTokenEnvVar = isVercel && vercelServerTokenEnvVar
    ? vercelServerTokenEnvVar
    : 'ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN';
  
  return `// This file configures the initialization of Rollbar for edge features (middleware, edge routes, etc.).
// The config you add here will be used whenever one of the edge features is loaded.
// https://docs.rollbar.com/docs/rollbarjs-configuration-reference

import Rollbar from 'rollbar';

if (!process.env.${accessTokenEnvVar}) {
  throw new Error('${accessTokenEnvVar} environment variable is required');
}

const rollbarConfig = {
  accessToken: process.env.${accessTokenEnvVar},
  environment: process.env.NODE_ENV || '${environment}',
  captureUncaught: true,
  captureUnhandledRejections: true,${
    codeVersion
      ? `
  codeVersion: process.env.ROLLBAR_CODE_VERSION || '${codeVersion}',`
      : `
  codeVersion: process.env.ROLLBAR_CODE_VERSION,`
  }
  // Note: Edge Runtime doesn't support process.cwd(), so we omit payload.server.root
  // Rollbar will still work correctly without it
};

const rollbar = new Rollbar(rollbarConfig);

export default rollbar;
`;
}

export function getRollbarClientConfigContents(
  environment: string,
  codeVersion: string | undefined,
  enableReplay: boolean,
  enableSourcemaps: boolean,
  isVercel?: boolean,
  vercelClientTokenEnvVar?: string,
): string {
  const accessTokenEnvVar = isVercel && vercelClientTokenEnvVar
    ? vercelClientTokenEnvVar
    : 'NEXT_PUBLIC_ROLLBAR_PROJECT_ACCESS_CLIENT_TOKEN';
  const replayConfig = enableReplay
    ? `
  replay: {
    enabled: true,
    triggers: [
      {
        type: 'occurrence',
        level: ['error', 'critical'],
      },
    ],
  },`
    : '';

  const rollbarImport = enableReplay ? 'rollbar/replay' : 'rollbar';

  const sourcemapConfig = enableSourcemaps
    ? `
    javascript: {
      source_map_enabled: true,${
        codeVersion
          ? `
      code_version: process.env.ROLLBAR_CODE_VERSION || '${codeVersion}',`
          : `
      code_version: process.env.ROLLBAR_CODE_VERSION,`
      }
    },`
    : codeVersion
      ? `
    javascript: {
      code_version: process.env.ROLLBAR_CODE_VERSION || '${codeVersion}',
    },`
      : '';

  return `// This file configures the initialization of Rollbar on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.rollbar.com/docs/rollbarjs-configuration-reference

'use client';

import Rollbar from '${rollbarImport}';

if (!process.env.${accessTokenEnvVar}) {
  throw new Error('${accessTokenEnvVar} environment variable is required');
}

const rollbarConfig = {
  accessToken: process.env.${accessTokenEnvVar},
  environment: process.env.NODE_ENV || '${environment}',
  captureUncaught: true,
  captureUnhandledRejections: true,${replayConfig}
  payload: {
    client: {${sourcemapConfig}
    },
  },
};

const rollbar = new Rollbar(rollbarConfig as any);

export default rollbar;
`;
}

export function getInstrumentationHookContent(
  instrumentationHookLocation: 'src' | 'root',
): string {
  return `import rollbarServer from '${
    instrumentationHookLocation === 'root' ? '.' : '..'
  }/rollbar.server.config';
import rollbarEdge from '${
    instrumentationHookLocation === 'root' ? '.' : '..'
  }/rollbar.edge.config';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Rollbar is initialized via the config file import
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/rollbar.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Rollbar is initialized via the config file import
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/rollbar.edge.config');
  }
}
`;
}

function makeCodeSnippet(
  isNewFile: boolean,
  fn: (unchanged: (s: string) => string, plus: (s: string) => string) => string,
): string {
  const unchanged = (s: string) => chalk.dim(s);
  const plus = (s: string) => chalk.green(s);
  return fn(unchanged, plus);
}

export function getInstrumentationHookCopyPasteSnippet(
  instrumentationHookLocation: 'src' | 'root',
): string {
  const importPath = instrumentationHookLocation === 'root' ? '.' : '..';
  return makeCodeSnippet(true, (unchanged, plus) => {
    return unchanged(
      plus(`import rollbarServer from '${importPath}/rollbar.server.config';`) +
        '\n' +
        plus(`import rollbarEdge from '${importPath}/rollbar.edge.config';`) +
        '\n\n' +
        'export ' +
        plus('async') +
        ' function register() {\n' +
        plus(
          `  if (process.env.NEXT_RUNTIME === 'nodejs') {\n` +
            `    await import('${importPath}/rollbar.server.config');\n` +
            `  }\n\n` +
            `  if (process.env.NEXT_RUNTIME === 'edge') {\n` +
            `    await import('${importPath}/rollbar.edge.config');\n` +
            `  }`,
        ) +
        '\n}',
    );
  });
}

export function getNextjsConfigCjsTemplate(
  enableSourcemaps: boolean,
): string {
  const sourceMapsConfig = enableSourcemaps
    ? `
  // Enable source map generation for production builds
  // Source maps will be uploaded to Rollbar automatically after build
  productionBrowserSourceMaps: true,
  // Next.js 16+ uses Turbopack by default - add empty config to avoid webpack conflicts
  turbopack: {},`
    : '';

  return `/** @type {import('next').NextConfig} */
const nextConfig = {${sourceMapsConfig}
};

module.exports = nextConfig;
`;
}

export function getNextjsConfigTsTemplate(
  enableSourcemaps: boolean,
): string {
  const sourceMapsConfig = enableSourcemaps
    ? `
  // Enable source map generation for production builds
  // Source maps will be uploaded to Rollbar automatically after build
  productionBrowserSourceMaps: true,
  // Next.js 16+ uses Turbopack by default - add empty config to avoid webpack conflicts
  turbopack: {},`
    : '';

  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {${sourceMapsConfig}
};

export default nextConfig;
`;
}

export function getNextjsConfigMjsTemplate(
  enableSourcemaps: boolean,
): string {
  const sourceMapsConfig = enableSourcemaps
    ? `
  // Enable source map generation for production builds
  // Source maps will be uploaded to Rollbar automatically after build
  productionBrowserSourceMaps: true,
  // Next.js 16+ uses Turbopack by default - add empty config to avoid webpack conflicts
  turbopack: {},`
    : '';

  return `/** @type {import('next').NextConfig} */
const nextConfig = {${sourceMapsConfig}
};

export default nextConfig;
`;
}


export function getSourceMapUploadScriptTemplate(
  isTypeScript: boolean,
  isVercel?: boolean,
  vercelServerTokenEnvVar?: string,
): string {
  // Build the list of env vars to check
  const envVarChecks = [];
  if (isVercel && vercelServerTokenEnvVar) {
    envVarChecks.push(`process.env.${vercelServerTokenEnvVar}`);
  }
  envVarChecks.push('process.env.ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN');
  envVarChecks.push('process.env.VERCEL_ROLLBAR_SERVER_TOKEN');
  envVarChecks.push('process.env.ROLLBAR_SERVER_TOKEN');
  
  const accessTokenLine = envVarChecks.join(' ||\n    ');
  const errorMessage = isVercel && vercelServerTokenEnvVar
    ? `❌ ${vercelServerTokenEnvVar} or ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN environment variable is required`
    : '❌ ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN or Vercel server token environment variable is required';

  if (isTypeScript) {
    return `import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function uploadSourceMaps() {
  const accessToken = ${accessTokenLine};
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || process.env.VERCEL_URL;
  const codeVersion = process.env.ROLLBAR_CODE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';

  if (!accessToken) {
    console.error('${errorMessage}');
    process.exit(1);
  }

  if (!baseUrl) {
    console.warn('⚠️  NEXT_PUBLIC_BASE_URL, BASE_URL, or VERCEL_URL not set. Using relative URLs.');
  }

  const distDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(distDir)) {
    console.error('❌ .next directory not found. Run "next build" first.');
    process.exit(1);
  }

  const chunksDir = path.join(distDir, 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) {
    console.warn('⚠️  No chunks directory found. Source maps may not have been generated.');
    return;
  }

  // Find all .map files
  const mapFiles = await glob('**/*.map', {
    cwd: chunksDir,
    absolute: true,
  });

  if (mapFiles.length === 0) {
    console.warn('⚠️  No source map files found. Make sure productionBrowserSourceMaps is enabled in next.config.');
    return;
  }

  console.log(\`📦 Found \${mapFiles.length} source map file(s) to upload...\`);

  const baseUrlWithProtocol = baseUrl 
    ? (baseUrl.startsWith('http') ? baseUrl : \`https://\${baseUrl}\`)
    : '';

  // Rollbar has a size limit (typically 5MB) for source map uploads
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const mapFile of mapFiles) {
    try {
      const fileName = path.basename(mapFile);
      const jsFileName = fileName.replace('.map', '');
      
      // Check file size before attempting upload
      const stats = fs.statSync(mapFile);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      if (stats.size > MAX_FILE_SIZE) {
        console.warn(\`⚠️  Skipping \${fileName} (too large: \${fileSizeMB}MB, limit: 5MB)\`);
        skippedCount++;
        continue;
      }
      
      // Construct minified_url (without schema as per Rollbar docs)
      const minifiedUrl = baseUrlWithProtocol
        ? \`\${baseUrlWithProtocol}/_next/static/chunks/\${jsFileName}\`
        : \`/_next/static/chunks/\${jsFileName}\`;

      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('version', codeVersion);
      formData.append('minified_url', minifiedUrl);
      formData.append('source_map', fs.createReadStream(mapFile), {
        filename: fileName,
        contentType: 'application/json',
      });

      const response = await fetch('https://api.rollbar.com/api/1/sourcemap', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log(\`✅ Uploaded: \${fileName} (\${fileSizeMB}MB)\`);
        successCount++;
      } else if (response.status === 413) {
        // Request Entity Too Large - file is too big
        console.warn(\`⚠️  Skipping \${fileName} (too large for Rollbar API: \${fileSizeMB}MB)\`);
        skippedCount++;
      } else {
        const errorText = await response.text();
        console.error(\`❌ Failed to upload \${fileName}: \${response.status} \${response.statusText}\`);
        if (errorText && !errorText.includes('<html>')) {
          console.error(\`   Error: \${errorText}\`);
        }
        errorCount++;
      }
    } catch (error) {
      // Handle EPIPE and other network errors that might indicate size issues
      if (error.code === 'EPIPE' || (error.response && error.response.status === 413)) {
        const stats = fs.statSync(mapFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.warn(\`⚠️  Skipping \${path.basename(mapFile)} (too large: \${fileSizeMB}MB)\`);
        skippedCount++;
      } else {
        console.error(\`❌ Error uploading \${path.basename(mapFile)}:\`, error.message || error);
        errorCount++;
      }
    }
  }

  console.log(\`\\n📊 Upload complete: \${successCount} succeeded, \${skippedCount} skipped (too large), \${errorCount} failed\`);

  // Only exit with error if there were actual errors (not just skipped files)
  if (errorCount > 0) {
    console.warn('⚠️  Some source maps failed to upload. This may affect error tracking quality.');
    // Don't fail the build for source map upload issues
    // process.exit(1);
  } else if (skippedCount > 0) {
    console.warn('⚠️  Some source maps were skipped due to size limits. Consider optimizing your build.');
  }
}

uploadSourceMaps().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
`;
  } else {
    return `const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadSourceMaps() {
  const accessToken = ${accessTokenLine};
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || process.env.VERCEL_URL;
  const codeVersion = process.env.ROLLBAR_CODE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';

  if (!accessToken) {
    console.error('${errorMessage}');
    process.exit(1);
  }

  if (!baseUrl) {
    console.warn('⚠️  NEXT_PUBLIC_BASE_URL, BASE_URL, or VERCEL_URL not set. Using relative URLs.');
  }

  const distDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(distDir)) {
    console.error('❌ .next directory not found. Run "next build" first.');
    process.exit(1);
  }

  const chunksDir = path.join(distDir, 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) {
    console.warn('⚠️  No chunks directory found. Source maps may not have been generated.');
    return;
  }

  // Find all .map files
  const mapFiles = await glob('**/*.map', {
    cwd: chunksDir,
    absolute: true,
  });

  if (mapFiles.length === 0) {
    console.warn('⚠️  No source map files found. Make sure productionBrowserSourceMaps is enabled in next.config.');
    return;
  }

  console.log(\`📦 Found \${mapFiles.length} source map file(s) to upload...\`);

  const baseUrlWithProtocol = baseUrl 
    ? (baseUrl.startsWith('http') ? baseUrl : \`https://\${baseUrl}\`)
    : '';

  // Rollbar has a size limit (typically 5MB) for source map uploads
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const mapFile of mapFiles) {
    try {
      const fileName = path.basename(mapFile);
      const jsFileName = fileName.replace('.map', '');
      
      // Check file size before attempting upload
      const stats = fs.statSync(mapFile);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      if (stats.size > MAX_FILE_SIZE) {
        console.warn(\`⚠️  Skipping \${fileName} (too large: \${fileSizeMB}MB, limit: 5MB)\`);
        skippedCount++;
        continue;
      }
      
      // Construct minified_url (without schema as per Rollbar docs)
      const minifiedUrl = baseUrlWithProtocol
        ? \`\${baseUrlWithProtocol}/_next/static/chunks/\${jsFileName}\`
        : \`/_next/static/chunks/\${jsFileName}\`;

      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('version', codeVersion);
      formData.append('minified_url', minifiedUrl);
      formData.append('source_map', fs.createReadStream(mapFile), {
        filename: fileName,
        contentType: 'application/json',
      });

      const response = await fetch('https://api.rollbar.com/api/1/sourcemap', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log(\`✅ Uploaded: \${fileName} (\${fileSizeMB}MB)\`);
        successCount++;
      } else if (response.status === 413) {
        // Request Entity Too Large - file is too big
        console.warn(\`⚠️  Skipping \${fileName} (too large for Rollbar API: \${fileSizeMB}MB)\`);
        skippedCount++;
      } else {
        const errorText = await response.text();
        console.error(\`❌ Failed to upload \${fileName}: \${response.status} \${response.statusText}\`);
        if (errorText && !errorText.includes('<html>')) {
          console.error(\`   Error: \${errorText}\`);
        }
        errorCount++;
      }
    } catch (error) {
      // Handle EPIPE and other network errors that might indicate size issues
      if (error.code === 'EPIPE' || (error.response && error.response.status === 413)) {
        const stats = fs.statSync(mapFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.warn(\`⚠️  Skipping \${path.basename(mapFile)} (too large: \${fileSizeMB}MB)\`);
        skippedCount++;
      } else {
        console.error(\`❌ Error uploading \${path.basename(mapFile)}:\`, error.message || error);
        errorCount++;
      }
    }
  }

  console.log(\`\\n📊 Upload complete: \${successCount} succeeded, \${skippedCount} skipped (too large), \${errorCount} failed\`);

  // Only exit with error if there were actual errors (not just skipped files)
  if (errorCount > 0) {
    console.warn('⚠️  Some source maps failed to upload. This may affect error tracking quality.');
    // Don't fail the build for source map upload issues
    // process.exit(1);
  } else if (skippedCount > 0) {
    console.warn('⚠️  Some source maps were skipped due to size limits. Consider optimizing your build.');
  }
}

uploadSourceMaps().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
`;
  }
}

export function getRollbarDefaultUnderscoreErrorPage(
  pagesLocation: string[],
): string {
  // Calculate relative path: from pages/ or src/pages/ to root
  const relativePath = pagesLocation.length === 1 ? '..' : '../..';
  return `import rollbar from '${relativePath}/rollbar.server.config';
import Error from 'next/error';

const CustomErrorComponent = (props) => {
  return <Error statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData) => {
  // Report error to Rollbar before the lambda exits
  rollbar.error('Next.js error page', contextData.err, {
    request: contextData.req,
    response: contextData.res,
  });

  // This will contain the status code of the response
  return Error.getInitialProps(contextData);
};

export default CustomErrorComponent;
`;
}

export function getRollbarDefaultGlobalErrorPage(
  isTs: boolean,
  appDirLocation: string[],
): string {
  // Calculate relative path: from app/ or src/app/ to root
  const relativePath = appDirLocation.length === 1 ? '..' : '../..';
  return isTs
    ? `"use client";

import rollbar from '${relativePath}/rollbar.client.config';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    rollbar.error('Global error', error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}`
    : `"use client";

import rollbar from '${relativePath}/rollbar.client.config';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }) {
  useEffect(() => {
    rollbar.error('Global error', error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}`;
}

export function getRollbarExamplePageContents(options: {
  accessToken: string;
  useClient: boolean;
  isTypeScript?: boolean;
  appDirLocation?: string[];
  pagesFolderLocation?: string[];
}): string {
  // Calculate relative path based on location
  // Example page paths:
  // - app/rollbar-example-page/page.tsx -> ../../rollbar.client.config (2 levels up)
  // - src/app/rollbar-example-page/page.tsx -> ../../../rollbar.client.config (3 levels up)
  // - pages/rollbar-example-page.tsx -> ../rollbar.client.config (1 level up)
  // - src/pages/rollbar-example-page.tsx -> ../../rollbar.client.config (2 levels up)
  let relativePath = '../..'; // Default for app/rollbar-example-page/page.tsx
  
  if (options.appDirLocation) {
    // App router: nested in rollbar-example-page subdirectory
    relativePath = options.appDirLocation.length === 1 ? '../..' : '../../..';
  } else if (options.pagesFolderLocation) {
    // Pages router: directly in pages folder
    relativePath = options.pagesFolderLocation.length === 1 ? '..' : '../..';
  }
  return `${
    options.useClient ? '"use client";\n\n' : ''
  }import { useState } from 'react';
import { Provider, ErrorBoundary, useRollbar } from '@rollbar/react';
import rollbar from '${relativePath}/rollbar.client.config';

class RollbarExampleError extends Error {
  constructor(message${options.isTypeScript ? ': string | undefined' : ''}) {
    super(message);
    this.name = 'RollbarExampleError';
  }
}

function ErrorButton() {
  const rollbar = useRollbar();
  const [serverErrorStatus, setServerErrorStatus] = useState<string | null>(null);

  const triggerError = () => {
    throw new RollbarExampleError('This is a test error from the Rollbar Next.js integration');
  };

  const sendInfo = () => {
    rollbar.info('Test info message from Rollbar Next.js integration');
  };

  const triggerServerError = async () => {
    setServerErrorStatus('Sending...');
    try {
      const response = await fetch('/api/rollbar-example-api');
      if (!response.ok) {
        setServerErrorStatus('Error sent! Check your Rollbar dashboard.');
      }
    } catch (error) {
      // The error is expected - it's being sent to Rollbar
      setServerErrorStatus('Error sent! Check your Rollbar dashboard.');
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Rollbar Test Page</h1>
      <p>Use these buttons to test your Rollbar integration:</p>
      
      <div style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Client-Side Testing</h2>
        <button 
          onClick={triggerError}
          style={{ 
            padding: '0.5rem 1rem', 
            marginRight: '1rem',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Trigger Client Error
        </button>
        
        <button 
          onClick={sendInfo}
          style={{ 
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Send Info Message
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Server-Side Testing</h2>
        <button 
          onClick={triggerServerError}
          disabled={serverErrorStatus !== null}
          style={{ 
            padding: '0.5rem 1rem',
            background: '#ff6b35',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: serverErrorStatus ? 'not-allowed' : 'pointer',
            opacity: serverErrorStatus ? 0.6 : 1
          }}
        >
          Trigger Server Error
        </button>
        {serverErrorStatus && (
          <span style={{ marginLeft: '1rem', color: '#28a745' }}>
            {serverErrorStatus}
          </span>
        )}
      </div>
      
      <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#666' }}>
        After clicking these buttons, check your Rollbar dashboard to see the events.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Provider instance={rollbar}>
      <ErrorBoundary>
        <ErrorButton />
      </ErrorBoundary>
    </Provider>
  );
}
`;
}

export function getRollbarExampleAppDirApiRoute({
  isTypeScript,
  appDirLocation,
}: {
  isTypeScript: boolean;
  appDirLocation: string[];
}): string {
  // Calculate relative path from api/rollbar-example-api/route.ts to root
  // - app/api/rollbar-example-api/route.ts -> ../../../rollbar.server.config (3 levels up)
  // - src/app/api/rollbar-example-api/route.ts -> ../../../../rollbar.server.config (4 levels up)
  const relativePath = appDirLocation.length === 1 ? '../../..' : '../../../..';
  
  return `import { NextResponse } from 'next/server';
import rollbar from '${relativePath}/rollbar.server.config';

export const dynamic = 'force-dynamic';

class RollbarExampleAPIError extends Error {
  constructor(message${isTypeScript ? ': string | undefined' : ''}) {
    super(message);
    this.name = 'RollbarExampleAPIError';
  }
}

// A faulty API route to test Rollbar's server-side error monitoring
export function GET() {
  const error = new RollbarExampleAPIError('This is a test error from the server-side Rollbar Next.js integration');
  rollbar.error('Server-side test error', error);
  throw error;
}
`;
}

export function getRollbarExamplePagesDirApiRoute({
  isTypeScript,
  pagesFolderLocation,
}: {
  isTypeScript: boolean;
  pagesFolderLocation: string[];
}): string {
  // Calculate relative path from pages/api/rollbar-example-api.ts to root
  // - pages/api/rollbar-example-api.ts -> ../../rollbar.server.config (2 levels up)
  // - src/pages/api/rollbar-example-api.ts -> ../../../rollbar.server.config (3 levels up)
  const relativePath = pagesFolderLocation.length === 1 ? '../..' : '../../..';
  
  return `import rollbar from '${relativePath}/rollbar.server.config';

class RollbarExampleAPIError extends Error {
  constructor(message${isTypeScript ? ': string | undefined' : ''}) {
    super(message);
    this.name = 'RollbarExampleAPIError';
  }
}

// A faulty API route to test Rollbar's server-side error monitoring
export default function handler(_req, res) {
  const error = new RollbarExampleAPIError('This is a test error from the server-side Rollbar Next.js integration');
  rollbar.error('Server-side test error', error);
  throw error;
}
`;
}


