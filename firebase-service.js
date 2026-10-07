// Import des outils officiels Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// Ta configuration officielle
const firebaseConfig = {
  apiKey: "AIzaSyAWaSye4QCxI5Fqhgj2XYObvpSterXYQ_M",
  authDomain: "noteo-v1-6.firebaseapp.com",
  projectId: "noteo-v1-6",
  storageBucket: "noteo-v1-6.firebasestorage.app",
  messagingSenderId: "534863490592",
  appId: "1:534863490592:web:cf3b9b8c1c74c096a21645"
};

// Initialisation des services
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- FONCTIONS D'AUTHENTIFICATION ---

// Connexion avec une fenêtre Popup Google
export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        console.log("Connecté en tant que :", result.user.displayName);
        return result.user;
    } catch (error) {
        console.error("Erreur de connexion :", error);
        alert("Erreur lors de la connexion avec Google.");
    }
};

// Déconnexion
export const logout = async () => {
    try {
        await signOut(auth);
        console.log("Utilisateur déconnecté");
    } catch (error) {
        console.error("Erreur de déconnexion :", error);
    }
};

// Écouter si l'utilisateur est connecté ou non
export const observeAuthState = (callback) => {
    return onAuthStateChanged(auth, callback);
};

// --- FONCTIONNALITÉS FIRESTORE (BASE DE DONNÉES CLOUD) ---

// 1. Sauvegarder ou mettre à jour une note dans le dossier personnel de l'utilisateur
export const saveNoteToCloud = async (userId, noteItem) => {
  try {
      // Architecture Firestore : collection 'users' -> document [userId] -> sous-collection 'notes' -> document [note.id]
      const noteRef = doc(db, "users", userId, "notes", String(noteItem.id));
      await setDoc(noteRef, noteItem);
      console.log("☁️ Note sauvegardée dans le Cloud avec succès !");
  } catch (error) {
      console.error("Erreur lors de l'envoi sur le cloud :", error);
  }
};

// 2. Supprimer une note du cloud
export const deleteNoteFromCloud = async (userId, noteId) => {
  try {
      const noteRef = doc(db, "users", userId, "notes", String(noteId));
      await deleteDoc(noteRef);
      console.log("☁️ Note supprimée du Cloud !");
  } catch (error) {
      console.error("Erreur de suppression cloud :", error);
  }
};

// 3. Écouter les notes en temps réel (Synchronisation automatique)
export const subscribeToUserNotes = (userId, onDataReceived) => {
  const notesCollectionRef = collection(db, "users", userId, "notes");
  
  // onSnapshot écoute la base de données 24h/24 et déclenche un callback dès que quelque chose change
  return onSnapshot(notesCollectionRef, (snapshot) => {
      const notesCloud = [];
      snapshot.forEach((doc) => {
          notesCloud.push(doc.data());
      });
      console.log("☁️ Synchronisation réussie :", notesCloud.length, "notes récupérées.");
      onDataReceived(notesCloud);
  }, (error) => {
      console.error("Erreur de synchronisation :", error);
  });
};