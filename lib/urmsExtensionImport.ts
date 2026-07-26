// Talks to the "ULAB Faculty Companion" Chrome extension to import a student
// list scraped from the URMS "Section Wise Result Entry" page.

export const URMS_EXTENSION_STORE_ID = 'ajpnbeaggcpfdidjpmlioakibolcfnho';
export const URMS_EXTENSION_STORE_URL =
  'https://chromewebstore.google.com/detail/ulab-faculty-companion/ajpnbeaggcpfdidjpmlioakibolcfnho';

// The published Web Store build always has the id above, but an unpacked
// (dev-loaded) build gets a random per-install id instead. There's no way to
// look an extension up "by name" from a webpage, so we just try a short list
// of candidate ids and use whichever one actually responds. Add your local
// dev extension id via NEXT_PUBLIC_URMS_EXTENSION_DEV_IDS (comma-separated)
// in .env.local if you're testing an unpacked build.
const devIds = (process.env.NEXT_PUBLIC_URMS_EXTENSION_DEV_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

export const URMS_EXTENSION_CANDIDATE_IDS = [URMS_EXTENSION_STORE_ID, ...devIds];

export interface ScrapedUrmsStudent {
  studentId: string;
  name: string;
}

export interface UrmsStudentsMessage {
  type: 'STUDENTS';
  students: ScrapedUrmsStudent[];
  semester?: string;
  courseId?: string;
  section?: string;
}

export interface UrmsMismatchMessage {
  type: 'COURSE_MISMATCH';
  courseId: string;
  expectedCourseCodes: string[];
}

function getChromeRuntime(): any | null {
  if (typeof window === 'undefined') return null;
  const runtime = (window as any).chrome?.runtime;
  return runtime && typeof runtime.sendMessage === 'function' ? runtime : null;
}

function pingId(runtime: any, extensionId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    try {
      runtime.sendMessage(extensionId, { type: 'PING' }, (response: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Accessing lastError prevents "Unchecked runtime.lastError" console noise.
        const err = runtime.lastError;
        resolve(!err && !!response?.type);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

/** Resolves the first candidate extension id that responds to a PING, or null if none do. */
export async function resolveExtensionId(timeoutMs = 1200): Promise<string | null> {
  const runtime = getChromeRuntime();
  if (!runtime) return null;

  for (const id of URMS_EXTENSION_CANDIDATE_IDS) {
    // eslint-disable-next-line no-await-in-loop
    if (await pingId(runtime, id, timeoutMs)) return id;
  }
  return null;
}

export interface ImportSession {
  disconnect: () => void;
}

/**
 * Opens a persistent connection to the extension (by its resolved id) and
 * invokes `onStudents` whenever a scraped student list arrives.
 *
 * `mode: 'start'` also asks the extension to pop open the URMS page — use
 * this for the user's initial click. `mode: 'resume'` just reconnects and
 * checks whether a result is already sitting cached (e.g. because the
 * previous connection died while the extension's service worker went idle
 * during a long login) — use this for silent auto-retries, since it does
 * NOT open another URMS window.
 */
export function connectAndStartImport(
  extensionId: string,
  mode: 'start' | 'resume',
  expectedCourseCodes: string[],
  onStudents: (message: UrmsStudentsMessage) => void,
  onMismatch?: (message: UrmsMismatchMessage) => void,
  onDisconnect?: () => void
): ImportSession | null {
  const runtime = getChromeRuntime();
  if (!runtime || typeof runtime.connect !== 'function') return null;

  const port = runtime.connect(extensionId, { name: 'mms-urms-import' });

  port.onMessage.addListener((message: any) => {
    if (message?.type === 'STUDENTS') {
      onStudents(message as UrmsStudentsMessage);
    } else if (message?.type === 'COURSE_MISMATCH') {
      onMismatch?.(message as UrmsMismatchMessage);
    }
  });

  port.onDisconnect.addListener(() => {
    onDisconnect?.();
  });

  port.postMessage({
    type: mode === 'start' ? 'START_IMPORT' : 'RESUME_IMPORT',
    expectedCourseCodes,
  });

  return {
    disconnect: () => port.disconnect(),
  };
}
