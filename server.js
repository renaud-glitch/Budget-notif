const express = require('express');
const webpush = require('web-push');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Clés VAPID
webpush.setVapidDetails(
  'mailto:renaud.courbaize@gmail.com',
  process.env.VAPID_PUBLIC,
  process.env.VAPID_PRIVATE
);

// Init Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://compte-11a9c-default-rtdb.europe-west1.firebasedatabase.app/'
});
const db = admin.database();

// ── Sauvegarder un abonnement push ──
app.post('/subscribe', async (req, res) => {
  const { subscription, deviceId } = req.body;
  if (!subscription || !deviceId) return res.status(400).json({ error: 'Données manquantes' });
  await db.ref('push_subscriptions/' + deviceId).set(subscription);
  res.json({ ok: true });
});

// ── Recevoir un événement et notifier les AUTRES appareils ──
app.post('/notify', async (req, res) => {
  const { title, body, senderDeviceId } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre manquant' });

  const snap = await db.ref('push_subscriptions').once('value');
  const subscriptions = snap.val() || {};

  const payload = JSON.stringify({ title, body });
  const sends = [];

  for (const [deviceId, sub] of Object.entries(subscriptions)) {
    // Ne pas notifier l'expéditeur
    if (deviceId === senderDeviceId) continue;
    sends.push(
      webpush.sendNotification(sub, payload).catch(async (err) => {
        // Abonnement expiré → on le supprime
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.ref('push_subscriptions/' + deviceId).remove();
        }
      })
    );
  }

  await Promise.all(sends);
  res.json({ ok: true, sent: sends.length });
});

// ── Health check ──
app.get('/', (req, res) => res.send('Budget Notif Server OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
