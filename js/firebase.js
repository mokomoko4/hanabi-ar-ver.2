import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getDatabase, ref, query, orderByChild, limitToLast, get } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDGlQeMC6iJzWAB16teP_5oC2FeBcgZxmA',
  authDomain: 'hanabi-ar-1754a.firebaseapp.com',
  databaseURL: 'https://hanabi-ar-1754a-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'hanabi-ar-1754a',
  storageBucket: 'hanabi-ar-1754a.firebasestorage.app',
  messagingSenderId: '861479696200',
  appId: '1:861479696200:web:393add8997cf25affd657d',
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

const auth = getAuth(app);
signInAnonymously(auth)
  .then(() => console.log('[firebase] anonymous auth ok'))
  .catch(err => console.error('[firebase] auth error:', err));

export async function fetchWorks(n = 20) {
  const q = query(ref(db, 'works'), orderByChild('createdAt'), limitToLast(n));
  const snap = await get(q);
  const data = snap.val() || {};
  return Object.entries(data)
    .map(([id, v]) => ({ id, ...v }))
    .filter(w => w.url && w.visible !== false)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
