// Initialize Firebase and global variables immediately
const firebaseConfig = {
    apiKey: "AIzaSyDvIc4TU0mxFkwYfHPlOr0snWoJlOpeZM4",
    authDomain: "let-s-chat-9e345.firebaseapp.com",
    projectId: "let-s-chat-9e345",
    storageBucket: "let-s-chat-9e345.firebasestorage.app",
    messagingSenderId: "965237110828",
    appId: "1:965237110828:web:2ef48a1569d46a63f3b989",
    measurementId: "G-QKZQQ3PMWF"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create global variables - only what we need
window.APP = {
    auth: firebase.auth(),
    db: firebase.firestore()
};