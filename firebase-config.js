const firebaseConfig = {
  apiKey: "AIzaSyBX0tNF3xJrhNRqHGfhFAuJSD27FbgAZOk",
  authDomain: "dojo-hamdar-alunos.firebaseapp.com",
  projectId: "dojo-hamdar-alunos",
  storageBucket: "dojo-hamdar-alunos.firebasestorage.app",
  messagingSenderId: "133503360138",
  appId: "1:133503360138:web:8c040e8b46802c08b2e173",
  measurementId: "G-RN4DV0QT7C"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

window.firebaseDb = firebase.firestore();
window.firebaseAuth = firebase.auth();
