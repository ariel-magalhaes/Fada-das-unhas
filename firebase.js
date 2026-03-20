import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1-NIRHFth-981lUfI7qX6z8wxXqM5nTw",
  authDomain: "fada-das-unhas-esmalteria.firebaseapp.com",
  projectId: "fada-das-unhas-esmalteria",
  storageBucket: "fada-das-unhas-esmalteria.firebasestorage.app",
  messagingSenderId: "237371431017",
  appId: "1:237371431017:web:b003c6bdd1f37d5dabeaf8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };