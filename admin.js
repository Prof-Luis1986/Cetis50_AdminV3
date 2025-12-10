// ==================== ADMIN.JS ====================

const auth = firebase.auth();
const db = firebase.firestore();

const DOMINIO = 'cetis50cdmx.com';

let currentUser = null;
let csvData = null;
let boletasData = null;

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

// ==================== AUTH ====================

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    loginSection.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    currentUser = null;
    return;
  }

  const dominio = user.email.split('@')[1] || '';
  if (dominio.toLowerCase() !== DOMINIO.toLowerCase()) {
    showLoginMessage('Solo se permite acceso con correo @' + DOMINIO, 'error');
    await auth.signOut();
    return;
  }

  // Verificar permisos
  try {
    // Intentar obtener por UID
    let userRef = db.collection('users').doc(user.uid);
    let userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Intentar buscar por email (doc creado antes de que existiera el UID)
      const tempId = user.email.replace(/[@.]/g, '_');
      const tempRef = db.collection('users').doc(tempId);
      const tempDoc = await tempRef.get();

      if (tempDoc.exists) {
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
        // Crear usuario básico sin permisos
        await userRef.set({
          email: user.email,
          nombre: user.displayName || user.email,
          esDocente: false,
          turno: null,
          canPublish: false,
          canPublishDocentes: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showLoginMessage('Tu cuenta ha sido creada pero no tienes permisos de administrador. Contacta al administrador para obtener acceso.', 'error');
        await auth.signOut();
        return;
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

    // Cargar datos iniciales
    cargarAvisosGenerales();
    cargarAvisosDocentes();
    cargarUsuarios();

  } catch (e) {
    console.error('Error verificando permisos:', e);
    showLoginMessage('Error al verificar permisos: ' + e.message, 'error');
    await auth.signOut();
  }
});

loginBtn.addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
      hd: DOMINIO
    });
    await auth.signInWithPopup(provider);
  } catch (e) {
    console.error(e);
    showLoginMessage('Error al iniciar sesión: ' + e.message, 'error');
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

  // Enlace
  const enlaceHTML = data.linkUrl 
    ? `<div style="margin-top: 15px;">
         <a href="${data.linkUrl}" target="_blank" style="color: #7a1e29; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
           🔗 Ver más información
         </a>
       </div>`
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
    const snapshot = await db.collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    if (snapshot.empty) {
      listaAvisosGenerales.innerHTML = '<p style="color:#777;">No hay avisos publicados.</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
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
    listaAvisosGenerales.innerHTML = '<p style="color:#c62828;">Error al cargar avisos.</p>';
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
  const linkUrl   = (document.getElementById('ad-enlace')?.value || '').trim();  // 🔹 NUEVO

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

// ==================== USUARIOS - REGISTRO INDIVIDUAL ====================

formUsuarioIndividual.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('ui-email').value.trim().toLowerCase();
  const nombre = document.getElementById('ui-nombre').value.trim();
  const turno = document.getElementById('ui-turno').value || null;
  const esDocente = document.getElementById('ui-esDocente').checked;
  const canPublish = document.getElementById('ui-canPublish').checked;
  const canPublishDocentes = document.getElementById('ui-canPublishDocentes').checked;

  // Validar dominio
  const dominio = email.split('@')[1] || '';
  if (dominio.toLowerCase() !== DOMINIO.toLowerCase()) {
    showMessage(
      msgUsuarioIndividual,
      `❌ El correo debe ser del dominio @${DOMINIO}`,
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
      const dominio = email.split('@')[1] || '';
      if (dominio.toLowerCase() !== DOMINIO.toLowerCase()) {
        console.warn(`Email ${email} no es del dominio ${DOMINIO}, omitiendo...`);
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

refreshUsuariosBtn.addEventListener('click', cargarUsuarios);

async function cargarUsuarios() {
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

// ==================== UTILIDADES ====================

function showMessage(element, msg, type = 'info') {
  element.innerHTML = `<div class="message ${type}">${msg}</div>`;
  setTimeout(() => {
    element.innerHTML = '';
  }, 5000);
}