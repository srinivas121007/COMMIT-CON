/**
 * Firebase Project Configuration
 * 
 * Replace the placeholder values below with your Firebase web app configuration
 * from the Firebase Console (Project Settings > General > Your apps > Web app).
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890abcdef"
};

/**
 * Returns true if the configuration has been replaced with real credentials.
 */
export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig) &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId !== "your-project-id" &&
    typeof firebaseConfig.apiKey === "string" &&
    firebaseConfig.apiKey.length > 5
  );
}
