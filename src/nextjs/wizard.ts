import * as clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  getRollbarServerConfigContents,
  getRollbarEdgeConfigContents,
  getRollbarClientConfigContents,
  getInstrumentationHookContent,
  getInstrumentationHookCopyPasteSnippet,
  getRollbarDefaultUnderscoreErrorPage,
  getRollbarDefaultGlobalErrorPage,
  getRollbarExamplePageContents,
  getRollbarExampleAppDirApiRoute,
  getRollbarExamplePagesDirApiRoute,
  getNextjsConfigCjsTemplate,
  getNextjsConfigMjsTemplate,
  getNextjsConfigTsTemplate,
  getSourceMapUploadScriptTemplate,
} from './templates';
import {
  getNextJsVersionBucket,
  getMaybeAppDirLocation,
  hasRootLayoutFile,
  hasDirectoryPathFromRoot,
} from './utils';
import {
  detectPackageManager,
  getPackageJson,
  hasTypescript as checkHasTypescript,
} from '../utils/project';

interface WizardOptions {
  accessToken?: string;
  environment?: string;
  skipInstall?: boolean;
  yes?: boolean;
}

interface ProjectInfo {
  hasTypescript: boolean;
  hasAppRouter: boolean;
  hasPagesRouter: boolean;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  nextVersion: string;
}

function abort(message?: string, code = 1): never {
  clack.cancel(message || 'Operation cancelled.');
  process.exit(code);
}

function abortIfCancelled<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    abort();
  }
  return value as T;
}

function setupExitHandlers(): void {
  // Handle Ctrl+C (SIGINT) - use once to prevent multiple handlers
  const handleSIGINT = () => {
    console.log(''); // New line after ^C
    clack.cancel('Wizard cancelled by user.');
    process.exit(0);
  };

  // Remove any existing handlers and add ours
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', handleSIGINT);

  // Handle SIGTERM
  const handleSIGTERM = () => {
    clack.cancel('Wizard terminated.');
    process.exit(0);
  };

  process.removeAllListeners('SIGTERM');
  process.on('SIGTERM', handleSIGTERM);
}

function checkForExitCommand(value: string): string | undefined {
  if (value.toLowerCase().trim() === 'exit') {
    abort('Wizard cancelled by user.', 0);
  }
  return undefined;
}

async function installPackage(
  packageName: string,
  packageManager: string,
  skipInstall: boolean,
): Promise<void> {
  if (skipInstall) {
    clack.log.info(`Skipping installation of ${packageName}`);
    return;
  }

  const commands: Record<string, string> = {
    npm: `npm install ${packageName}`,
    yarn: `yarn add ${packageName}`,
    pnpm: `pnpm add ${packageName}`,
  };

  const command = commands[packageManager] || commands.npm;
  clack.log.info(`Installing ${packageName}...`);
  
  try {
    execSync(command, { stdio: 'inherit' });
    clack.log.success(`Installed ${packageName}`);
  } catch (error) {
    clack.log.error(`Failed to install ${packageName}. Please install it manually.`);
    throw error;
  }
}

async function detectProjectStructure(): Promise<ProjectInfo> {
  const packageJson = await getPackageJson();
  if (!packageJson) {
    throw new Error('Could not find package.json');
  }

  const packageManager = detectPackageManager();
  const hasTypescript = checkHasTypescript();
  const hasAppRouter = hasDirectoryPathFromRoot('app') || hasDirectoryPathFromRoot(['src', 'app']);
  const hasPagesRouter = hasDirectoryPathFromRoot('pages') || hasDirectoryPathFromRoot(['src', 'pages']);

  const nextVersion =
    packageJson.dependencies?.next ||
    packageJson.devDependencies?.next ||
    'unknown';

  return {
    hasTypescript,
    hasAppRouter,
    hasPagesRouter,
    packageManager,
    nextVersion,
  };
}

async function gatherConfiguration(
  options: WizardOptions,
  projectInfo: ProjectInfo,
): Promise<{
  accessToken: string; // Keep for backward compatibility, will be server token
  clientAccessToken: string;
  serverAccessToken: string;
  environment: string;
  enableDeployment: boolean;
  codeVersion?: string;
  enableSourcemaps: boolean;
  enableReplay: boolean;
  routerType: 'app' | 'pages' | 'both';
  createExamplePage: boolean;
  isVercel: boolean;
  vercelClientTokenEnvVar?: string;
  vercelServerTokenEnvVar?: string;
}> {
  // Step 1: Deployment platform detection
  clack.log.step('Deployment Platform');
  const isVercel = await abortIfCancelled(
    clack.confirm({
      message: 'Are you deploying with Vercel?',
      initialValue: false,
    }),
  );

  let vercelClientTokenEnvVar: string | undefined;
  let vercelServerTokenEnvVar: string | undefined;
  let accessToken: string; // Keep for backward compatibility
  let clientAccessToken: string;
  let serverAccessToken: string;

  if (isVercel) {
    clack.log.info('Using Vercel integration - we\'ll use your Vercel environment variables');
    
            vercelClientTokenEnvVar = (await abortIfCancelled(
              clack.text({
                message: 'Vercel client token environment variable name:',
                placeholder: 'e.g., VERCEL_ROLLBAR_CLIENT_TOKEN',
                validate: (value) => {
                  const exitCheck = checkForExitCommand(value);
                  if (exitCheck !== undefined) return exitCheck;
                  if (!value) return 'Environment variable name is required';
                  if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
                    return 'Invalid environment variable name. Must be uppercase with underscores (e.g., VERCEL_ROLLBAR_CLIENT_TOKEN)';
                  }
                },
              }),
            )) as string;

            vercelServerTokenEnvVar = (await abortIfCancelled(
              clack.text({
                message: 'Vercel server token environment variable name:',
                placeholder: 'e.g., VERCEL_ROLLBAR_SERVER_TOKEN',
                validate: (value) => {
                  const exitCheck = checkForExitCommand(value);
                  if (exitCheck !== undefined) return exitCheck;
                  if (!value) return 'Environment variable name is required';
                  if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
                    return 'Invalid environment variable name. Must be uppercase with underscores (e.g., VERCEL_ROLLBAR_SERVER_TOKEN)';
                  }
                },
              }),
            )) as string;

    // For Vercel, we don't need access tokens - we'll use the env vars
    accessToken = ''; // Not used when Vercel is enabled
    clientAccessToken = '';
    serverAccessToken = '';
  } else {
    // Step 2: Basic configuration (non-Vercel)
    clack.log.step('Basic Configuration');
    clack.log.info('You\'ll need both a client token (for browser) and server token (for Node.js)');
    
    serverAccessToken = (await abortIfCancelled(
      clack.text({
        message: 'Enter your Rollbar Server Project Access Token:',
        placeholder: 'post_server_item_... or hex token (32-128 chars)',
        validate: (value) => {
          // Check for exit command
          const exitCheck = checkForExitCommand(value);
          if (exitCheck !== undefined) return exitCheck;

          if (!value) return 'Server access token is required';

          const isPostToken =
            value.startsWith('post_server_item_') ||
            value.startsWith('post_client_item_');
          
          // Accept various hex token lengths:
          // - 32 chars (128-bit)
          // - 96 chars (384-bit) 
          // - 128 chars (512-bit)
          // Also accept any hex string between 32-128 chars for flexibility
          const isHexToken =
            /^[a-fA-F0-9]{32,128}$/.test(value);

          if (!isPostToken && !isHexToken) {
            return 'Invalid token format. Expected: post_server_item_xxx, post_client_item_xxx, or hex token (32-128 characters)';
          }
        },
      }),
    )) as string;

    clientAccessToken = (await abortIfCancelled(
      clack.text({
        message: 'Enter your Rollbar Client Project Access Token:',
        placeholder: 'post_client_item_... or hex token (32-128 chars)',
        validate: (value) => {
          // Check for exit command
          const exitCheck = checkForExitCommand(value);
          if (exitCheck !== undefined) return exitCheck;

          if (!value) return 'Client access token is required';

          const isPostToken =
            value.startsWith('post_server_item_') ||
            value.startsWith('post_client_item_');
          
          // Accept various hex token lengths:
          // - 32 chars (128-bit)
          // - 96 chars (384-bit) 
          // - 128 chars (512-bit)
          // Also accept any hex string between 32-128 chars for flexibility
          const isHexToken =
            /^[a-fA-F0-9]{32,128}$/.test(value);

          if (!isPostToken && !isHexToken) {
            return 'Invalid token format. Expected: post_server_item_xxx, post_client_item_xxx, or hex token (32-128 characters)';
          }
        },
      }),
    )) as string;

    // Keep accessToken for backward compatibility (use server token)
    accessToken = serverAccessToken;
  }

  const environment = await abortIfCancelled(
    clack.text({
      message: 'Environment name:',
      initialValue: options.environment || 'production',
      validate: (value) => {
        // Check for exit command
        const exitCheck = checkForExitCommand(value);
        if (exitCheck !== undefined) return exitCheck;
      },
    }),
  );

  // Step 3: Deployment tracking (skip for Vercel - they handle it automatically)
  let enableDeployment: boolean;
  let codeVersion: string | undefined;
  
  if (isVercel) {
    clack.log.info('Vercel automatically detects deployments - skipping deployment tracking setup');
    enableDeployment = false;
    codeVersion = undefined;
  } else {
    clack.log.step('Deployment & Version Tracking');
    enableDeployment = (await abortIfCancelled(
      clack.confirm({
        message: 'Enable deployment tracking?',
        initialValue: true,
      }),
    )) as boolean;

    if (enableDeployment) {
    const codeVersionValue = await abortIfCancelled(
      clack.text({
        message: 'Code version for deployment tracking:',
        placeholder: 'e.g., git commit SHA, semver version, or build number',
        initialValue: '',
        validate: (value) => {
          // Check for exit command
          const exitCheck = checkForExitCommand(value);
          if (exitCheck !== undefined) return exitCheck;

          if (!value) {
            return 'Code version is required when deployment tracking is enabled. You can also set ROLLBAR_CODE_VERSION environment variable.';
          }
          return;
        },
      }),
    );
    codeVersion = codeVersionValue as string;
    }
  }

  // Step 3: Source Maps
  clack.log.step('Source Maps');
  const enableSourcemaps = await abortIfCancelled(
    clack.confirm({
      message: 'Enable source maps for better error tracking?',
      initialValue: true,
    }),
  );

  // Step 4: Session Replay
  clack.log.step('Session Replay');
  const enableReplay = await abortIfCancelled(
    clack.confirm({
      message: 'Enable Session Replay to record user sessions?',
      initialValue: true,
    }),
  );

  // Step 5: Router type confirmation
  clack.log.step('Next.js Router Configuration');
  let routerType: 'app' | 'pages' | 'both';
  
  if (projectInfo.hasAppRouter && projectInfo.hasPagesRouter) {
    const options: Array<{ label: string; value: 'app' | 'pages' | 'both'; hint: string }> = [
      {
        label: 'App Router',
        value: 'app',
        hint: 'Modern Next.js routing (app directory)',
      },
      {
        label: 'Pages Router',
        value: 'pages',
        hint: 'Traditional Next.js routing (pages directory)',
      },
      {
        label: 'Both',
        value: 'both',
        hint: 'Using both routers in the same project',
      },
    ];
    const selected = (await abortIfCancelled(
      clack.select({
        message: 'Which router are you primarily using?',
        options,
        initialValue: 'app' as 'app' | 'pages' | 'both',
      }),
    )) as 'app' | 'pages' | 'both';
    routerType = selected;
  } else if (projectInfo.hasAppRouter) {
    routerType = 'app';
    clack.log.info('Detected App Router');
  } else if (projectInfo.hasPagesRouter) {
    routerType = 'pages';
    clack.log.info('Detected Pages Router');
  } else {
    // No router detected, ask user
    const selected = (await abortIfCancelled(
      clack.select({
        message: 'Which Next.js router are you using?',
        options: [
          {
            label: 'App Router',
            value: 'app',
            hint: 'Modern Next.js routing (app directory)',
          },
          {
            label: 'Pages Router',
            value: 'pages',
            hint: 'Traditional Next.js routing (pages directory)',
          },
        ],
      }),
    )) as 'app' | 'pages';
    routerType = selected;
  }

  // Step 6: Additional options
  clack.log.step('Additional Options');
  const createExamplePage = await abortIfCancelled(
    clack.confirm({
      message: 'Create an example error page for testing?',
      initialValue: false,
    }),
  );

  return {
    accessToken: accessToken as string, // Backward compatibility
    clientAccessToken: clientAccessToken as string,
    serverAccessToken: serverAccessToken as string,
    environment: environment as string,
    enableDeployment: enableDeployment as boolean,
    codeVersion: codeVersion || undefined,
    enableSourcemaps: enableSourcemaps as boolean,
    enableReplay: enableReplay as boolean,
    routerType,
    createExamplePage: createExamplePage as boolean,
    isVercel: isVercel as boolean,
    vercelClientTokenEnvVar,
    vercelServerTokenEnvVar,
  };
}

async function createConfigFiles(
  config: {
    accessToken: string; // Backward compatibility
    clientAccessToken: string;
    serverAccessToken: string;
    environment: string;
    enableDeployment: boolean;
    codeVersion?: string;
    enableReplay: boolean;
    enableSourcemaps: boolean;
    isVercel: boolean;
    vercelClientTokenEnvVar?: string;
    vercelServerTokenEnvVar?: string;
  },
  projectInfo: ProjectInfo,
): Promise<void> {
  const ext = projectInfo.hasTypescript ? 'ts' : 'js';

  // Create server config
  const serverConfig = getRollbarServerConfigContents(
    config.environment,
    config.codeVersion,
    config.isVercel,
    config.vercelServerTokenEnvVar,
  );
  await fs.promises.writeFile(`rollbar.server.config.${ext}`, serverConfig, 'utf8');
  clack.log.success(`Created rollbar.server.config.${ext}`);

  // Create edge config
  const edgeConfig = getRollbarEdgeConfigContents(
    config.environment,
    config.codeVersion,
    config.isVercel,
    config.vercelServerTokenEnvVar,
  );
  await fs.promises.writeFile(`rollbar.edge.config.${ext}`, edgeConfig, 'utf8');
  clack.log.success(`Created rollbar.edge.config.${ext}`);

  // Create client config
  const clientConfig = getRollbarClientConfigContents(
    config.environment,
    config.codeVersion,
    config.enableReplay,
    config.enableSourcemaps,
    config.isVercel,
    config.vercelClientTokenEnvVar,
  );
  await fs.promises.writeFile(`rollbar.client.config.${ext}`, clientConfig, 'utf8');
  clack.log.success(`Created rollbar.client.config.${ext}`);
}

async function setupNextjsConfig(
  config: {
    accessToken: string;
    environment: string;
    enableSourcemaps: boolean;
    isVercel: boolean;
  },
  projectInfo: ProjectInfo,
): Promise<void> {
  const nextConfigJsPath = path.join(process.cwd(), 'next.config.js');
  const nextConfigMjsPath = path.join(process.cwd(), 'next.config.mjs');
  const nextConfigTsPath = path.join(process.cwd(), 'next.config.ts');

  const hasNextConfigJs = fs.existsSync(nextConfigJsPath);
  const hasNextConfigMjs = fs.existsSync(nextConfigMjsPath);
  const hasNextConfigTs = fs.existsSync(nextConfigTsPath);

  // If source maps are enabled, we need to ensure productionBrowserSourceMaps is set
  if (config.enableSourcemaps) {
    if (hasNextConfigJs || hasNextConfigMjs || hasNextConfigTs) {
      // Check if productionBrowserSourceMaps is already set
      let configContent = '';
      let configPath = '';
      
      if (hasNextConfigJs) {
        configPath = nextConfigJsPath;
        configContent = await fs.promises.readFile(nextConfigJsPath, 'utf8');
      } else if (hasNextConfigMjs) {
        configPath = nextConfigMjsPath;
        configContent = await fs.promises.readFile(nextConfigMjsPath, 'utf8');
      } else if (hasNextConfigTs) {
        configPath = nextConfigTsPath;
        configContent = await fs.promises.readFile(nextConfigTsPath, 'utf8');
      }

      // Check if productionBrowserSourceMaps is configured
      const hasProductionBrowserSourceMaps = configContent.includes('productionBrowserSourceMaps');
      
      // Check if config is essentially empty (just a template)
      const isEmptyConfig = 
        configContent.includes('/* config options here */') ||
        configContent.trim().split('\n').filter(line => !line.trim().startsWith('//') && line.trim() && !line.trim().startsWith('import') && !line.trim().startsWith('export') && !line.trim().startsWith('const') && !line.trim().startsWith('module.exports') && !line.includes('NextConfig')).length <= 2;
      
      if (isEmptyConfig || !hasProductionBrowserSourceMaps) {
        // Config is empty or missing source maps config - update it
        let newConfigContent: string;
        if (hasNextConfigTs) {
          newConfigContent = getNextjsConfigTsTemplate(
            config.enableSourcemaps,
          );
        } else if (hasNextConfigMjs) {
          newConfigContent = getNextjsConfigMjsTemplate(
            config.enableSourcemaps,
          );
        } else {
          newConfigContent = getNextjsConfigCjsTemplate(
            config.enableSourcemaps,
          );
        }

        await fs.promises.writeFile(configPath, newConfigContent, 'utf8');
        clack.log.success(`Updated ${path.basename(configPath)} with Rollbar configuration`);
      } else if (!hasProductionBrowserSourceMaps) {
        clack.log.warn(
          `Please add ${chalk.cyan('productionBrowserSourceMaps: true')} to your Next.js config file (${path.basename(configPath)}) to enable source map generation.`,
        );
      } else {
        clack.log.info(`Found source map configuration in ${path.basename(configPath)}`);
      }
    } else {
      // No Next.js config exists - create one
      // Check if package.json has "type": "module" to determine if we should use .mjs
      const packageJson = await getPackageJson();
      const isEsm = (packageJson as any)?.type === 'module';

      if (projectInfo.hasTypescript && fs.existsSync(nextConfigTsPath)) {
        // Use .ts for TypeScript projects
        const configContent = getNextjsConfigTsTemplate(
          config.enableSourcemaps,
        );
        await fs.promises.writeFile(nextConfigTsPath, configContent, 'utf8');
        clack.log.success('Created next.config.ts with Rollbar configuration');
      } else if (isEsm || projectInfo.hasTypescript) {
        // Use .mjs for ESM or TypeScript projects (when .ts doesn't exist)
        const configContent = getNextjsConfigMjsTemplate(
          config.enableSourcemaps,
        );
        await fs.promises.writeFile(nextConfigMjsPath, configContent, 'utf8');
        clack.log.success('Created next.config.mjs with Rollbar configuration');
      } else {
        // Use .js for CommonJS projects
        const configContent = getNextjsConfigCjsTemplate(
          config.enableSourcemaps,
        );
        await fs.promises.writeFile(nextConfigJsPath, configContent, 'utf8');
        clack.log.success('Created next.config.js with Rollbar configuration');
      }
    }
  }
}

async function setupSourceMapUploadScript(
  config: {
    accessToken: string;
    codeVersion?: string;
    isVercel?: boolean;
    vercelServerTokenEnvVar?: string;
  },
  projectInfo: ProjectInfo,
): Promise<void> {
  // Create scripts directory if it doesn't exist
  const scriptsDir = path.join(process.cwd(), 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  // Create upload script
  const scriptContent = getSourceMapUploadScriptTemplate(
    projectInfo.hasTypescript,
    config.isVercel,
    config.vercelServerTokenEnvVar,
  );
  const scriptExt = projectInfo.hasTypescript ? 'ts' : 'js';
  const scriptPath = path.join(scriptsDir, `upload-sourcemaps.${scriptExt}`);
  
  await fs.promises.writeFile(scriptPath, scriptContent, 'utf8');
  clack.log.success(`Created scripts/upload-sourcemaps.${scriptExt}`);

  // Install required dependencies
  const requiredPackages = ['form-data', 'node-fetch', 'glob'];
  // Add tsx and @types/glob for TypeScript execution if needed
  if (projectInfo.hasTypescript) {
    requiredPackages.push('tsx', '@types/glob');
  }
  
  const packageJson = await getPackageJson();
  const missingPackages = requiredPackages.filter(
    (pkg) => 
      !packageJson?.dependencies?.[pkg] && 
      !packageJson?.devDependencies?.[pkg]
  );

  if (missingPackages.length > 0) {
    clack.log.info(`Installing required packages: ${missingPackages.join(', ')}`);
    const packageManager = detectPackageManager();
    const installCommand = packageManager === 'yarn' 
      ? `yarn add -D ${missingPackages.join(' ')}`
      : packageManager === 'pnpm'
      ? `pnpm add -D ${missingPackages.join(' ')}`
      : `npm install --save-dev ${missingPackages.join(' ')}`;
    
    try {
      execSync(installCommand, { stdio: 'inherit' });
      clack.log.success('Installed required packages');
      
      // Verify packages were added to package.json
      // pnpm/npm/yarn should automatically update both package.json and lockfile
      const updatedPackageJson = await getPackageJson();
      if (updatedPackageJson) {
        const stillMissing = missingPackages.filter(
          (pkg) =>
            !updatedPackageJson.dependencies?.[pkg] &&
            !updatedPackageJson.devDependencies?.[pkg]
        );
        
        if (stillMissing.length > 0) {
          clack.log.warn(
            `Warning: Packages may not have been added to package.json: ${stillMissing.join(', ')}`
          );
          clack.log.warn('Please verify your package.json and lockfile are in sync.');
        }
      }
      
      // Important: After installing packages, ensure lockfile is synced
      // This is critical for deployments where lockfile must match package.json
      clack.log.info('Syncing lockfile with package.json...');
      const packageManager = detectPackageManager();
      const syncCommand = packageManager === 'yarn'
        ? 'yarn install --frozen-lockfile=false'
        : packageManager === 'pnpm'
        ? 'pnpm install --no-frozen-lockfile'
        : 'npm install';
      
      try {
        execSync(syncCommand, { stdio: 'inherit' });
        clack.log.success('Lockfile synchronized');
      } catch (syncError) {
        clack.log.warn('Note: Make sure to commit both package.json and your lockfile after running the wizard.');
      }
    } catch (error) {
      clack.log.warn('Failed to install packages automatically. Please install manually:');
      clack.log.warn(`  ${installCommand}`);
    }
  }

  // Explicitly ensure packages are in package.json (in case install didn't update it)
  const updatedPackageJson = await getPackageJson();
  if (updatedPackageJson && missingPackages.length > 0) {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!updatedPackageJson.devDependencies) {
      updatedPackageJson.devDependencies = {};
    }
    
    // Add missing packages to devDependencies with appropriate versions
    const packageVersions: Record<string, string> = {
      'form-data': '^4.0.0',
      'node-fetch': '^3.3.2',
      'glob': '^13.0.0',
      'tsx': '^4.20.6',
      '@types/glob': '^8.0.0',
    };
    
    for (const pkg of missingPackages) {
      if (!updatedPackageJson.devDependencies[pkg]) {
        updatedPackageJson.devDependencies[pkg] = packageVersions[pkg] || 'latest';
      }
    }
    
    await fs.promises.writeFile(
      packageJsonPath,
      JSON.stringify(updatedPackageJson, null, 2) + '\n',
      'utf8'
    );
    clack.log.info('Updated package.json with required dependencies');
  }

  // Add postbuild script to package.json
  const finalPackageJson = await getPackageJson();
  if (finalPackageJson) {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const scripts = finalPackageJson.scripts || {};
    
    // Use tsx for TypeScript files, node for JavaScript files
    const runner = projectInfo.hasTypescript ? 'tsx' : 'node';
    
    if (!scripts.postbuild) {
      scripts.postbuild = `${runner} scripts/upload-sourcemaps.${scriptExt}`;
      finalPackageJson.scripts = scripts;
      
      await fs.promises.writeFile(
        packageJsonPath,
        JSON.stringify(finalPackageJson, null, 2) + '\n',
        'utf8'
      );
      clack.log.success('Added postbuild script to package.json');
    } else if (!scripts.postbuild.includes('upload-sourcemaps')) {
      scripts.postbuild = `${scripts.postbuild} && ${runner} scripts/upload-sourcemaps.${scriptExt}`;
      finalPackageJson.scripts = scripts;
      
      await fs.promises.writeFile(
        packageJsonPath,
        JSON.stringify(finalPackageJson, null, 2) + '\n',
        'utf8'
      );
      clack.log.success('Updated postbuild script in package.json');
    } else {
      clack.log.info('postbuild script already includes source map upload');
    }
  }
  
  // Update tsconfig.json to exclude scripts directory from TypeScript checking
  await excludeScriptsFromTypeChecking(projectInfo);
}

async function excludeScriptsFromTypeChecking(
  projectInfo: ProjectInfo,
): Promise<void> {
  if (!projectInfo.hasTypescript) {
    return; // No TypeScript, no need to exclude
  }

  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return; // No tsconfig.json, skip
  }

  try {
    const tsconfigContent = await fs.promises.readFile(tsconfigPath, 'utf8');
    const tsconfig = JSON.parse(tsconfigContent);

    // Add exclude array if it doesn't exist
    if (!tsconfig.exclude) {
      tsconfig.exclude = [];
    }

    // Add scripts directory to exclude if not already there
    if (!tsconfig.exclude.includes('scripts')) {
      tsconfig.exclude.push('scripts');
      await fs.promises.writeFile(
        tsconfigPath,
        JSON.stringify(tsconfig, null, 2) + '\n',
        'utf8'
      );
      clack.log.success('Updated tsconfig.json to exclude scripts directory');
    }
  } catch (error) {
    // If tsconfig.json is invalid JSON or has comments, skip silently
    clack.log.warn('Could not update tsconfig.json to exclude scripts directory');
  }
}

async function setupInstrumentationHook(
  projectInfo: ProjectInfo,
): Promise<void> {
  const hasRootAppDirectory = hasDirectoryPathFromRoot('app');
  const hasRootPagesDirectory = hasDirectoryPathFromRoot('pages');
  const hasSrcDirectory = hasDirectoryPathFromRoot('src');

  let instrumentationHookLocation: 'src' | 'root' | 'does-not-exist';

  const instrumentationTsExists = fs.existsSync(
    path.join(process.cwd(), 'instrumentation.ts'),
  );
  const instrumentationJsExists = fs.existsSync(
    path.join(process.cwd(), 'instrumentation.js'),
  );
  const srcInstrumentationTsExists = fs.existsSync(
    path.join(process.cwd(), 'src', 'instrumentation.ts'),
  );
  const srcInstrumentationJsExists = fs.existsSync(
    path.join(process.cwd(), 'src', 'instrumentation.js'),
  );

  if (hasRootPagesDirectory || hasRootAppDirectory) {
    if (instrumentationJsExists || instrumentationTsExists) {
      instrumentationHookLocation = 'root';
    } else {
      instrumentationHookLocation = 'does-not-exist';
    }
  } else {
    if (srcInstrumentationTsExists || srcInstrumentationJsExists) {
      instrumentationHookLocation = 'src';
    } else {
      instrumentationHookLocation = 'does-not-exist';
    }
  }

  const newInstrumentationFileName = `instrumentation.${
    projectInfo.hasTypescript ? 'ts' : 'js'
  }`;

  if (instrumentationHookLocation === 'does-not-exist') {
    let newInstrumentationHookLocation: 'root' | 'src';
    if (hasRootPagesDirectory || hasRootAppDirectory) {
      newInstrumentationHookLocation = 'root';
    } else if (hasSrcDirectory) {
      newInstrumentationHookLocation = 'src';
    } else {
      newInstrumentationHookLocation = 'root';
    }

    const newInstrumentationHookPath =
      newInstrumentationHookLocation === 'root'
        ? path.join(process.cwd(), newInstrumentationFileName)
        : path.join(process.cwd(), 'src', newInstrumentationFileName);

    const content = getInstrumentationHookContent(newInstrumentationHookLocation);
    await fs.promises.writeFile(newInstrumentationHookPath, content, 'utf8');
    clack.log.success(`Created ${newInstrumentationFileName}`);
  } else {
    clack.log.info(
      `Found existing instrumentation file. Please add the following code:`,
    );
    console.log(
      getInstrumentationHookCopyPasteSnippet(instrumentationHookLocation),
    );

    const shouldContinue = await abortIfCancelled(
      clack.confirm({
        message: `Did you add the code to your ${chalk.cyan(
          instrumentationHookLocation === 'root'
            ? newInstrumentationFileName
            : `src/${newInstrumentationFileName}`,
        )} file?`,
        active: 'Yes',
        inactive: 'No',
      }),
    );

    if (!shouldContinue) {
      abort();
    }
  }
}

async function setupErrorPages(
  projectInfo: ProjectInfo,
  routerType: 'app' | 'pages' | 'both',
): Promise<void> {
  // Setup _error.tsx for Pages Router (only if using Pages Router)
  if (routerType === 'pages' || routerType === 'both') {
    const srcDir = path.join(process.cwd(), 'src');
    const maybePagesDirPath = path.join(process.cwd(), 'pages');
    const maybeSrcPagesDirPath = path.join(srcDir, 'pages');

    const pagesLocation =
      fs.existsSync(maybePagesDirPath) &&
      fs.lstatSync(maybePagesDirPath).isDirectory()
        ? ['pages']
        : fs.existsSync(maybeSrcPagesDirPath) &&
          fs.lstatSync(maybeSrcPagesDirPath).isDirectory()
        ? ['src', 'pages']
        : undefined;

    if (pagesLocation) {
    const underscoreErrorPageFile = fs.existsSync(
      path.join(process.cwd(), ...pagesLocation, '_error.tsx'),
    )
      ? '_error.tsx'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.ts'))
      ? '_error.ts'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.jsx'))
      ? '_error.jsx'
      : fs.existsSync(path.join(process.cwd(), ...pagesLocation, '_error.js'))
      ? '_error.js'
      : undefined;

    if (!underscoreErrorPageFile) {
      const underscoreErrorFileName = `_error.${
        projectInfo.hasTypescript ? 'tsx' : 'jsx'
      }`;

      await fs.promises.writeFile(
        path.join(process.cwd(), ...pagesLocation, underscoreErrorFileName),
        getRollbarDefaultUnderscoreErrorPage(pagesLocation),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(
          path.join(...pagesLocation, underscoreErrorFileName),
        )}.`,
      );
    }
    }
  }

  // Setup global-error.tsx for App Router (only if using App Router)
  if (routerType === 'app' || routerType === 'both') {
    const appDirLocation = getMaybeAppDirLocation();

    if (appDirLocation) {
    const globalErrorPageFile = fs.existsSync(
      path.join(process.cwd(), ...appDirLocation, 'global-error.tsx'),
    )
      ? 'global-error.tsx'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.ts'),
        )
      ? 'global-error.ts'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.jsx'),
        )
      ? 'global-error.jsx'
      : fs.existsSync(
          path.join(process.cwd(), ...appDirLocation, 'global-error.js'),
        )
      ? 'global-error.js'
      : undefined;

    if (!globalErrorPageFile) {
      const newGlobalErrorFileName = `global-error.${
        projectInfo.hasTypescript ? 'tsx' : 'jsx'
      }`;

      await fs.promises.writeFile(
        path.join(process.cwd(), ...appDirLocation, newGlobalErrorFileName),
        getRollbarDefaultGlobalErrorPage(
          projectInfo.hasTypescript,
          appDirLocation,
        ),
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(
          path.join(...appDirLocation, newGlobalErrorFileName),
        )}.`,
      );
    }
    }
  }
}

async function setupEnvironmentVariables(
  config: {
    accessToken: string; // Backward compatibility
    clientAccessToken: string;
    serverAccessToken: string;
    enableDeployment: boolean;
    codeVersion?: string;
    isVercel: boolean;
    vercelClientTokenEnvVar?: string;
    vercelServerTokenEnvVar?: string;
  },
): Promise<void> {
  const envLocal = '.env.local';
  let envContent = '';

  if (fs.existsSync(envLocal)) {
    envContent = await fs.promises.readFile(envLocal, 'utf-8');
  }

  if (config.isVercel) {
    // For Vercel, add comments about the environment variables
    if (!envContent.includes('# Rollbar Configuration')) {
      envContent += `\n# Rollbar Configuration (Vercel)
# These environment variables are set by Vercel's Rollbar integration
# Client Token: ${config.vercelClientTokenEnvVar || 'VERCEL_ROLLBAR_CLIENT_TOKEN'}
# Server Token: ${config.vercelServerTokenEnvVar || 'VERCEL_ROLLBAR_SERVER_TOKEN'}
`;
    }
  } else {
    // For non-Vercel, add the actual tokens
    if (!envContent.includes('ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN')) {
      envContent += `\n# Rollbar Configuration
ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN=${config.serverAccessToken}
NEXT_PUBLIC_ROLLBAR_PROJECT_ACCESS_CLIENT_TOKEN=${config.clientAccessToken}
`;
    }
  }

  if (config.enableDeployment && config.codeVersion && !envContent.includes('ROLLBAR_CODE_VERSION')) {
    envContent += `ROLLBAR_CODE_VERSION=${config.codeVersion}\n`;
  } else if (config.enableDeployment && !envContent.includes('ROLLBAR_CODE_VERSION')) {
    envContent += `# Set ROLLBAR_CODE_VERSION to track deployments (e.g., git commit SHA, semver, build number)
# ROLLBAR_CODE_VERSION=your-version-here\n`;
  }

  await fs.promises.writeFile(envLocal, envContent, 'utf8');
  clack.log.success('Updated .env.local with Rollbar configuration');

  // Add to .gitignore if not present
  const gitignore = '.gitignore';
  if (fs.existsSync(gitignore)) {
    let gitignoreContent = await fs.promises.readFile(gitignore, 'utf-8');
    if (!gitignoreContent.includes('.env.local')) {
      gitignoreContent += '\n# Environment variables\n.env.local\n';
      await fs.promises.writeFile(gitignore, gitignoreContent, 'utf8');
    }
  }
}

async function createExamplePage(
  config: { accessToken: string; clientAccessToken: string },
  projectInfo: ProjectInfo,
): Promise<void> {
  const hasSrcDirectory = hasDirectoryPathFromRoot('src');
  const hasRootAppDirectory = hasDirectoryPathFromRoot('app');
  const hasRootPagesDirectory = hasDirectoryPathFromRoot('pages');
  const hasSrcAppDirectory = hasDirectoryPathFromRoot(['src', 'app']);
  const hasSrcPagesDirectory = hasDirectoryPathFromRoot(['src', 'pages']);

  const appFolderLocation = hasRootAppDirectory
    ? ['app']
    : hasSrcAppDirectory
    ? ['src', 'app']
    : undefined;

  let pagesFolderLocation = hasRootPagesDirectory
    ? ['pages']
    : hasSrcPagesDirectory
    ? ['src', 'pages']
    : undefined;

  if (!appFolderLocation && !pagesFolderLocation) {
    const newPagesFolderLocation = hasSrcDirectory ? ['src', 'pages'] : ['pages'];
    fs.mkdirSync(path.join(process.cwd(), ...newPagesFolderLocation), {
      recursive: true,
    });
    pagesFolderLocation = newPagesFolderLocation;
  }

  if (appFolderLocation) {
    const appFolderPath = path.join(process.cwd(), ...appFolderLocation);

    const hasRootLayout = hasRootLayoutFile(appFolderPath);

    if (!hasRootLayout) {
      const newRootLayoutFilename = `layout.${
        projectInfo.hasTypescript ? 'tsx' : 'jsx'
      }`;

      const rootLayoutContent = `export const metadata = {
  title: 'Rollbar NextJS Example',
  description: 'Generated by Rollbar Wizard',
}

export default function RootLayout({
  children,
}${
        projectInfo.hasTypescript
          ? `: {
  children: React.ReactNode
}`
          : ''
      }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`;

      await fs.promises.writeFile(
        path.join(appFolderPath, newRootLayoutFilename),
        rootLayoutContent,
        { encoding: 'utf8', flag: 'w' },
      );

      clack.log.success(
        `Created ${chalk.cyan(
          path.join(...appFolderLocation, newRootLayoutFilename),
        )}.`,
      );
    }

    const examplePageContents = getRollbarExamplePageContents({
      accessToken: config.clientAccessToken,
      useClient: true,
      isTypeScript: projectInfo.hasTypescript,
      appDirLocation: appFolderLocation,
    });

    fs.mkdirSync(path.join(appFolderPath, 'rollbar-example-page'), {
      recursive: true,
    });

    const newPageFileName = `page.${projectInfo.hasTypescript ? 'tsx' : 'jsx'}`;

    await fs.promises.writeFile(
      path.join(appFolderPath, 'rollbar-example-page', newPageFileName),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...appFolderLocation, 'rollbar-example-page', newPageFileName),
      )}.`,
    );

    // Create API route for server-side error testing (App Router)
    fs.mkdirSync(path.join(appFolderPath, 'api', 'rollbar-example-api'), {
      recursive: true,
    });

    const newApiRouteFileName = `route.${projectInfo.hasTypescript ? 'ts' : 'js'}`;

    const apiRouteContents = getRollbarExampleAppDirApiRoute({
      isTypeScript: projectInfo.hasTypescript,
      appDirLocation: appFolderLocation,
    });

    await fs.promises.writeFile(
      path.join(appFolderPath, 'api', 'rollbar-example-api', newApiRouteFileName),
      apiRouteContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...appFolderLocation, 'api', 'rollbar-example-api', newApiRouteFileName),
      )}.`,
    );
  } else if (pagesFolderLocation) {
    const examplePageContents = getRollbarExamplePageContents({
      accessToken: config.clientAccessToken,
      useClient: false,
      isTypeScript: projectInfo.hasTypescript,
      pagesFolderLocation,
    });

    const examplePageFileName = `rollbar-example-page.${
      projectInfo.hasTypescript ? 'tsx' : 'jsx'
    }`;

    await fs.promises.writeFile(
      path.join(process.cwd(), ...pagesFolderLocation, examplePageFileName),
      examplePageContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...pagesFolderLocation, examplePageFileName),
      )}.`,
    );

    // Create API route for server-side error testing (Pages Router)
    fs.mkdirSync(path.join(process.cwd(), ...pagesFolderLocation, 'api'), {
      recursive: true,
    });

    const apiRouteFileName = `rollbar-example-api.${
      projectInfo.hasTypescript ? 'ts' : 'js'
    }`;

    const apiRouteContents = getRollbarExamplePagesDirApiRoute({
      isTypeScript: projectInfo.hasTypescript,
      pagesFolderLocation,
    });

    await fs.promises.writeFile(
      path.join(process.cwd(), ...pagesFolderLocation, 'api', apiRouteFileName),
      apiRouteContents,
      { encoding: 'utf8', flag: 'w' },
    );

    clack.log.success(
      `Created ${chalk.cyan(
        path.join(...pagesFolderLocation, 'api', apiRouteFileName),
      )}.`,
    );
  }
}

export async function runNextjsWizard(options: WizardOptions = {}) {
  // Setup exit handlers for Ctrl+C and SIGTERM BEFORE any prompts
  setupExitHandlers();

  clack.intro(chalk.blue.bold('🎯 Rollbar Next.js Setup Wizard'));

  try {
    const projectInfo = await detectProjectStructure();

    clack.log.info(
      `Detected Next.js ${projectInfo.nextVersion} with ${projectInfo.packageManager}`,
    );

    if (projectInfo.hasAppRouter) {
      clack.log.info('✅ App Router detected');
    }
    if (projectInfo.hasPagesRouter) {
      clack.log.info('✅ Pages Router detected');
    }
    if (projectInfo.hasTypescript) {
      clack.log.info('✅ TypeScript detected');
    }

    let config: {
      accessToken: string; // Backward compatibility
      clientAccessToken: string;
      serverAccessToken: string;
      environment: string;
      enableDeployment: boolean;
      codeVersion?: string;
      enableReplay: boolean;
      enableSourcemaps: boolean;
      routerType: 'app' | 'pages' | 'both';
      createExamplePage: boolean;
      isVercel: boolean;
      vercelClientTokenEnvVar?: string;
      vercelServerTokenEnvVar?: string;
    };

    if (!options.yes) {
      config = await gatherConfiguration(options, projectInfo);
    } else {
      // Auto-detect router type for non-interactive mode
      let routerType: 'app' | 'pages' | 'both' = 'app';
      if (projectInfo.hasAppRouter && projectInfo.hasPagesRouter) {
        routerType = 'both';
      } else if (projectInfo.hasPagesRouter) {
        routerType = 'pages';
      }

      const serverToken = options.accessToken || process.env.ROLLBAR_PROJECT_ACCESS_SERVER_TOKEN || '';
      const clientToken = process.env.NEXT_PUBLIC_ROLLBAR_PROJECT_ACCESS_CLIENT_TOKEN || serverToken;
      config = {
        accessToken: serverToken, // Backward compatibility
        clientAccessToken: clientToken,
        serverAccessToken: serverToken,
        environment: options.environment || 'production',
        enableDeployment: true,
        codeVersion: process.env.ROLLBAR_CODE_VERSION,
        enableReplay: true,
        enableSourcemaps: true,
        routerType,
        createExamplePage: false,
        isVercel: false,
        vercelClientTokenEnvVar: undefined,
        vercelServerTokenEnvVar: undefined,
      };
    }

    if (!config.isVercel && (!config.serverAccessToken || !config.clientAccessToken)) {
      clack.log.error('Both server and client access tokens are required. Get them from https://rollbar.com/');
      abort();
    }

    const spinner = clack.spinner();

    // Step 1: Install packages
    spinner.start('Installing Rollbar packages...');
    // Install rollbar 3.0+ (required for rollbar/replay export and modern features)
    await installPackage('rollbar@^3.0.0-rc.1', projectInfo.packageManager, !!options.skipInstall);
    await installPackage(
      '@rollbar/react',
      projectInfo.packageManager,
      !!options.skipInstall,
    );
    spinner.stop('✅ Rollbar packages installed');

    // Step 2: Create configuration files
    spinner.start('Creating configuration files...');
    await createConfigFiles(config, projectInfo);
    spinner.stop('✅ Configuration files created');

    // Step 3: Setup instrumentation hook
    spinner.start('Setting up instrumentation hook...');
    await setupInstrumentationHook(projectInfo);
    spinner.stop('✅ Instrumentation hook configured');

    // Step 4: Setup error pages
    spinner.start('Setting up error pages...');
    await setupErrorPages(projectInfo, config.routerType);
    spinner.stop('✅ Error pages configured');

    // Step 5: Setup environment variables
    spinner.start('Setting up environment variables...');
    await setupEnvironmentVariables(config);
    spinner.stop('✅ Environment variables configured');

    // Step 6: Setup Next.js config (for source maps)
    if (config.enableSourcemaps) {
      spinner.start('Configuring Next.js for source maps...');
      await setupNextjsConfig(config, projectInfo);
      spinner.stop('✅ Next.js config configured');
    }

    // Step 7: Setup source map upload script
    if (config.enableSourcemaps) {
      spinner.start('Setting up source map upload script...');
      await setupSourceMapUploadScript(config, projectInfo);
      spinner.stop('✅ Source map upload script configured');
    }

    // Step 8: Create example page (optional)
    if (config.createExamplePage) {
      spinner.start('Creating example error page...');
      await createExamplePage(config, projectInfo);
      spinner.stop('✅ Example error page created');
    }

    // Summary of what was configured
    const configuredFeatures = [];
    if (config.enableDeployment) {
      configuredFeatures.push('Deployment Tracking');
    }
    if (config.enableSourcemaps) {
      configuredFeatures.push('Source Maps');
    }
    if (config.enableReplay) {
      configuredFeatures.push('Session Replay');
    }

    clack.outro(`
${chalk.green('Successfully installed Rollbar for Next.js!')}

${chalk.bold('Configured Features:')}
${configuredFeatures.length > 0 ? configuredFeatures.map(f => `  ✅ ${f}`).join('\n') : '  (none)'}
${config.enableDeployment && config.codeVersion ? `  📦 Code Version: ${config.codeVersion}` : ''}
${chalk.bold('Router Type:')} ${config.routerType === 'both' ? 'App Router + Pages Router' : config.routerType === 'app' ? 'App Router' : 'Pages Router'}

${
      config.createExamplePage
        ? `\nYou can validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
            `${projectInfo.packageManager} run dev`,
          )}) and visiting ${chalk.cyan('"/rollbar-example-page"')}`
        : ''
    }

${chalk.dim('If you encounter any issues, let us know here: https://github.com/rollbar/rollbar-wizard/issues')}
`);
  } catch (error) {
    clack.log.error('Setup failed');
    if (error instanceof Error) {
      clack.log.error(error.message);
    }
    abort();
  }
}
