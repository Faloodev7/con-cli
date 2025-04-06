/********************************************
 * app.js - Proyecto RegistoWeb_Clientes
 ********************************************/
const express = require('express');
const path = require('path');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');

// Carga las credenciales de Firebase
let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
  // En producción (Render), se cargará la variable de entorno FIREBASE_CREDENTIALS
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } catch (error) {
    console.error('Error al parsear FIREBASE_CREDENTIALS:', error);
    process.exit(1);
  }
} else {
  // En desarrollo local, usa el archivo local (asegúrate de tenerlo en .gitignore)
  serviceAccount = require('./firebase-credentials.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Credenciales de Mercado Libre
const CLIENT_ID = '5628570819950677';
const CLIENT_SECRET = 'hv6VQfos0bX5m52D1boJTypy1Si7NqZY';

// URLs de Mercado Libre
const ML_AUTH_URL = 'https://auth.mercadolibre.com.ar/authorization';
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sirve los archivos estáticos desde la carpeta "views"
app.use(express.static(path.join(__dirname, 'views')));

// Ruta principal: sirve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

/**
 * /auth
 * Inicia el flujo OAuth redirigiendo al usuario a la página de Mercado Libre.
 */
app.get('/auth', (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/callback`;
    const authUrl = `${ML_AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error en /auth:', error);
    res.status(500).send('Error al iniciar la autorización con Mercado Libre.');
  }
});

/**
 * /callback
 * Ruta de callback que Mercado Libre llama con un "code". Se intercambia el código por tokens.
 */
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No se recibió el parámetro "code".');
  }
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/callback`;
    const tokenResponse = await axios.post(ML_TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
      },
    });

    const { access_token, token_type, expires_in, scope, user_id, refresh_token } = tokenResponse.data;

    // Guarda los tokens en Firestore, en la colección 'clientes-ml'
    const docRef = db.collection('clientes-ml').doc(String(user_id));
    await docRef.set({
      ml_user_id: user_id,
      access_token,
      refresh_token,
      scope,
      token_type,
      expires_in,
      created_at: new Date().toISOString(),
    });

    res.redirect('/?ml_auth=success');
  } catch (error) {
    console.error('Error al intercambiar code por tokens:', error.response?.data || error.message);
    res.status(500).send('Error al obtener tokens de Mercado Libre.');
  }
});

/**
 * /admin
 * Panel sencillo para visualizar los tokens y datos almacenados en Firestore.
 */
app.get('/admin', async (req, res) => {
  try {
    const snapshot = await db.collection('clientes-ml').get();
    let html = `
      <h1>Panel de Tokens (clientes-ml)</h1>
      <table border="1" cellpadding="8" cellspacing="0">
        <thead>
          <tr>
            <th>ML User ID</th>
            <th>Access Token</th>
            <th>Refresh Token</th>
            <th>Scope</th>
            <th>Expires In</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
    `;

    snapshot.forEach(doc => {
      const data = doc.data();
      html += `
        <tr>
          <td>${data.ml_user_id || ''}</td>
          <td>${data.access_token || ''}</td>
          <td>${data.refresh_token || ''}</td>
          <td>${data.scope || ''}</td>
          <td>${data.expires_in || ''}</td>
          <td>${data.created_at || ''}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    res.send(html);
  } catch (error) {
    console.error('Error en /admin:', error);
    res.status(500).send('Error al obtener los datos de los clientes.');
  }
});

// Inicia el servidor en el puerto configurado (por defecto, 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
