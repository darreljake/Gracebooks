/*
 * GraceBooks saved receipt rotation.
 *
 * Remembers how a receipt/count-sheet photo should be turned (0/90/180/270
 * degrees clockwise) so a sideways photo opens upright for everyone. One doc
 * per image in `receiptRotations/{sha256(storage path)}`: {path, rotation,
 * updatedAt, updatedBy}. Only the Treasurer saves (firestore.rules enforces
 * it); every other role reads the saved rotation and may still rotate
 * locally without saving. The image file and highlight annotations are never
 * changed - this is a display setting only.
 *
 * receipt-annotator.js stays Firebase-free: it only calls this provider
 * (window.GraceBooksReceiptRotation) when the page has loaded it.
 */
(function () {
  'use strict';

  var VALID = [0, 90, 180, 270];
  var cache = {};

  // Firebase Storage download URLs carry the object path in /o/<encoded>
  // and a token that can change; key on the path so a re-issued URL for the
  // same file still finds its rotation. Any other URL keys on itself minus
  // the query string.
  function storageKey(url) {
    var s = String(url || '');
    var m = /\/o\/([^?#]+)/.exec(s);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    return s.split('?')[0].split('#')[0];
  }

  function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('crypto.subtle unavailable'));
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function db() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length || !firebase.firestore) return null;
    return firebase.firestore();
  }

  function currentUser() {
    if (window.graceBooksUser) return window.graceBooksUser;
    try { return JSON.parse(sessionStorage.getItem('graceBooksUser') || 'null'); } catch (e) { return null; }
  }

  function canSave() {
    var u = currentUser();
    return !!(u && u.role === 'Treasurer' && db());
  }

  function load(url) {
    var key = storageKey(url);
    if (!key) return Promise.resolve(0);
    if (cache[key] != null) return Promise.resolve(cache[key]);
    var store = db();
    if (!store) return Promise.resolve(0);
    return sha256Hex(key).then(function (id) {
      return store.collection('receiptRotations').doc(id).get();
    }).then(function (snap) {
      var r = snap.exists ? Number(snap.data().rotation) : 0;
      if (VALID.indexOf(r) < 0) r = 0;
      cache[key] = r;
      return r;
    }).catch(function (err) {
      console.warn('Saved receipt rotation unavailable', err);
      return 0;
    });
  }

  function save(url, rotation) {
    var key = storageKey(url);
    var r = Number(rotation);
    if (!key || VALID.indexOf(r) < 0) return Promise.reject(new Error('Invalid rotation'));
    if (!canSave()) return Promise.reject(new Error('Only the Treasurer can save rotation'));
    var u = currentUser() || {};
    var authUser = firebase.auth && firebase.auth().currentUser;
    return sha256Hex(key).then(function (id) {
      return db().collection('receiptRotations').doc(id).set({
        path: key,
        rotation: r,
        updatedAt: new Date().toISOString(),
        updatedBy: { uid: (authUser && authUser.uid) || u.uid || '', name: u.name || '', role: u.role || '' }
      });
    }).then(function () {
      cache[key] = r;
      return r;
    });
  }

  window.GraceBooksReceiptRotation = { load: load, save: save, canSave: canSave, storageKey: storageKey };
})();
