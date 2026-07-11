import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCtcEqneGG4yKs9jKSffTVBsLayLfocvrY",
  authDomain: "do-not-delete-apis-31161.firebaseapp.com",
  projectId: "do-not-delete-apis-31161",
  storageBucket: "do-not-delete-apis-31161.firebasestorage.app",
  messagingSenderId: "733085447994",
  appId: "1:733085447994:web:8b1513202c9e7b7c8c0203"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore pointing specifically to the 'sanmati-sales' database
const db = initializeFirestore(app, {
  databaseId: "sanmati-sales"
});

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
