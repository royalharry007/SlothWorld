import { existsSync } from 'node:fs';

// Finds an installed Chrome (or Edge/Chromium) for the test and screenshot scripts.
// Set CHROME_PATH to override.
export function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates: Record<string, string[]> = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  };
  const found = (candidates[process.platform] ?? []).find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH to a Chromium-based browser.');
  return found;
}
