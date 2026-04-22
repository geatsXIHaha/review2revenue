import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Debug: log if env vars are loaded
console.log('Firebase Config loaded:', {
  apiKeyLoaded: !!firebaseConfig.apiKey,
  projectIdLoaded: !!firebaseConfig.projectId,
  appIdLoaded: !!firebaseConfig.appId,
});

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Missing Firebase environment variables. Check .env.local file.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log('Firebase app initialized successfully');

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
console.log('Firebase Auth initialized');

// Initialize Analytics (optional)
let analytics = null;
try {
  analytics = getAnalytics(app);
  console.log('Firebase Analytics initialized');
} catch (error) {
  console.log("Analytics not available in this environment:", error.message);
}

export default app;
