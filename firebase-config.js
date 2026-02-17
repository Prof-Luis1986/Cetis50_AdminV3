/* firebase-config.js
   Inicializa Firebase (modo compat) y deja disponible window.db (Firestore)
   Si cambias la configuración en Firebase Console, actualiza esta constante.
*/

(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyAOAjfoxPMk2eE6maO5KUgQcWkrsUDxQyk",
    authDomain: "cetis50web.firebaseapp.com",
    projectId: "cetis50web",
    storageBucket: "cetis50web.firebasestorage.app",
    messagingSenderId: "202492003192",
    appId: "1:202492003192:web:0212f791eb0a4740cd3e8d"
  };
  window.__FIREBASE_CONFIG__ = firebaseConfig;
  // Opcional: correos que pueden autoasignarse admin solo en su primer ingreso.
  // Ejemplo:
  // window.__BOOTSTRAP_ADMIN_EMAILS__ = ['tu-correo@cetis50cdmx.com'];
  window.__BOOTSTRAP_ADMIN_EMAILS__ = window.__BOOTSTRAP_ADMIN_EMAILS__ || [];

  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK no cargado. Asegúrate de incluir firebase-app-compat.js antes de este archivo.');
    return;
  }

  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch(e){
    const code = e && e.code ? String(e.code) : '';
    const isDuplicate = code === 'app/duplicate-app' || /already exists/i.test(String(e.message || ''));
    if (!isDuplicate) {
      console.error('Error inicializando Firebase:', e);
    }
  }

  // Exportar referencia a Firestore para usar en app.js
  if (firebase.apps && firebase.apps.length) {
    window.db = firebase.firestore();
  }
})();
