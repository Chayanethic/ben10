import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// IMPORTANT: In browser bundles Next.js only inlines direct NEXT_PUBLIC_* references.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || undefined,
};

const required = [
  ['NEXT_PUBLIC_FIREBASE_API_KEY', config.apiKey],
  ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', config.authDomain],
  ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', config.projectId],
  ['NEXT_PUBLIC_FIREBASE_APP_ID', config.appId],
] as const;

export const missingFirebaseEnv = required
  .filter(([, value]) => !value.trim() || value.includes('your-'))
  .map(([key]) => key);

export const firebaseReady = missingFirebaseEnv.length === 0;
export const isFirebaseConfigured = firebaseReady;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

if (firebaseReady) {
  try {
    app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app);
  } catch (err) {
    console.warn('Firebase initialization warning:', err);
  }
}

/**
 * Ensures the player always has a valid UID immediately.
 * Attempts Firebase Anonymous Auth (with a 2.5s timeout so the UI never hangs on "CONNECTING")
 * and automatically falls back to a persistent session UID when offline or if Anonymous Auth is not enabled yet.
 */
export async function ensurePlayerIdentity(): Promise<{
  uid: string;
  isFirebaseAuth: boolean;
}> {
  if (auth && firebaseReady) {
    if (auth.currentUser) {
      return { uid: auth.currentUser.uid, isFirebaseAuth: true };
    }
    try {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 2500)
      );
      const cred = await Promise.race([signInAnonymously(auth), timeoutPromise]);
      if (cred && 'user' in cred && cred.user) {
        return { uid: cred.user.uid, isFirebaseAuth: true };
      }
    } catch {
      // Fallback to local session identity below so screen never blocks
    }
  }

  if (typeof window !== 'undefined') {
    const key = 'omnitrix_arena_player_uid_v2';
    let stored = window.sessionStorage.getItem(key);
    if (!stored) {
      stored =
        'plr_' +
        Math.random().toString(36).substring(2, 9) +
        '_' +
        Date.now().toString(36);
      window.sessionStorage.setItem(key, stored);
    }
    return { uid: stored, isFirebaseAuth: false };
  }

  return { uid: 'server_guest', isFirebaseAuth: false };
}

export { app, auth, db, storage, functions };
