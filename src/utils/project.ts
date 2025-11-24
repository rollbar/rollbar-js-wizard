import * as fs from 'fs-extra';
import * as path from 'path';

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export async function getPackageJson(): Promise<PackageJson | null> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    return packageJson;
  } catch (error) {
    return null;
  }
}

export function isNextjsProject(): boolean {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = fs.readJsonSync(packageJsonPath);
    const hasNext = !!(
      packageJson.dependencies?.next || 
      packageJson.devDependencies?.next
    );

    return hasNext;
  } catch (error) {
    return false;
  }
}

export function isNuxtjsProject(): boolean {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = fs.readJsonSync(packageJsonPath);
    const hasNuxt = !!(
      packageJson.dependencies?.nuxt || 
      packageJson.devDependencies?.nuxt ||
      packageJson.dependencies?.['@nuxt/kit'] ||
      packageJson.devDependencies?.['@nuxt/kit']
    );

    // Also check for nuxt.config files
    const hasNuxtConfig = fs.existsSync('nuxt.config.ts') || 
                         fs.existsSync('nuxt.config.js') ||
                         fs.existsSync('nuxt.config.mjs');

    return hasNuxt || hasNuxtConfig;
  } catch (error) {
    return false;
  }
}

export function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' {
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (fs.existsSync('yarn.lock')) return 'yarn';
  return 'npm';
}

export function hasTypescript(): boolean {
  return fs.existsSync('tsconfig.json');
}

export function hasAppRouter(): boolean {
  return fs.existsSync('app') || fs.existsSync('src/app');
}

export function hasPagesRouter(): boolean {
  return fs.existsSync('pages') || fs.existsSync('src/pages');
}

export function hasDirectoryPathFromRoot(dirnameOrDirs: string | string[]): boolean {
  const dirPath = Array.isArray(dirnameOrDirs)
    ? path.join(process.cwd(), ...dirnameOrDirs)
    : path.join(process.cwd(), dirnameOrDirs);

  return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
}

export function hasNuxtPages(): boolean {
  return fs.existsSync('pages') || fs.existsSync('src/pages');
}

export function hasNuxtComponents(): boolean {
  return fs.existsSync('components') || fs.existsSync('src/components');
}

export function isSvelteProject(): boolean {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    const packageJson = fs.readJsonSync(packageJsonPath);
    const hasSvelte = !!(
      packageJson.dependencies?.svelte ||
      packageJson.devDependencies?.svelte ||
      packageJson.dependencies?.['@sveltejs/kit'] ||
      packageJson.devDependencies?.['@sveltejs/kit']
    );
    // Also check for svelte config files
    const hasSvelteConfig = fs.existsSync('svelte.config.js') || fs.existsSync('svelte.config.ts');
    return hasSvelte || hasSvelteConfig;
  } catch (error) {
    return false;
  }
} 