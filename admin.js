// ==================== ADMIN.JS ====================

if ((!firebase.apps || !firebase.apps.length) && window.__FIREBASE_CONFIG__) {
  firebase.initializeApp(window.__FIREBASE_CONFIG__);
}

const auth = firebase.auth();
const db = firebase.firestore();

const DOMINIOS_PERMITIDOS = ['cetis50cdmx.com', 'cetis50cdmx.edu.mx'];
const DOMINIOS_PERMITIDOS_LABEL = DOMINIOS_PERMITIDOS.map((d) => '@' + d).join(' o ');
const ANNOUNCEMENT_PUBLIC_CATEGORIES = ['general', 'eventos', 'vinculacion'];
const BOOTSTRAP_ADMIN_EMAILS = Array.isArray(window.__BOOTSTRAP_ADMIN_EMAILS__)
  ? window.__BOOTSTRAP_ADMIN_EMAILS.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
  : [];

let currentUser = null;
let csvData = null;
let boletasData = null;
let horariosData = null;
let asistenciaData = null;
let asistenciaInvalid = 0;

// ==================== ELEMENTOS DOM ====================

// Login
const loginSection = document.getElementById('login-section');
const adminPanel = document.getElementById('admin-panel');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginMsg = document.getElementById('login-msg');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Avisos Generales
const formAvisoGeneral = document.getElementById('form-aviso-general');
const msgAvisoGeneral = document.getElementById('msg-aviso-general');
const listaAvisosGenerales = document.getElementById('lista-avisos-generales');

// Avisos Docentes
const formAvisoDocente = document.getElementById('form-aviso-docente');
const msgAvisoDocente = document.getElementById('msg-aviso-docente');
const listaAvisosDocentes = document.getElementById('lista-avisos-docentes');

// Avisos Tutorías
const formAvisoTutoria = document.getElementById('form-aviso-tutoria');
const msgAvisoTutoria = document.getElementById('msg-aviso-tutoria');
const asistenciaFileInput = document.getElementById('asistencia-file-input');
const asistenciaFileName = document.getElementById('asistencia-file-name');
const asistenciaPreviewBtn = document.getElementById('asistencia-preview-btn');
const asistenciaUploadBtn = document.getElementById('asistencia-upload-btn');
const msgAsistencia = document.getElementById('msg-asistencia');
const asistenciaPreviewTable = document.getElementById('asistencia-preview-table');
const refreshReportesBtn = document.getElementById('refresh-reportes-btn');
const listaReportesAsistencia = document.getElementById('lista-reportes-asistencia');

// Usuarios
const formUsuarioIndividual = document.getElementById('form-usuario-individual');
const msgUsuarioIndividual = document.getElementById('msg-usuario-individual');
const csvFileInput = document.getElementById('csv-file-input');
const csvFileName = document.getElementById('csv-file-name');
const csvPreviewBtn = document.getElementById('csv-preview-btn');
const csvUploadBtn = document.getElementById('csv-upload-btn');
const msgCsv = document.getElementById('msg-csv');
const csvPreviewTable = document.getElementById('csv-preview-table');
const refreshUsuariosBtn = document.getElementById('refresh-usuarios-btn');
const listaUsuarios = document.getElementById('lista-usuarios');

// Boletas
const boletasFileInput = document.getElementById('boletas-file-input');
const boletasFileName = document.getElementById('boletas-file-name');
const boletasPreviewBtn = document.getElementById('boletas-preview-btn');
const boletasUploadBtn = document.getElementById('boletas-upload-btn');
const msgBoletas = document.getElementById('msg-boletas');
const boletasPreviewTable = document.getElementById('boletas-preview-table');

// Horarios Docentes
const horariosFileInput = document.getElementById('horarios-file-input');
const horariosFileName = document.getElementById('horarios-file-name');
const horariosPreviewBtn = document.getElementById('horarios-preview-btn');
const horariosUploadBtn = document.getElementById('horarios-upload-btn');
const horariosDeleteBtn = document.getElementById('horarios-delete-btn');
const msgHorarios = document.getElementById('msg-horarios');
const horariosPreviewTable = document.getElementById('horarios-preview-table');
const horarioSearchInput = document.getElementById('horario-search-rfc');
const horarioSearchBtn = document.getElementById('horario-search-btn');
const horarioSearchResult = document.getElementById('horario-search-result');

// ==================== AUTH ====================

function getEmailDomain(email = '') {
  return (email.split('@')[1] || '').toLowerCase();
}

function isAllowedDomain(email = '') {
  return DOMINIOS_PERMITIDOS.includes(getEmailDomain(email));
}

function hasInstitutionalSession() {
  const email = currentUser?.email || auth.currentUser?.email || '';
  return !!email && isAllowedDomain(email);
}

function userCanPublishGeneral() {
  return !!(currentUser && currentUser.permissions && currentUser.permissions.canPublish);
}

function userCanPublishDocentes() {
  return !!(currentUser && currentUser.permissions && currentUser.permissions.canPublishDocentes);
}

function userCanManageUsers() {
  return userCanPublishGeneral();
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    loginSection.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    currentUser = null;
    return;
  }

  if (!isAllowedDomain(user.email || '')) {
    showLoginMessage('Solo se permite acceso con correo ' + DOMINIOS_PERMITIDOS_LABEL, 'error');
    await auth.signOut();
    return;
  }

  // Verificar permisos
  try {
    // Intentar obtener por UID
    let userRef = db.collection('users').doc(user.uid);
    let userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Intentar buscar por email en cualquier doc (si fue creado con ID aleatorio/manual).
      const normalizedEmail = (user.email || '').toLowerCase();
      let emailDoc = null;
      try {
        const byEmailSnap = await db
          .collection('users')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
        if (!byEmailSnap.empty) {
          emailDoc = byEmailSnap.docs[0];
        }
      } catch (emailLookupErr) {
        const code = emailLookupErr && emailLookupErr.code ? String(emailLookupErr.code) : '';
        if (code !== 'permission-denied') throw emailLookupErr;
      }

      if (emailDoc) {
        const data = emailDoc.data();
        await userRef.set({
          ...data,
          email: normalizedEmail,
          migratedFrom: emailDoc.id,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (emailDoc.id !== user.uid) {
          await db.collection('users').doc(emailDoc.id).delete();
        }

        userDoc = await userRef.get();
        console.log('Usuario migrado por email de', emailDoc.id, 'a', user.uid);
      }
    }

    if (!userDoc.exists) {
      // Intentar buscar por email (doc creado antes de que existiera el UID)
      const tempId = user.email.replace(/[@.]/g, '_');
      const tempRef = db.collection('users').doc(tempId);
      let tempDoc = null;
      try {
        tempDoc = await tempRef.get();
      } catch (tempErr) {
        const code = tempErr && tempErr.code ? String(tempErr.code) : '';
        if (code !== 'permission-denied') throw tempErr;
      }

      if (tempDoc && tempDoc.exists) {
        // Migrar ese documento al UID real
        const data = tempDoc.data();
        await userRef.set({
          ...data,
          email: user.email,
          migratedFrom: tempId,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await tempRef.delete();
        userDoc = await userRef.get();
        console.log('Usuario migrado de', tempId, 'a', user.uid);
      } else {
        // Bootstrap controlado por lista explícita de correos permitidos.
        const bootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.includes((user.email || '').toLowerCase());

        await userRef.set({
          email: user.email,
          nombre: user.displayName || user.email,
          esDocente: false,
          turno: null,
          canPublish: bootstrapAdmin,
          canPublishDocentes: bootstrapAdmin,
          bootstrapAdmin,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (!bootstrapAdmin) {
          showLoginMessage('Tu cuenta ha sido creada pero no tienes permisos de administrador. Un admin debe habilitar canPublish o canPublishDocentes en users/' + user.uid, 'error');
          await auth.signOut();
          return;
        }

        showLoginMessage('Se creó tu cuenta como administrador inicial del sistema.', 'success');
        userDoc = await userRef.get();
      }
    }

    const userData = userDoc.data();
    if (!userData.canPublish && !userData.canPublishDocentes) {
      showLoginMessage('Tu cuenta no tiene permisos de administrador. Contacta al administrador para obtener acceso.', 'error');
      await auth.signOut();
      return;
    }

    // Usuario autorizado
    currentUser = { 
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      permissions: userData 
    };
    
    userName.textContent = userData.nombre || user.displayName;
    userEmail.textContent = user.email;
    loginSection.classList.add('hidden');
    adminPanel.classList.remove('hidden');

    // Cargar datos iniciales según permisos
    cargarAvisosGenerales();
    if (userCanPublishDocentes()) {
      cargarAvisosDocentes();
    } else {
      listaAvisosDocentes.innerHTML = '<p style="color:#777;">No tienes permisos para consultar avisos docentes.</p>';
    }

    if (userCanManageTutorias()) {
      cargarReportesAsistencia();
    } else {
      listaReportesAsistencia.innerHTML = '<p style="color:#777;">No tienes permisos para consultar reportes de asistencia.</p>';
    }

    if (userCanManageUsers()) {
      cargarUsuarios();
    } else {
      listaUsuarios.innerHTML = '<p style="color:#777;">No tienes permisos para gestionar usuarios.</p>';
    }

  } catch (e) {
    console.error('Error verificando permisos:', e);
    showLoginMessage('Error al verificar permisos: ' + e.message, 'error');
    await auth.signOut();
  }
});

loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  const originalLabel = loginBtn.textContent;
  loginBtn.textContent = 'Abriendo acceso...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(provider);
    } catch (popupError) {
      // Fallback to redirect for browsers/environments that block popups.
      const code = popupError && popupError.code ? String(popupError.code) : '';
      const shouldFallbackToRedirect =
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/operation-not-supported-in-this-environment';

      if (shouldFallbackToRedirect) {
        await auth.signInWithRedirect(provider);
        return;
      }
      throw popupError;
    }
  } catch (e) {
    console.error(e);
    const code = e && e.code ? String(e.code) : '';
    if (code === 'auth/unauthorized-domain') {
      showLoginMessage('Este dominio no está autorizado en Firebase Authentication. Agrega este dominio en la consola de Firebase > Authentication > Settings > Authorized domains.', 'error');
    } else if (code === 'auth/operation-not-allowed') {
      showLoginMessage('El proveedor Google no está habilitado en Firebase Authentication.', 'error');
    } else {
      showLoginMessage('Error al iniciar sesión: ' + e.message, 'error');
    }
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = originalLabel;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await auth.signOut();
  } catch (e) {
    console.error(e);
  }
});

function showLoginMessage(msg, type = 'info') {
  loginMsg.textContent = msg;
  loginMsg.className = 'message ' + type;
  loginMsg.style.display = 'block';
}

// ==================== TABS ====================

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    tabContents.forEach(content => {
      if (content.id === 'tab-' + targetTab) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  });
});

// ==================== MODAL ====================

function mostrarModalPreview(data) {
  // Crear modal
  const modal = document.createElement('div');
  modal.id = 'preview-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 16px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
    position: relative;
  `;

  // Formatear fecha de expiración
  let expiraTexto = 'Sin fecha de expiración';
  if (data.expiryDate) {
    const fecha = data.expiryDate.toDate();
    expiraTexto = fecha.toLocaleDateString('es-MX', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  // Formatear fecha del evento
  let eventoTexto = '';
  if (data.eventDate) {
    const fecha = data.eventDate.toDate();
    eventoTexto = `
      <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #2196f3;">
        <strong style="color: #1565c0;">📅 Fecha del evento:</strong><br>
        <span style="color: #1976d2; font-size: 1.1rem;">${fecha.toLocaleDateString('es-MX', { 
          weekday: 'long',
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</span>
      </div>
    `;
  }

  // Formatear especialidades
  const especialidadesTexto = data.specialties && data.specialties.length > 0
    ? data.specialties.map(s => `<span style="background: #7a1e29; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; display: inline-block; margin: 3px;">${s}</span>`).join(' ')
    : '<span style="color: #666;">Todas las especialidades</span>';

  // Categoría con emoji
  const categoriaEmoji = {
    'alumnos': '🎓',
    'eventos': '🎉',
    'vinculacion': '🤝',
    'general': '📢'
  };
  const categoriaTexto = `${categoriaEmoji[data.category] || '📢'} ${data.category.charAt(0).toUpperCase() + data.category.slice(1)}`;

  const pdfInfo = getPdfPreviewInfo(data.linkUrl || '');

  // Enlace
  const enlaceHTML = data.linkUrl
    ? `<div style="margin-top: 15px;">
         <a href="${data.linkUrl}" target="_blank" rel="noopener" style="color: #7a1e29; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
           🔗 Abrir en nueva pestaña
         </a>
       </div>`
    : '';

  const pdfViewerHTML = pdfInfo
    ? `
      <div style="margin: 20px 0; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
        <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 10px 12px; background: #f8f8f8; border-bottom: 1px solid #e0e0e0;">
          <strong style="color: #7a1e29;">Vista previa PDF</strong>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="pdf-zoom-out" type="button" style="padding: 6px 10px; border: 1px solid #d3d3d3; background: white; border-radius: 6px; cursor: pointer;">-</button>
            <button id="pdf-zoom-reset" type="button" style="padding: 6px 10px; border: 1px solid #d3d3d3; background: white; border-radius: 6px; cursor: pointer;">100%</button>
            <button id="pdf-zoom-in" type="button" style="padding: 6px 10px; border: 1px solid #d3d3d3; background: white; border-radius: 6px; cursor: pointer;">+</button>
            <button id="pdf-fullscreen" type="button" style="padding: 6px 10px; border: 1px solid #d3d3d3; background: white; border-radius: 6px; cursor: pointer;">Pantalla completa</button>
          </div>
        </div>
        <div id="pdf-frame-wrap" style="background: #f0f0f0; overflow: auto; max-height: 70vh;">
          <iframe
            id="pdf-preview-frame"
            src="${pdfInfo.embedUrl}"
            style="width: 100%; height: 72vh; border: none; transform-origin: top left;"
            loading="lazy"
            allowfullscreen
            title="Vista previa de PDF"
          ></iframe>
        </div>
      </div>
    `
    : '';

  modalContent.innerHTML = `
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(50px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    </style>
    
    <!-- Header del modal -->
    <div style="background: linear-gradient(135deg, #7a1e29 0%, #5d1620 100%); color: white; padding: 25px; border-radius: 16px 16px 0 0; position: relative;">
      <button id="close-modal" style="position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.2); border: none; color: white; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 1.3rem; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;">
        ✕
      </button>
      <h2 style="margin: 0; font-size: 1.5rem; padding-right: 40px;">✅ Aviso Publicado Exitosamente</h2>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 0.95rem;">Vista previa de cómo se verá en el sitio público</p>
    </div>

    <!-- Contenido del modal -->
    <div style="padding: 30px;">
      
      <!-- Categoría -->
      <div style="margin-bottom: 20px;">
        <span style="background: #f5f5f5; color: #7a1e29; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">
          ${categoriaTexto}
        </span>
      </div>

      <!-- Título -->
      <h3 style="color: #7a1e29; margin: 0 0 15px 0; font-size: 1.8rem; line-height: 1.3;">
        ${data.title}
      </h3>

      <!-- Fecha del evento (si existe) -->
      ${eventoTexto}

      <!-- Contenido -->
      <div style="color: #333; line-height: 1.7; font-size: 1rem; margin-bottom: 20px; white-space: pre-wrap;">
        ${data.content}
      </div>

      ${pdfViewerHTML}
      ${enlaceHTML}

      <hr style="border: none; border-top: 2px solid #f0f0f0; margin: 25px 0;">

      <!-- Metadatos -->
      <div style="background: #f9f9f9; padding: 20px; border-radius: 12px; border-left: 4px solid #7a1e29;">
        <div style="margin-bottom: 12px;">
          <strong style="color: #7a1e29;">🎯 Especialidades:</strong><br>
          <div style="margin-top: 8px;">${especialidadesTexto}</div>
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong style="color: #7a1e29;">⏰ Expira:</strong> 
          <span style="color: #666;">${expiraTexto}</span>
        </div>

        <div>
          <strong style="color: #7a1e29;">📅 Publicado:</strong> 
          <span style="color: #666;">${new Date().toLocaleDateString('es-MX', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</span>
        </div>
      </div>

      <!-- Botones -->
      <div style="margin-top: 25px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button id="modal-close-btn" style="flex: 1; min-width: 150px; padding: 14px 24px; background: #7a1e29; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
          Cerrar
        </button>
        <button id="modal-new-btn" style="flex: 1; min-width: 150px; padding: 14px 24px; background: #f5f5f5; color: #7a1e29; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
          Publicar otro aviso
        </button>
      </div>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Hover effects
  const closeBtn = document.getElementById('close-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalNewBtn = document.getElementById('modal-new-btn');
  const zoomOutBtn = document.getElementById('pdf-zoom-out');
  const zoomInBtn = document.getElementById('pdf-zoom-in');
  const zoomResetBtn = document.getElementById('pdf-zoom-reset');
  const fullscreenBtn = document.getElementById('pdf-fullscreen');
  const pdfFrame = document.getElementById('pdf-preview-frame');
  const pdfWrap = document.getElementById('pdf-frame-wrap');

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.3)';
    closeBtn.style.transform = 'rotate(90deg)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.style.transform = 'rotate(0deg)';
  });

  modalCloseBtn.addEventListener('mouseenter', () => {
    modalCloseBtn.style.background = '#5d1620';
    modalCloseBtn.style.transform = 'translateY(-2px)';
    modalCloseBtn.style.boxShadow = '0 4px 12px rgba(122, 30, 41, 0.3)';
  });
  modalCloseBtn.addEventListener('mouseleave', () => {
    modalCloseBtn.style.background = '#7a1e29';
    modalCloseBtn.style.transform = 'translateY(0)';
    modalCloseBtn.style.boxShadow = 'none';
  });

  modalNewBtn.addEventListener('mouseenter', () => {
    modalNewBtn.style.background = '#e0e0e0';
  });
  modalNewBtn.addEventListener('mouseleave', () => {
    modalNewBtn.style.background = '#f5f5f5';
  });

  if (pdfFrame && pdfWrap) {
    let zoom = 1;
    const applyZoom = () => {
      pdfFrame.style.transform = `scale(${zoom})`;
      pdfFrame.style.width = `${100 / zoom}%`;
      pdfFrame.style.height = `${72 / zoom}vh`;
    };

    const clampZoom = (value) => Math.max(0.6, Math.min(2, value));

    zoomOutBtn?.addEventListener('click', () => {
      zoom = clampZoom(zoom - 0.1);
      applyZoom();
    });

    zoomInBtn?.addEventListener('click', () => {
      zoom = clampZoom(zoom + 0.1);
      applyZoom();
    });

    zoomResetBtn?.addEventListener('click', () => {
      zoom = 1;
      applyZoom();
    });

    fullscreenBtn?.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return;
        }
        await pdfWrap.requestFullscreen();
      } catch (err) {
        console.warn('No se pudo activar pantalla completa:', err);
      }
    });
  }

  // Cerrar modal
  const cerrarModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.remove(), 300);
  };

  closeBtn.addEventListener('click', cerrarModal);
  modalCloseBtn.addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
  });

  // Publicar otro aviso
  modalNewBtn.addEventListener('click', () => {
    cerrarModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Agregar animación de fadeOut
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ==================== AVISOS GENERALES ====================

formAvisoGeneral.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentUser || !currentUser.permissions.canPublish) {
    showMessage(msgAvisoGeneral, 'No tienes permisos para publicar avisos generales.', 'error');
    return;
  }

  const title       = document.getElementById('ag-titulo').value.trim();
  const content     = document.getElementById('ag-contenido').value.trim();
  const category    = document.getElementById('ag-categoria').value;
  const specsStr    = document.getElementById('ag-especialidades').value.trim();
  const expiryStr   = document.getElementById('ag-expiracion').value;
  const eventStr    = document.getElementById('ag-event-date')?.value || '';
  const linkUrl     = document.getElementById('ag-enlace')?.value.trim() || '';

  if (!title || !content || !category) {
    showMessage(msgAvisoGeneral, 'Título, contenido y categoría son obligatorios.', 'error');
    return;
  }

  // specialties -> specialties[]
  const specialties = specsStr
    ? specsStr.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const data = {
    title,
    content,
    category,
    specialties,
    linkUrl: linkUrl || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.uid
  };

  // expiryDate como Timestamp
  if (expiryStr) {
    data.expiryDate = firebase.firestore.Timestamp.fromDate(new Date(expiryStr));
  }

  // eventDate solo si la categoría es eventos
  if (eventStr && category === 'eventos') {
    data.eventDate = firebase.firestore.Timestamp.fromDate(new Date(eventStr));
  }

  try {
    await db.collection('announcements').add(data);

    // Mostrar modal de preview
    mostrarModalPreview(data);

    formAvisoGeneral.reset();
    document.getElementById('ag-categoria').value = '';

    cargarAvisosGenerales();
  } catch (e) {
    console.error(e);
    showMessage(msgAvisoGeneral, '❌ Error al publicar: ' + e.message, 'error');
  }
});

async function cargarAvisosGenerales() {
  try {
    const queryPublic = db.collection('announcements')
      .where('category', 'in', ANNOUNCEMENT_PUBLIC_CATEGORIES)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const canReadAlumnos = hasInstitutionalSession();
    const queryAlumnos = canReadAlumnos
      ? db.collection('announcements')
          .where('category', '==', 'alumnos')
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get()
      : Promise.resolve(null);

    const [publicSnap, alumnosSnap] = await Promise.all([queryPublic, queryAlumnos]);
    const docsById = new Map();

    (publicSnap?.docs || []).forEach((doc) => docsById.set(doc.id, doc));
    (alumnosSnap?.docs || []).forEach((doc) => docsById.set(doc.id, doc));

    const orderedDocs = Array.from(docsById.values())
      .sort((a, b) => {
        const aCreatedAt = a.data().createdAt;
        const bCreatedAt = b.data().createdAt;
        const ta = aCreatedAt && typeof aCreatedAt.toMillis === 'function' ? aCreatedAt.toMillis() : 0;
        const tb = bCreatedAt && typeof bCreatedAt.toMillis === 'function' ? bCreatedAt.toMillis() : 0;
        return tb - ta;
      })
      .slice(0, 20);

    if (!orderedDocs.length) {
      listaAvisosGenerales.innerHTML = '<p style="color:#777;">No hay avisos publicados.</p>';
      return;
    }

    let html = '';
    orderedDocs.forEach(doc => {
      const aviso = doc.data();
      const fecha = aviso.createdAt?.toDate 
        ? aviso.createdAt.toDate().toLocaleDateString('es-MX')
        : '';

      const specialties = aviso.specialties?.join(', ') || 'Todas';
      const categoria   = aviso.category || 'general';
      const expira      = aviso.expiryDate?.toDate
        ? aviso.expiryDate.toDate().toLocaleDateString('es-MX')
        : (aviso.expiracion || 'Sin expiración');

      html += `
        <div class="card-item">
          <h3>${aviso.title || aviso.titulo || '(Sin título)'}</h3>
          <p>${aviso.content || aviso.contenido || ''}</p>
          ${aviso.linkUrl ? `
            <p>
              <strong>Enlace:</strong>
              <a href="${aviso.linkUrl}" target="_blank" rel="noopener" style="color:#7a1e29;">
                ${aviso.linkUrl}
              </a>
            </p>
          ` : ''}
          <p class="meta">
            <strong>Categoría:</strong> ${categoria}<br>
            <strong>Especialidades:</strong> ${specialties}<br>
            <strong>Expira:</strong> ${expira}<br>
            <strong>Publicado:</strong> ${fecha}
          </p>
          <div class="actions">
            <button class="btn btn-danger btn-sm" onclick="eliminarAvisoGeneral('${doc.id}')">🗑️ Eliminar</button>
          </div>
        </div>
      `;
    });

    listaAvisosGenerales.innerHTML = html;
  } catch (e) {
    console.error(e);
    if (e && e.code === 'permission-denied') {
      listaAvisosGenerales.innerHTML = '<p style="color:#c62828;">No tienes permiso para leer alguna categoría de avisos (permission-denied).</p>';
      return;
    }
    listaAvisosGenerales.innerHTML = '<p style="color:#c62828;">Error al cargar avisos.</p>';
  }
}

function getPdfPreviewInfo(linkUrl = '') {
  const raw = (linkUrl || '').trim();
  if (!raw) return null;

  const isDirectPdf = /\.pdf(?:$|[?#])/i.test(raw);
  if (isDirectPdf) {
    return { embedUrl: raw };
  }

  try {
    const url = new URL(raw);
    const host = (url.hostname || '').toLowerCase();
    const path = url.pathname || '';

    if (!host.includes('drive.google.com')) return null;

    let fileId = '';
    const fileMatch = path.match(/\/file\/d\/([^/]+)/i);
    if (fileMatch && fileMatch[1]) {
      fileId = fileMatch[1];
    }
    if (!fileId) {
      fileId = url.searchParams.get('id') || '';
    }
    if (!fileId) return null;

    return { embedUrl: `https://drive.google.com/file/d/${fileId}/preview` };
  } catch (_) {
    return null;
  }
}

async function eliminarAvisoGeneral(id) {
  if (!confirm('¿Eliminar este aviso?')) return;
  try {
    await db.collection('announcements').doc(id).delete();
    showMessage(msgAvisoGeneral, '✅ Aviso eliminado.', 'success');
    cargarAvisosGenerales();
  } catch (e) {
    console.error(e);
    showMessage(msgAvisoGeneral, '❌ Error al eliminar.', 'error');
  }
}

// ==================== AVISOS DOCENTES ====================

formAvisoDocente.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentUser || !currentUser.permissions.canPublishDocentes) {
    showMessage(msgAvisoDocente, 'No tienes permisos para publicar avisos de docentes.', 'error');
    return;
  }

  const titulo    = document.getElementById('ad-titulo').value.trim();
  const contenido = document.getElementById('ad-contenido').value.trim();
  const turno     = document.getElementById('ad-turno').value;
  const linkUrl   = (document.getElementById('ad-enlace')?.value || '').trim();

  if (!titulo || !contenido || !turno) {
    showMessage(msgAvisoDocente, 'Título, contenido y turno son obligatorios.', 'error');
    return;
  }

  const data = {
    titulo,
    contenido,
    turno,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.uid
  };

  // Solo guardar si el campo no está vacío
  if (linkUrl) {
    data.linkUrl = linkUrl;
  }

  try {
    await db.collection('docentesAnnouncements').add(data);

    showMessage(msgAvisoDocente, '✅ Aviso para docentes publicado.', 'success');
    formAvisoDocente.reset();
    cargarAvisosDocentes();
  } catch (e) {
    console.error(e);
    showMessage(msgAvisoDocente, '❌ Error: ' + e.message, 'error');
  }
});

async function cargarAvisosDocentes() {
  if (!userCanPublishDocentes()) {
    if (listaAvisosDocentes) {
      listaAvisosDocentes.innerHTML = '<p style="color:#777;">No tienes permisos para consultar avisos docentes.</p>';
    }
    return;
  }

  try {
    const snapshot = await db.collection('docentesAnnouncements')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    if (snapshot.empty) {
      listaAvisosDocentes.innerHTML = '<p style="color:#777;">No hay avisos para docentes.</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const aviso = doc.data();
      const fecha = aviso.createdAt?.toDate 
        ? aviso.createdAt.toDate().toLocaleDateString('es-MX')
        : '';
      const turnoLabel = aviso.turno === 'ambos' ? '🔄 Ambos' :
                        aviso.turno === 'matutino' ? '🌅 Matutino' : '🌙 Vespertino';

      html += `
        <div class="card-item">
          <h3>${aviso.titulo}</h3>
          <p>${aviso.contenido}</p>
          ${aviso.linkUrl ? `
            <p>
              <strong>Enlace:</strong>
              <a href="${aviso.linkUrl}" target="_blank" rel="noopener" style="color:#7a1e29;">
                ${aviso.linkUrl}
              </a>
            </p>
          ` : ''}
          <p class="meta">
            <span class="badge info">${turnoLabel}</span><br>
            <strong>Publicado:</strong> ${fecha}
          </p>
          <div class="actions">
            <button class="btn btn-danger btn-sm" onclick="eliminarAvisoDocente('${doc.id}')">🗑️ Eliminar</button>
          </div>
        </div>
      `;
    });

    listaAvisosDocentes.innerHTML = html;
  } catch (e) {
    console.error(e);
    listaAvisosDocentes.innerHTML = '<p style="color:#c62828;">Error al cargar avisos.</p>';
  }
}

async function eliminarAvisoDocente(id) {
  if (!confirm('¿Eliminar este aviso?')) return;
  try {
    await db.collection('docentesAnnouncements').doc(id).delete();
    showMessage(msgAvisoDocente, '✅ Aviso eliminado.', 'success');
    cargarAvisosDocentes();
  } catch (e) {
    console.error(e);
    showMessage(msgAvisoDocente, '❌ Error al eliminar.', 'error');
  }
}

// ==================== AVISOS TUTORÍAS ====================

function userCanManageTutorias() {
  return !!(currentUser && currentUser.permissions && (currentUser.permissions.canPublishDocentes || currentUser.permissions.canPublish));
}

if (formAvisoTutoria) {
  formAvisoTutoria.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!userCanManageTutorias()) {
      showMessage(msgAvisoTutoria, 'No tienes permisos para registrar inasistencias.', 'error');
      return;
    }

    const fecha = document.getElementById('at-fecha').value;
    const turno = document.getElementById('at-turno').value;
    const grupo = document.getElementById('at-grupo').value.trim();
    const numeroControl = document.getElementById('at-numero-control').value.trim();
    const nombre = document.getElementById('at-nombre').value.trim();
    const motivo = document.getElementById('at-motivo').value.trim();
    const observaciones = document.getElementById('at-observaciones').value.trim();
    const faltasRaw = document.getElementById('at-faltas').value.trim();
    const materias = document.getElementById('at-materias').value.trim();

    if (!fecha || !turno || !grupo || !numeroControl || !nombre || !faltasRaw || !materias) {
      showMessage(
        msgAvisoTutoria,
        'Fecha, turno, grupo, número de control, nombre, cantidad de faltas y materias son obligatorios.',
        'error'
      );
      return;
    }

    const fechaInfo = normalizarFecha(fecha);
    if (!fechaInfo) {
      showMessage(msgAvisoTutoria, 'Fecha inválida. Usa formato YYYY-MM-DD.', 'error');
      return;
    }

    const faltas = normalizarCantidadFaltas(faltasRaw);
    if (faltas === null) {
      showMessage(msgAvisoTutoria, 'Cantidad de faltas inválida. Usa un número entero (0 o mayor).', 'error');
      return;
    }

    try {
      await db.collection('reportes_asistencia').add({
        fecha: fechaInfo.fecha,
        fecha_ts: fechaInfo.fechaTs,
        grupo,
        turno,
        numero_control: numeroControl,
        nombre,
        faltas,
        materias,
        motivo: motivo || null,
        observaciones: observaciones || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        source: 'manual'
      });

      showMessage(msgAvisoTutoria, '✅ Inasistencia registrada.', 'success');
      formAvisoTutoria.reset();
      cargarReportesAsistencia();
    } catch (e) {
      console.error(e);
      showMessage(msgAvisoTutoria, '❌ Error al guardar: ' + e.message, 'error');
    }
  });
}

if (asistenciaFileInput) {
  asistenciaFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      asistenciaFileName.textContent = `📄 ${file.name}`;
      asistenciaPreviewBtn.disabled = false;
      asistenciaUploadBtn.disabled = false;
      asistenciaData = null;
      asistenciaInvalid = 0;
      asistenciaPreviewTable.innerHTML = '';
    } else {
      asistenciaFileName.textContent = '';
      asistenciaPreviewBtn.disabled = true;
      asistenciaUploadBtn.disabled = true;
      asistenciaPreviewTable.innerHTML = '';
    }
  });
}

if (asistenciaPreviewBtn) {
  asistenciaPreviewBtn.addEventListener('click', () => {
    const file = asistenciaFileInput?.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const filas = results.data || [];
        asistenciaData = [];
        asistenciaInvalid = 0;

        filas.forEach((row) => {
          const normalizada = normalizarFilaAsistencia(row);
          if (!normalizada.ok) {
            asistenciaInvalid += 1;
            return;
          }
          asistenciaData.push(normalizada.data);
        });

        mostrarPreviewAsistencia(asistenciaData.slice(0, 5));
        showMessage(
          msgAsistencia,
          `✅ ${asistenciaData.length} registros válidos. ${asistenciaInvalid} filas con errores.`,
          asistenciaInvalid > 0 ? 'info' : 'success'
        );
      },
      error: (error) => {
        showMessage(msgAsistencia, '❌ Error al leer CSV: ' + error.message, 'error');
      }
    });
  });
}

if (asistenciaUploadBtn) {
  asistenciaUploadBtn.addEventListener('click', async () => {
    if (!userCanManageTutorias()) {
      showMessage(msgAsistencia, 'No tienes permisos para importar inasistencias.', 'error');
      return;
    }

    if (!asistenciaData || asistenciaData.length === 0) {
      showMessage(msgAsistencia, '❌ Primero previsualiza el CSV.', 'error');
      return;
    }

    if (!confirm(`¿Importar ${asistenciaData.length} inasistencias a Firestore?`)) return;

    showMessage(msgAsistencia, '⏳ Importando inasistencias...', 'info');

    let exitosos = 0;
    let errores = 0;
    let batch = db.batch();
    let batchCount = 0;

    try {
      for (const row of asistenciaData) {
        const ref = db.collection('reportes_asistencia').doc();
        batch.set(ref, {
          ...row,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: currentUser.uid,
          source: 'csv'
        });
        batchCount += 1;
        exitosos += 1;

        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    } catch (e) {
      console.error('Error importando inasistencias:', e);
      errores += 1;
    }

    const tipoMensaje = errores > 0 || asistenciaInvalid > 0 ? 'info' : 'success';
    showMessage(
      msgAsistencia,
      `✅ Importación completa: ${exitosos} registros guardados. ${asistenciaInvalid} filas inválidas.`,
      tipoMensaje
    );

    asistenciaFileInput.value = '';
    asistenciaFileName.textContent = '';
    asistenciaPreviewBtn.disabled = true;
    asistenciaUploadBtn.disabled = true;
    asistenciaPreviewTable.innerHTML = '';
    asistenciaData = null;

    cargarReportesAsistencia();
  });
}

if (refreshReportesBtn) {
  refreshReportesBtn.addEventListener('click', cargarReportesAsistencia);
}

function mostrarPreviewAsistencia(data) {
  if (!asistenciaPreviewTable) return;
  if (data.length === 0) {
    asistenciaPreviewTable.innerHTML = '<p>No hay datos para mostrar.</p>';
    return;
  }

  let html = '<div class="table-wrapper"><table class="data-table"><thead><tr>';
  const keys = Object.keys(data[0]);
  keys.forEach(key => {
    html += `<th>${key}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    html += '<tr>';
    keys.forEach(key => {
      const value = row[key];
      if (value && typeof value === 'object' && value.toDate) {
        html += `<td>${value.toDate().toLocaleDateString('es-MX')}</td>`;
      } else {
        html += `<td>${value ?? ''}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  asistenciaPreviewTable.innerHTML = html;
}

async function cargarReportesAsistencia() {
  if (!listaReportesAsistencia) return;
  if (!userCanManageTutorias()) {
    listaReportesAsistencia.innerHTML = '<p style="color:#777;">No tienes permisos para consultar reportes de asistencia.</p>';
    return;
  }

  try {
    const snapshot = await db.collection('reportes_asistencia')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snapshot.empty) {
      listaReportesAsistencia.innerHTML = '<p style="color:#777;">No hay reportes registrados.</p>';
      return;
    }

    let html = '<div class="table-wrapper"><table class="data-table"><thead><tr>';
    html += '<th>Fecha</th><th>Grupo</th><th>Turno</th><th>Número de control</th><th>Nombre</th><th>Faltas</th><th>Materias</th><th>Motivo</th><th>Observaciones</th><th>Capturado</th><th>Acciones</th>';
    html += '</tr></thead><tbody>';

    snapshot.forEach(doc => {
      const r = doc.data();
      const fecha = r.fecha || (r.fecha_ts?.toDate ? r.fecha_ts.toDate().toLocaleDateString('es-MX') : '-');
      const creado = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('es-MX') : '-';
      const motivo = r.motivo || '-';
      const observaciones = r.observaciones || '-';
      const faltas = r.faltas ?? '-';
      const materias = r.materias || '-';

      html += `
        <tr>
          <td>${fecha}</td>
          <td>${r.grupo || '-'}</td>
          <td>${r.turno || '-'}</td>
          <td>${r.numero_control || '-'}</td>
          <td>${r.nombre || '-'}</td>
          <td>${faltas}</td>
          <td>${materias}</td>
          <td>${motivo}</td>
          <td>${observaciones}</td>
          <td>${creado}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="eliminarReporteAsistencia('${doc.id}')">🗑️</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    listaReportesAsistencia.innerHTML = html;
  } catch (e) {
    console.error(e);
    listaReportesAsistencia.innerHTML = '<p style="color:#c62828;">Error al cargar reportes.</p>';
  }
}

async function eliminarReporteAsistencia(id) {
  if (!confirm('¿Eliminar este reporte de asistencia?')) return;
  try {
    await db.collection('reportes_asistencia').doc(id).delete();
    showMessage(msgAsistencia, '✅ Reporte eliminado.', 'success');
    cargarReportesAsistencia();
  } catch (e) {
    console.error(e);
    showMessage(msgAsistencia, '❌ Error al eliminar: ' + e.message, 'error');
  }
}

// ==================== USUARIOS - REGISTRO INDIVIDUAL ====================

formUsuarioIndividual.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!userCanManageUsers()) {
    showMessage(msgUsuarioIndividual, 'No tienes permisos para gestionar usuarios.', 'error');
    return;
  }

  const email = document.getElementById('ui-email').value.trim().toLowerCase();
  const nombre = document.getElementById('ui-nombre').value.trim();
  const turno = document.getElementById('ui-turno').value || null;
  const esDocente = document.getElementById('ui-esDocente').checked;
  const canPublish = document.getElementById('ui-canPublish').checked;
  const canPublishDocentes = document.getElementById('ui-canPublishDocentes').checked;

  // Validar dominio
  if (!isAllowedDomain(email)) {
    showMessage(
      msgUsuarioIndividual,
      `❌ El correo debe ser del dominio ${DOMINIOS_PERMITIDOS_LABEL}`,
      'error'
    );
    return;
  }

  try {
    // Buscar si ya existe un usuario con ese email
    const querySnapshot = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (!querySnapshot.empty) {
      // Usuario ya existe, actualizar
      const docId = querySnapshot.docs[0].id;
      await db.collection('users').doc(docId).update({
        nombre,
        turno,
        esDocente,
        canPublish,
        canPublishDocentes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showMessage(msgUsuarioIndividual, '✅ Usuario actualizado correctamente.', 'success');
    } else {
      // Crear nuevo (sin UID porque aún no se ha logueado)
      const tempId = email.replace(/[@.]/g, '_');
      await db.collection('users').doc(tempId).set({
        email,
        nombre,
        turno,
        esDocente,
        canPublish,
        canPublishDocentes,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showMessage(msgUsuarioIndividual, '✅ Usuario registrado. Se actualizará con su UID al iniciar sesión.', 'success');
    }

    formUsuarioIndividual.reset();
    cargarUsuarios();
  } catch (e) {
    console.error(e);
    showMessage(msgUsuarioIndividual, '❌ Error: ' + e.message, 'error');
  }
});

// ==================== USUARIOS - CSV ====================

csvFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    csvFileName.textContent = `📄 ${file.name}`;
    csvPreviewBtn.disabled = false;
    csvUploadBtn.disabled = false;
    csvData = null;
  } else {
    csvFileName.textContent = '';
    csvPreviewBtn.disabled = true;
    csvUploadBtn.disabled = true;
  }
});

csvPreviewBtn.addEventListener('click', () => {
  const file = csvFileInput.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      csvData = results.data;
      mostrarPreviewCSV(csvData.slice(0, 5));
      showMessage(msgCsv, `✅ ${csvData.length} registros encontrados. Mostrando primeros 5.`, 'info');
    },
    error: (error) => {
      showMessage(msgCsv, '❌ Error al leer CSV: ' + error.message, 'error');
    }
  });
});

csvUploadBtn.addEventListener('click', async () => {
  if (!userCanManageUsers()) {
    showMessage(msgCsv, 'No tienes permisos para gestionar usuarios.', 'error');
    return;
  }

  if (!csvData || csvData.length === 0) {
    showMessage(msgCsv, '❌ Primero previsualiza el CSV.', 'error');
    return;
  }

  if (!confirm(`¿Cargar ${csvData.length} usuarios a Firestore?`)) return;

  showMessage(msgCsv, '⏳ Cargando usuarios...', 'info');

  let exitosos = 0;
  let errores = 0;

  for (const row of csvData) {
    try {
      const email = (row.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        errores++;
        continue;
      }

      // Validar dominio
      if (!isAllowedDomain(email)) {
        console.warn(`Email ${email} no pertenece a dominios permitidos (${DOMINIOS_PERMITIDOS_LABEL}), omitiendo...`);
        errores++;
        continue;
      }

      const tempId = email.replace(/[@.]/g, '_');
      await db.collection('users').doc(tempId).set({
        email,
        nombre: (row.nombre || '').trim(),
        esDocente: row.esDocente === 'true' || row.esDocente === '1',
        turno: (row.turno || '').trim() || null,
        canPublish: row.canPublish === 'true' || row.canPublish === '1',
        canPublishDocentes: row.canPublishDocentes === 'true' || row.canPublishDocentes === '1',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      exitosos++;
    } catch (e) {
      console.error('Error en fila:', row, e);
      errores++;
    }
  }

  showMessage(msgCsv, `✅ Carga completa: ${exitosos} exitosos, ${errores} errores.`, 'success');
  cargarUsuarios();
  csvFileInput.value = '';
  csvFileName.textContent = '';
  csvPreviewBtn.disabled = true;
  csvUploadBtn.disabled = true;
  csvPreviewTable.innerHTML = '';
});

function mostrarPreviewCSV(data) {
  if (data.length === 0) {
    csvPreviewTable.innerHTML = '<p>No hay datos para mostrar.</p>';
    return;
  }

  let html = '<table class="data-table"><thead><tr>';
  const keys = Object.keys(data[0]);
  keys.forEach(key => {
    html += `<th>${key}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    html += '<tr>';
    keys.forEach(key => {
      html += `<td>${row[key] || ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  csvPreviewTable.innerHTML = html;
}

// ==================== USUARIOS - LISTA ====================

if (refreshUsuariosBtn) {
  refreshUsuariosBtn.addEventListener('click', cargarUsuarios);
}

async function cargarUsuarios() {
  if (!userCanManageUsers()) {
    if (listaUsuarios) {
      listaUsuarios.innerHTML = '<p style="color:#777;">No tienes permisos para gestionar usuarios.</p>';
    }
    return;
  }

  try {
    const snapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snapshot.empty) {
      listaUsuarios.innerHTML = '<p style="color:#777;">No hay usuarios registrados.</p>';
      return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>Email</th><th>Nombre</th><th>Docente</th><th>Turno</th><th>Permisos</th><th>Acciones</th>';
    html += '</tr></thead><tbody>';

    snapshot.forEach(doc => {
      const u = doc.data();
      const permisos = [];
      if (u.canPublish) permisos.push('Avisos');
      if (u.canPublishDocentes) permisos.push('Docentes');

      html += `
        <tr>
          <td>${u.email || ''}</td>
          <td>${u.nombre || ''}</td>
          <td>${u.esDocente ? '<span class="badge success">Sí</span>' : '<span class="badge warning">No</span>'}</td>
          <td>${u.turno || '-'}</td>
          <td>${permisos.join(', ') || '-'}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="eliminarUsuario('${doc.id}')">🗑️</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    listaUsuarios.innerHTML = html;
  } catch (e) {
    console.error(e);
    if (e && e.code === 'permission-denied') {
      listaUsuarios.innerHTML = '<p style="color:#c62828;">No tienes permiso en reglas de Firestore para listar usuarios (permission-denied).</p>';
      return;
    }
    listaUsuarios.innerHTML = '<p style="color:#c62828;">Error al cargar usuarios.</p>';
  }
}

async function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    await db.collection('users').doc(id).delete();
    showMessage(msgUsuarioIndividual, '✅ Usuario eliminado.', 'success');
    cargarUsuarios();
  } catch (e) {
    console.error(e);
    showMessage(msgUsuarioIndividual, '❌ Error al eliminar.', 'error');
  }
}

// ==================== BOLETAS ====================

boletasFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    boletasFileName.textContent = `📄 ${file.name}`;
    boletasPreviewBtn.disabled = false;
    boletasUploadBtn.disabled = false;
    boletasData = null;
  } else {
    boletasFileName.textContent = '';
    boletasPreviewBtn.disabled = true;
    boletasUploadBtn.disabled = true;
  }
});

boletasPreviewBtn.addEventListener('click', () => {
  const file = boletasFileInput.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      boletasData = results.data;
      mostrarPreviewBoletas(boletasData.slice(0, 5));
      showMessage(msgBoletas, `✅ ${boletasData.length} boletas encontradas. Mostrando primeras 5.`, 'info');
    },
    error: (error) => {
      showMessage(msgBoletas, '❌ Error al leer CSV: ' + error.message, 'error');
    }
  });
});

boletasUploadBtn.addEventListener('click', async () => {
  if (!boletasData || boletasData.length === 0) {
    showMessage(msgBoletas, '❌ Primero previsualiza el CSV.', 'error');
    return;
  }

  if (!confirm(`¿Importar ${boletasData.length} boletas a Firestore?`)) return;

  showMessage(msgBoletas, '⏳ Importando boletas...', 'info');

  let exitosos = 0;
  let errores = 0;

  for (const row of boletasData) {
    try {
      await db.collection('boletas').add({
        ...row,
        importedAt: firebase.firestore.FieldValue.serverTimestamp(),
        importedBy: currentUser.uid
      });
      exitosos++;
    } catch (e) {
      console.error('Error en fila:', row, e);
      errores++;
    }
  }

  showMessage(msgBoletas, `✅ Importación completa: ${exitosos} exitosas, ${errores} errores.`, 'success');
  boletasFileInput.value = '';
  boletasFileName.textContent = '';
  boletasPreviewBtn.disabled = true;
  boletasUploadBtn.disabled = true;
  boletasPreviewTable.innerHTML = '';
});

function mostrarPreviewBoletas(data) {
  if (data.length === 0) {
    boletasPreviewTable.innerHTML = '<p>No hay datos para mostrar.</p>';
    return;
  }

  let html = '<table class="data-table"><thead><tr>';
  const keys = Object.keys(data[0]);
  keys.forEach(key => {
    html += `<th>${key}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    html += '<tr>';
    keys.forEach(key => {
      html += `<td>${row[key] || ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  boletasPreviewTable.innerHTML = html;
}

// ==================== HORARIOS DOCENTES ====================

if (horariosFileInput) {
  horariosFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      horariosFileName.textContent = `📄 ${file.name}`;
      horariosPreviewBtn.disabled = false;
      horariosUploadBtn.disabled = false;
      horariosData = null;
      horariosPreviewTable.innerHTML = '';
    } else {
      horariosFileName.textContent = '';
      horariosPreviewBtn.disabled = true;
      horariosUploadBtn.disabled = true;
      horariosPreviewTable.innerHTML = '';
    }
  });
}

if (horariosPreviewBtn) {
  horariosPreviewBtn.addEventListener('click', () => {
    const file = horariosFileInput?.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log('Encabezados detectados:', Object.keys(results.data[0] || {}));
        horariosData = results.data.map(normalizarFilaHorario);
        mostrarPreviewHorarios(horariosData.slice(0, 5));
        showMessage(
          msgHorarios,
          `✅ ${horariosData.length} filas detectadas. Mostrando primeras 5.`,
          'info'
        );
      },
      error: (error) => {
        showMessage(msgHorarios, '❌ Error al leer CSV: ' + error.message, 'error');
      }
    });
  });
}

if (horariosUploadBtn) {
  horariosUploadBtn.addEventListener('click', async () => {
    if (!horariosData || horariosData.length === 0) {
      showMessage(msgHorarios, '❌ Primero previsualiza el CSV.', 'error');
      return;
    }

    if (!confirm(`¿Importar horarios para ${horariosData.length} filas?`)) return;

    showMessage(msgHorarios, '⏳ Importando horarios...', 'info');

    const agrupados = {};
    let filasErroneas = 0;

    horariosData.forEach((row) => {
      // Aceptar tanto docente_rfc como rfc
      const rfc = (row.rfc || row.docente_rfc || '').trim().toUpperCase();
      if (!rfc) {
        filasErroneas++;
        console.warn('Fila sin RFC:', row);
        return;
      }

      // Obtener ciclo escolar (puede venir como ciclo_escolar o docente_ciclo_escolar)
      const cicloEscolar = row.ciclo_escolar || row.docente_ciclo_escolar || '2024-2025';
      
      // Crear clave única: RFC_CICLO
      const docId = `${rfc}_${cicloEscolar}`;

      if (!agrupados[docId]) {
        agrupados[docId] = {
          metadata: construirMetadata(row, cicloEscolar),
          docente: construirDocenteDesdeFila(row),
          carga_academica_60: [],
          carga_academica_50: []
        };
      } else {
        // Combinar datos del docente si hay múltiples filas
        combinarDocenteData(agrupados[docId].docente, construirDocenteDesdeFila(row));
      }

      // Agregar materia a la carga académica
      const materia60 = construirCargaAcademica(row, '60');
      const materia50 = construirCargaAcademica(row, '50');
      if (materia60.asignatura) { // Solo agregar si tiene asignatura
        agrupados[docId].carga_academica_60.push(materia60);
      }
      if (materia50.asignatura) {
        agrupados[docId].carga_academica_50.push(materia50);
      }
    });

    let exitosos = 0;
    let errores = filasErroneas;

    for (const [docId, horario] of Object.entries(agrupados)) {
      try {
        await db.collection('horarios_docentes').doc(docId).set({
          metadata: horario.metadata,
          docente: horario.docente,
          carga_academica_60: horario.carga_academica_60,
          carga_academica_50: horario.carga_academica_50,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          importedBy: currentUser?.uid || null
        });
        exitosos++;
      } catch (e) {
        console.error('Error guardando horario', docId, e);
        errores++;
      }
    }

    const tipoMensaje = errores === 0 ? 'success' : 'info';
    showMessage(
      msgHorarios,
      `✅ Importación completa: ${exitosos} horarios guardados, ${errores} errores.`,
      tipoMensaje
    );

    horariosFileInput.value = '';
    horariosFileName.textContent = '';
    horariosPreviewBtn.disabled = true;
    horariosUploadBtn.disabled = true;
    horariosPreviewTable.innerHTML = '';
    horariosData = null;
  });
}

if (horariosDeleteBtn) {
  horariosDeleteBtn.addEventListener('click', async () => {
    const confirmacion = confirm(
      '¿Eliminar TODOS los horarios de la colección "horarios_docentes"? Esta acción no se puede deshacer.'
    );
    if (!confirmacion) return;

    try {
      showMessage(msgHorarios, '⏳ Eliminando horarios...', 'info');
      const eliminados = await eliminarHorariosDocentes();
      showMessage(
        msgHorarios,
        `✅ Eliminación completa: ${eliminados} registros eliminados.`,
        'success'
      );
    } catch (e) {
      console.error('Error eliminando horarios:', e);
      showMessage(msgHorarios, '❌ Error eliminando horarios: ' + e.message, 'error');
    }
  });
}

if (horarioSearchBtn) {
  horarioSearchBtn.addEventListener('click', buscarHorarioPorRfc);
}

if (horarioSearchInput) {
  horarioSearchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      buscarHorarioPorRfc();
    }
  });
}

async function buscarHorarioPorRfc() {
  if (!horarioSearchInput || !horarioSearchResult) return;
  const rfc = horarioSearchInput.value.trim().toUpperCase();
  if (!rfc) {
    horarioSearchResult.innerHTML = '<p style="color:#c62828;">Ingresa un RFC.</p>';
    return;
  }

  horarioSearchResult.innerHTML = '<p>🔍 Buscando...</p>';
  try {
    // Buscar todos los documentos que empiecen con el RFC
    const snapshot = await db.collection('horarios_docentes')
      .where(firebase.firestore.FieldPath.documentId(), '>=', rfc)
      .where(firebase.firestore.FieldPath.documentId(), '<=', rfc + '\uf8ff')
      .get();

    if (snapshot.empty) {
      horarioSearchResult.innerHTML = '<p style="color:#777;">No se encontró horario para este RFC.</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      html += renderHorarioResult(doc.data(), doc.id);
    });
    
    horarioSearchResult.innerHTML = html;
  } catch (e) {
    console.error(e);
    horarioSearchResult.innerHTML = '<p style="color:#c62828;">Error al buscar horario: ' + e.message + '</p>';
  }
}

async function eliminarHorariosDocentes() {
  const batchSize = 400;
  let totalEliminados = 0;

  while (true) {
    const snapshot = await db.collection('horarios_docentes')
      .orderBy(firebase.firestore.FieldPath.documentId())
      .limit(batchSize)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalEliminados += snapshot.size;

    if (snapshot.size < batchSize) break;
  }

  return totalEliminados;
}

// ==================== FUNCIONES AUXILIARES ====================

function normalizarClaveCSV(key) {
  if (!key) return '';
  const base = String(key).trim().toLowerCase();
  const sinAcentos = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return sinAcentos.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function mapearFilaCSV(row) {
  const mapped = {};
  Object.keys(row || {}).forEach((key) => {
    const cleanKey = normalizarClaveCSV(key);
    if (!cleanKey) return;
    const valor = row[key];
    mapped[cleanKey] = typeof valor === 'string' ? valor.trim() : valor;
  });
  return mapped;
}

function obtenerValorCSV(mapped, keys) {
  for (const key of keys) {
    const valor = mapped[key];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      return valor;
    }
  }
  return '';
}

function normalizarTurno(valor) {
  const raw = String(valor || '').trim().toLowerCase();
  if (!raw) return '';
  if (['m', 'mat', 'matutino', 'manana', 'mañana'].includes(raw)) return 'matutino';
  if (['v', 'ves', 'vespertino', 'tarde'].includes(raw)) return 'vespertino';
  return '';
}

function normalizarFecha(valor) {
  if (!valor) return null;
  const raw = String(valor).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return {
      fecha: raw,
      fechaTs: firebase.firestore.Timestamp.fromDate(date)
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const normalized = `${yyyy}-${mm}-${dd}`;
  return {
    fecha: normalized,
    fechaTs: firebase.firestore.Timestamp.fromDate(new Date(`${normalized}T00:00:00`))
  };
}

function normalizarCantidadFaltas(valor) {
  if (valor === undefined || valor === null) return null;
  const raw = String(valor).trim();
  if (!raw) return null;
  const numero = Number(raw);
  if (!Number.isFinite(numero) || !Number.isInteger(numero) || numero < 0) return null;
  return numero;
}

function normalizarFilaAsistencia(row) {
  const mapped = mapearFilaCSV(row);
  const fechaInfo = normalizarFecha(obtenerValorCSV(mapped, ['fecha']));
  const grupo = String(obtenerValorCSV(mapped, ['grupo'])).trim();
  const turno = normalizarTurno(obtenerValorCSV(mapped, ['turno']));
  const numeroControl = String(obtenerValorCSV(mapped, [
    'numero_control',
    'numero_de_control',
    'numero',
    'no_control',
    'nocontrol',
    'num_control',
    'numcontrol',
    'numerocontrol'
  ])).trim();
  const nombre = String(obtenerValorCSV(mapped, ['nombre', 'nombre_alumno', 'alumno'])).trim();
  const faltasRaw = obtenerValorCSV(mapped, [
    'faltas',
    'cantidad_faltas',
    'num_faltas',
    'numero_faltas',
    'total_faltas'
  ]);
  const faltas = normalizarCantidadFaltas(faltasRaw);
  const materias = String(obtenerValorCSV(mapped, [
    'materias',
    'materias_faltadas',
    'materias_donde_falto',
    'materias_falto'
  ])).trim();
  const motivo = String(obtenerValorCSV(mapped, ['motivo'])).trim();
  const observaciones = String(obtenerValorCSV(mapped, ['observaciones', 'observacion', 'obs'])).trim();

  const errores = [];
  if (!fechaInfo) errores.push('fecha');
  if (!grupo) errores.push('grupo');
  if (!turno) errores.push('turno');
  if (!numeroControl) errores.push('numero_control');
  if (!nombre) errores.push('nombre');
  if (faltas === null) errores.push('faltas');
  if (!materias) errores.push('materias');

  if (errores.length > 0) {
    return { ok: false, errors: errores };
  }

  return {
    ok: true,
    data: {
      fecha: fechaInfo.fecha,
      fecha_ts: fechaInfo.fechaTs,
      grupo,
      turno,
      numero_control: numeroControl,
      nombre,
      faltas,
      materias,
      motivo: motivo || null,
      observaciones: observaciones || null
    }
  };
}

function showMessage(element, msg, type = 'info') {
  element.innerHTML = `<div class="message ${type}">${msg}</div>`;
  setTimeout(() => {
    element.innerHTML = '';
  }, 5000);
}

function normalizarFilaHorario(row) {
  const normalizada = {};
  Object.keys(row).forEach((key) => {
    if (!key) return;
    const cleanKey = key.trim();
    const valor = row[key];
    normalizada[cleanKey] = typeof valor === 'string' ? valor.trim() : valor;
  });
  return normalizada;
}

function obtenerPeriodo(cicloEscolar) {
  // Convertir "2024-2025" a "Agosto 2024 - Julio 2025"
  const [inicio, fin] = cicloEscolar.split('-');
  return `Agosto ${inicio} - Julio ${fin}`;
}

// ✅ NUEVA FUNCIÓN: Obtener autoridades por turno
function obtenerAutoridades(turno) {
  const director = 'EDGAR OAXACA HERNÁNDEZ';
  const subdirector_tecnico = 'IGNACIO MORALES CASTRO';

  let jefe_servicios_docentes;
  const turnoNorm = (turno || '').toLowerCase();

  if (turnoNorm.includes('matutino')) {
    jefe_servicios_docentes = 'VÍCTOR MANUEL POOT LÓPEZ';
  } else if (turnoNorm.includes('vespertino')) {
    jefe_servicios_docentes = 'MARTÍN RAFAEL VELASCO BALTAZAR';
  } else {
    // Por defecto, vespertino
    jefe_servicios_docentes = 'MARTÍN RAFAEL VELASCO BALTAZAR';
  }

  return {
    director,
    subdirector_tecnico,
    jefe_servicios_docentes
  };
}

// ✅ MODIFICADA: Ahora incluye autoridades
function construirMetadata(row, cicloEscolar) {
  const ahora = new Date();
  const turno = row.turno || row.docente_turno || row.turno_calculado || '';

  const metadataBase = {
    ciclo_escolar: cicloEscolar,
    periodo: obtenerPeriodo(cicloEscolar),
    fecha_registro: ahora.toISOString().split('T')[0],
    origen_documento: row.origen_documento || 'DGETI - DISTRIBUCIÓN DE ACTIVIDADES ACADÉMICAS',
    plantel: (row.plantel || 'CETIS 50').toUpperCase(),
    ubicacion: (row.ubicacion || 'IZTAPALAPA, CDMX').toUpperCase(),
    turno_calculado: row.turno_calculado || null,
    jornada_fin_oficial: row.jornada_fin_oficial || null,
    jornada_fin_practica: row.jornada_fin_practica || null
  };

  const autoridades = obtenerAutoridades(turno);

  return {
    ...metadataBase,
    autoridades
  };
}

function construirDocenteDesdeFila(row) {
  return {
    nombre: (row.nombre || row.docente_nombre || row.docente || '').toUpperCase(),
    rfc: (row.rfc || row.docente_rfc || '').toUpperCase(),
    curp: (row.curp || row.docente_curp || '').toUpperCase(),
    categoria: row.categoria || row.docente_categoria || '',
    turno: row.turno || row.docente_turno || '',
    perfil: row.perfil || row.docente_perfil || '',
    correo: row.correo || row.docente_correo || ''
  };
}

function combinarDocenteData(destino, fuente) {
  Object.keys(fuente).forEach((clave) => {
    if (!destino[clave] && fuente[clave]) {
      destino[clave] = fuente[clave];
    }
  });
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hh, mm] = value.split(':').map((part) => Number(part));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function formatMinutesToTime(minutes) {
  if (minutes == null) return '';
  const total = (minutes + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function calcularHorario50(row) {
  const inicioBase = row.hora_inicio_60 || row.hora_inicio || '';
  const finBase = row.hora_fin_60 || row.hora_fin || '';
  const offsetMin = Number(row.offset_min);
  const inicioMin = parseTimeToMinutes(inicioBase);
  const finMin = parseTimeToMinutes(finBase);

  if (inicioMin == null || finMin == null) {
    return { hora_inicio: row.hora_inicio_50 || '', hora_fin: row.hora_fin_50 || '' };
  }

  if (!Number.isNaN(offsetMin)) {
    const inicioCalc = inicioMin + offsetMin;
    return { hora_inicio: formatMinutesToTime(inicioCalc), hora_fin: formatMinutesToTime(inicioCalc + 50) };
  }

  return { hora_inicio: formatMinutesToTime(inicioMin - 10), hora_fin: formatMinutesToTime(finMin - 20) };
}

function construirCargaAcademica(row, tipo = '60') {
  const horario50 = calcularHorario50(row);
  const horaInicio = tipo === '50'
    ? (row.hora_inicio_50 || horario50.hora_inicio || '')
    : (row.hora_inicio_60 || row.hora_inicio || '');
  const horaFin = tipo === '50'
    ? (row.hora_fin_50 || horario50.hora_fin || '')
    : (row.hora_fin_60 || row.hora_fin || '');

  return {
    asignatura: row.asignatura || '',
    grupo: row.grupo || '',
    salon: row.salon || '',
    especialidad: row.especialidad || '',
    dia: row.dia || '',
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    horas: Number(row.horas) || 0,
    aula_tipo: row.aula_tipo || '',
    tipo_horario: tipo,
    offset_min: Number(row.offset_min) || null,
    flag_fuera_jornada_practica: row.flag_fuera_jornada_practica || null
  };
}

function mostrarPreviewHorarios(data) {
  if (!data || data.length === 0) {
    horariosPreviewTable.innerHTML = '<p>No hay datos para mostrar.</p>';
    return;
  }

  let html = '<table class="data-table"><thead><tr>';
  const keys = Object.keys(data[0]);
  keys.forEach((key) => {
    html += `<th>${key}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach((row) => {
    html += '<tr>';
    keys.forEach((key) => {
      html += `<td>${row[key] ?? ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  horariosPreviewTable.innerHTML = html;
}

// ✅ MODIFICADA: Ahora muestra autoridades
function renderHorarioResult(data, docId) {
  const metadata = data?.metadata || {};
  const docente = data?.docente || {};
  const carga60 = Array.isArray(data?.carga_academica_60) ? data.carga_academica_60 : [];
  const carga50 = Array.isArray(data?.carga_academica_50) ? data.carga_academica_50 : [];
  const cargaLegacy = Array.isArray(data?.carga_academica) ? data.carga_academica : [];
  const turno = (docente.turno || metadata.turno_calculado || '').toLowerCase();
  const autoridades = metadata.autoridades || {};

  let html = '<div class="horario-card">';
  
  // Header con ciclo escolar
  html += `<div style="background: linear-gradient(135deg, #7a1e29 0%, #5d1620 100%); color: white; padding: 15px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">`;
  html += `<h4 style="margin: 0; color: white;">${docente.nombre || 'DOCENTE SIN NOMBRE'}</h4>`;
  html += `<p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 0.9rem;">📅 ${metadata.ciclo_escolar || ''} | ${metadata.periodo || ''}</p>`;
  html += `</div>`;

  // Información del docente
  html += '<div class="horario-info">';
  html += `<div class="horario-info-item"><strong>RFC:</strong> ${docente.rfc || '-'}</div>`;
  html += `<div class="horario-info-item"><strong>CURP:</strong> ${docente.curp || '-'}</div>`;
  html += `<div class="horario-info-item"><strong>Categoría:</strong> ${docente.categoria || '-'}</div>`;
  html += `<div class="horario-info-item"><strong>Turno:</strong> ${docente.turno || '-'}</div>`;
  html += `<div class="horario-info-item"><strong>Perfil:</strong> ${docente.perfil || '-'}</div>`;
  html += `<div class="horario-info-item"><strong>Correo:</strong> ${docente.correo || '-'}</div>`;
  html += '</div>';

  // Metadatos
  html += '<div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">';
  html += '<h4 style="color: #1565c0; margin: 0 0 10px 0; font-size: 1rem;">📋 Metadatos</h4>';
  html += `<p style="margin: 5px 0; font-size: 0.9rem;"><strong>Plantel:</strong> ${metadata.plantel || '-'}</p>`;
  html += `<p style="margin: 5px 0; font-size: 0.9rem;"><strong>Ubicación:</strong> ${metadata.ubicacion || '-'}</p>`;
  html += `<p style="margin: 5px 0; font-size: 0.9rem;"><strong>Fecha registro:</strong> ${metadata.fecha_registro || '-'}</p>`;
  html += `<p style="margin: 5px 0; font-size: 0.85rem; color: #666;"><strong>ID:</strong> ${docId}</p>`;
  html += '</div>';

  // ✅ NUEVO BLOQUE: Autoridades
  html += '<div style="background: #fff8e1; padding: 15px; border-radius: 8px; margin: 0 0 20px 0; border-left: 4px solid #ffb300;">';
  html += '<h4 style="color: #ff6f00; margin: 0 0 10px 0; font-size: 1rem;">👥 Autoridades</h4>';
  html += `<p style="margin: 4px 0; font-size: 0.9rem;"><strong>Director:</strong> ${autoridades.director || '-'}</p>`;
  html += `<p style="margin: 4px 0; font-size: 0.9rem;"><strong>Subdirector Técnico:</strong> ${autoridades.subdirector_tecnico || '-'}</p>`;
  html += `<p style="margin: 4px 0; font-size: 0.9rem;"><strong>Jefe de Servicios Docentes:</strong> ${autoridades.jefe_servicios_docentes || '-'}</p>`;
  html += '</div>';

  // Carga académica
  html += '<div class="carga-academica">';
  html += '<h4 style="color: #7a1e29; margin: 0 0 15px 0;">📚 Carga Académica</h4>';

  const hasNew = carga60.length || carga50.length;
  if (!hasNew && !cargaLegacy.length) {
    html += '<p style="color:#777;">Sin materias registradas.</p>';
  } else if (!hasNew) {
    html += renderCargaAcademica(cargaLegacy, 'Horario', turno);
  } else {
    html += renderCargaAcademica(carga60, 'Horario Oficial (60 min)', turno);
    html += renderCargaAcademica(carga50, 'Horario Práctico (50 min)', turno);
  }

  html += '</div>';
  html += '</div>';
  return html;
}

function renderCargaAcademica(carga, titulo, turno) {
  let html = `<div style="margin-bottom: 20px;">`;
  html += `<h5 style="margin: 0 0 10px 0; color: #5d1620;">${titulo}</h5>`;

  if (!carga.length) {
    html += '<p style="color:#777;">Sin materias registradas.</p>';
    html += '</div>';
    return html;
  }

  const porDia = {};
  carga.forEach(materia => {
    const dia = materia.dia || 'Sin día';
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(materia);
  });

  const diasOrden = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const diasOrdenados = Object.keys(porDia).sort((a, b) => {
    const indexA = diasOrden.indexOf(a);
    const indexB = diasOrden.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  diasOrdenados.forEach(dia => {
    html += `<div class="carga-item">`;
    html += `<div class="carga-item-header"><h5>📅 ${dia}</h5></div>`;

    const materiasOrdenadas = porDia[dia].slice().sort((a, b) => {
      const aMin = parseTimeToMinutes(a.hora_inicio);
      const bMin = parseTimeToMinutes(b.hora_inicio);
      if (aMin == null) return 1;
      if (bMin == null) return -1;
      return aMin - bMin;
    });

    if (turno.includes('matutino')) {
      materiasOrdenadas.push({
        asignatura: 'RECESO',
        hora_inicio: '10:15',
        hora_fin: '10:45',
        receso: true
      });
    }

    materiasOrdenadas
      .sort((a, b) => {
        const aMin = parseTimeToMinutes(a.hora_inicio);
        const bMin = parseTimeToMinutes(b.hora_inicio);
        if (aMin == null) return 1;
        if (bMin == null) return -1;
        return aMin - bMin;
      })
      .forEach(materia => {
        if (materia.receso) {
          html += `<div class="carga-item-details">`;
          html += `<div><strong>Receso:</strong> ${materia.hora_inicio} - ${materia.hora_fin}</div>`;
          html += `</div>`;
          html += `<hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;">`;
          return;
        }

        html += `<div class="carga-item-details">`;
        html += `<div><strong>Asignatura:</strong> ${materia.asignatura || '-'}</div>`;
        html += `<div><strong>Grupo:</strong> ${materia.grupo || '-'}</div>`;
        html += `<div><strong>Horario:</strong> ${materia.hora_inicio || ''} - ${materia.hora_fin || ''}</div>`;
        html += `<div><strong>Horas:</strong> ${materia.horas || 0}</div>`;
        html += `<div><strong>Salón:</strong> ${materia.salon || '-'}</div>`;
        html += `<div><strong>Especialidad:</strong> ${materia.especialidad || '-'}</div>`;
        html += `</div>`;
        html += `<hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;">`;
      });

    html += `</div>`;
  });

  html += '</div>';
  return html;
}
