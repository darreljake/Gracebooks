(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCimlS-2_tInj_khQ6KIaeocHYVVK0hwtc",
    authDomain: "gracebooks-7eebc.firebaseapp.com",
    projectId: "gracebooks-7eebc",
    storageBucket: "gracebooks-7eebc.firebasestorage.app",
    messagingSenderId: "423871889231",
    appId: "1:423871889231:web:b2053c9df3517e3c210f3a"
  };

  // TODO: paste the reCAPTCHA v3 site key from Firebase Console > Build > App Check
  // (register this web app under a reCAPTCHA v3 provider) once created. Until this
  // is set, App Check stays inactive and nothing else is affected.
  const APP_CHECK_SITE_KEY = '';

  if (!window.firebase) {
    window.location.href = 'index.html';
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  if (APP_CHECK_SITE_KEY && typeof firebase.appCheck === 'function') {
    firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
  }

  window.getGraceBooksProfile = async function getGraceBooksProfile(user) {
    const cached = sessionStorage.getItem('graceBooksUser');
    if (cached) {
      try {
        const cachedUser = JSON.parse(cached);
        if (cachedUser && cachedUser.uid === user.uid && cachedUser.role && cachedUser.name) {
          window.graceBooksUser = cachedUser;
          return cachedUser;
        }
      } catch (error) {
        sessionStorage.removeItem('graceBooksUser');
      }
    }

    const snap = await firebase.firestore().collection('userProfiles').doc(user.uid).get();
    if (!snap.exists) throw new Error('No GraceBooks role profile found for this account.');
    const profile = snap.data();
    const sessionUser = {
      uid: user.uid,
      email: user.email || '',
      role: profile.role || '',
      name: profile.name || user.email || 'GraceBooks User'
    };
    if (!sessionUser.role) throw new Error('GraceBooks role profile is incomplete.');
    sessionStorage.setItem('graceBooksUser', JSON.stringify(sessionUser));
    sessionStorage.setItem('role', sessionUser.role);
    sessionStorage.setItem('name', sessionUser.name);
    window.graceBooksUser = sessionUser;
    return sessionUser;
  };

  window.requireGraceBooksAuth = function requireGraceBooksAuth() {
    window.graceBooksAuthReady = new Promise((resolve) => {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
          sessionStorage.clear();
          window.location.href = 'index.html';
          return;
        }
        try {
          const profile = await window.getGraceBooksProfile(user);
          document.dispatchEvent(new CustomEvent('gracebooks-auth-ready', { detail: profile }));
          resolve(profile);
        } catch (error) {
          console.error(error);
          await firebase.auth().signOut();
          sessionStorage.clear();
          window.location.href = 'index.html';
        }
      });
    });
    return window.graceBooksAuthReady;
  };

  window.graceBooksLogout = async function graceBooksLogout() {
    await firebase.auth().signOut();
    sessionStorage.clear();
    window.location.href = 'index.html';
  };
})();
