import { APP_VERSION } from '@/src/config';

const RELEASES_URL = 'https://api.github.com/repos/shreeharsh-patil/Harmonia-mobile/releases/latest';

function numbers(version: string) {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(candidate: string, current = APP_VERSION) {
  const left = numbers(candidate);
  const right = numbers(current);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return false;
}

export async function checkForAppUpdate() {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Harmonia-Mobile',
    },
  });

  if (response.status === 404) {
    return {
      currentVersion: APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: 'https://github.com/shreeharsh-patil/Harmonia-mobile/releases',
    };
  }

  if (!response.ok) {
    throw new Error('Could not check for updates');
  }

  const release = await response.json();
  const latestVersion = String(release?.tag_name || release?.name || '').replace(/^v/i, '').trim();

  return {
    currentVersion: APP_VERSION,
    latestVersion: latestVersion || null,
    updateAvailable: latestVersion ? isNewerVersion(latestVersion) : false,
    releaseUrl: String(release?.html_url || 'https://github.com/shreeharsh-patil/Harmonia-mobile/releases'),
  };
}
