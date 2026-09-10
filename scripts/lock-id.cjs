const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' }
});
const key = publicKey.toString('base64');
const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
const id = hash.slice(0, 32).split('').map(c => {
  return c >= 'a' ? String.fromCharCode(c.charCodeAt(0) + 10) : String.fromCharCode(c.charCodeAt(0) + 49);
}).join('');
console.log("KEY: " + key);
console.log("ID: " + id);
