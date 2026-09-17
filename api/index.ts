import { createApp } from '../server/app.ts';

// Vercel invokes the Express handler; only the local server opens a port.
export default createApp();
