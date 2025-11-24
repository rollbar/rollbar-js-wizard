import * as fs from 'fs';
import * as path from 'path';
import { major, minVersion } from 'semver';

export function getNextJsVersionBucket(version: string | undefined): string {
  if (!version) {
    return 'none';
  }

  try {
    const minVer = minVersion(version);
    if (!minVer) {
      return 'invalid';
    }
    const majorVersion = major(minVer);
    if (majorVersion >= 11) {
      return `${majorVersion}.x`;
    }
    return '<11.0.0';
  } catch {
    return 'unknown';
  }
}

export function getMaybeAppDirLocation(): string[] | undefined {
  const maybeAppDirPath = path.join(process.cwd(), 'app');
  const maybeSrcAppDirPath = path.join(process.cwd(), 'src', 'app');

  return fs.existsSync(maybeAppDirPath) &&
    fs.lstatSync(maybeAppDirPath).isDirectory()
    ? ['app']
    : fs.existsSync(maybeSrcAppDirPath) &&
      fs.lstatSync(maybeSrcAppDirPath).isDirectory()
    ? ['src', 'app']
    : undefined;
}

export function hasRootLayoutFile(appFolderPath: string): boolean {
  return ['jsx', 'tsx', 'js'].some((ext) =>
    fs.existsSync(path.join(appFolderPath, `layout.${ext}`)),
  );
}

export function hasDirectoryPathFromRoot(dirnameOrDirs: string | string[]): boolean {
  const dirPath = Array.isArray(dirnameOrDirs)
    ? path.join(process.cwd(), ...dirnameOrDirs)
    : path.join(process.cwd(), dirnameOrDirs);

  return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
}

