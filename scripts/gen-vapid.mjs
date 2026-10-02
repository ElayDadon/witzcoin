// Generates the VAPID key pair used to sign web-push messages.
// Usage:  npm run gen:vapid    then paste the two values into .env.local / Vercel.
import webpush from 'web-push';
const keys = webpush.generateVAPIDKeys();
console.log('\nAdd these to your environment variables:\n');
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\nKeep the private key secret. If you change it, every device must re-subscribe.\n');
