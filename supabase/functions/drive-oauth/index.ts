import { createDriveOAuthHandler } from './handler.js';

Deno.serve(createDriveOAuthHandler({
  clientId: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID'),
  clientSecret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET'),
  redirectUri: Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI'),
  extensionIds: Deno.env.get('GOOGLE_DRIVE_EXTENSION_IDS'),
}));
