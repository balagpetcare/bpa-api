import { prisma } from '../../database/prisma';
import { AppError } from '../../utils/AppError';
import { config } from '../../config';
import { AuthProvider } from '@prisma/client';

export async function getAuthUrl(provider: string, state: string): Promise<string> {
  switch (provider.toLowerCase()) {
    case 'google':
      if (!config.GOOGLE_CLIENT_ID) throw AppError.badRequest('Google login is not configured on the server');
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.GOOGLE_CLIENT_ID}&redirect_uri=${config.GOOGLE_CALLBACK_URL}&response_type=code&scope=openid%20email%20profile&state=${state}`;
    case 'facebook':
      if (!config.FACEBOOK_CLIENT_ID) throw AppError.badRequest('Facebook login is not configured on the server');
      return `https://www.facebook.com/v12.0/dialog/oauth?client_id=${config.FACEBOOK_CLIENT_ID}&redirect_uri=${config.FACEBOOK_CALLBACK_URL}&state=${state}&scope=email,public_profile`;
    case 'instagram':
      if (!config.INSTAGRAM_CLIENT_ID) throw AppError.badRequest('Instagram login is not configured on the server');
      return `https://api.instagram.com/oauth/authorize?client_id=${config.INSTAGRAM_CLIENT_ID}&redirect_uri=${config.INSTAGRAM_CALLBACK_URL}&scope=user_profile,user_media&response_type=code&state=${state}`;
    case 'twitter':
      if (!config.TWITTER_CLIENT_ID) throw AppError.badRequest('Twitter login is not configured on the server');
      return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${config.TWITTER_CLIENT_ID}&redirect_uri=${config.TWITTER_CALLBACK_URL}&scope=tweet.read%20users.read%20follows.read&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    default:
      throw AppError.badRequest('Unsupported OAuth provider');
  }
}

export async function handleCallback(provider: string, code: string) {
  let profile: any;
  let authProvider: AuthProvider;

  switch (provider.toLowerCase()) {
    case 'google':
      profile = await getGoogleProfile(code);
      authProvider = 'GOOGLE';
      break;
    case 'facebook':
      profile = await getFacebookProfile(code);
      authProvider = 'FACEBOOK';
      break;
    case 'instagram':
      profile = await getInstagramProfile(code);
      authProvider = 'INSTAGRAM';
      break;
    case 'twitter':
      profile = await getTwitterProfile(code);
      authProvider = 'TWITTER';
      break;
    default:
      throw AppError.badRequest('Unsupported OAuth provider');
  }

  return findOrCreateUserFromOAuth(authProvider, profile);
}

async function getGoogleProfile(code: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: config.GOOGLE_CALLBACK_URL!,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw AppError.unauthorized('Failed to get Google access token');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  return profileRes.json();
}

async function getFacebookProfile(code: string) {
  const tokenRes = await fetch(`https://graph.facebook.com/v12.0/oauth/access_token?client_id=${config.FACEBOOK_CLIENT_ID}&redirect_uri=${config.FACEBOOK_CALLBACK_URL}&client_secret=${config.FACEBOOK_CLIENT_SECRET}&code=${code}`);
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw AppError.unauthorized('Failed to get Facebook access token');

  const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${tokens.access_token}`);
  return profileRes.json();
}

async function getInstagramProfile(code: string) {
  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.INSTAGRAM_CLIENT_ID!,
      client_secret: config.INSTAGRAM_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: config.INSTAGRAM_CALLBACK_URL!,
      code,
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw AppError.unauthorized('Failed to get Instagram access token');

  const profileRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${tokens.access_token}`);
  return profileRes.json();
}

async function getTwitterProfile(code: string) {
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.TWITTER_CLIENT_ID}:${config.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.TWITTER_CALLBACK_URL!,
      code_verifier: 'challenge',
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) throw AppError.unauthorized('Failed to get Twitter access token');

  const profileRes = await fetch('https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const data = await profileRes.json() as any;
  return data.data;
}

async function findOrCreateUserFromOAuth(provider: AuthProvider, profile: any) {
  const providerAccountId = profile.id || profile.sub;
  const email = profile.email;

  const existingAccount = await prisma.authAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: { include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } } } },
  });

  if (existingAccount) {
    return existingAccount.user;
  }

  if (email) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    });

    if (existingUser) {
      await prisma.authAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerAccountId,
          providerEmail: email,
        },
      });
      return existingUser;
    }
  }

  const user = await prisma.user.create({
    data: {
      name: profile.name || profile.username || 'Social User',
      email: email || null,
      avatarUrl: profile.picture || (profile.picture?.data?.url) || profile.profile_image_url || null,
      role: 'USER',
      authAccounts: {
        create: {
          provider,
          providerAccountId,
          providerEmail: email || null,
        },
      },
    },
    include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
  });

  return user;
}
