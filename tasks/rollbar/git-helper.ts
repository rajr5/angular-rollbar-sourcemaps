import { execSync } from 'child_process';

export function getGitRevision(): string {
  if (process.env.SOURCE_VERSION) {
    console.log('Getting revision from environment variable', process.env.SOURCE_VERSION);
    return process.env.SOURCE_VERSION;
  }
  try {
    return execSync('git rev-parse --short HEAD')
      .toString()
      .trim();
  } catch (ex) {
    return '-none-';
  }
}
