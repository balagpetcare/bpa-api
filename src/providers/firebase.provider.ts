import fs from 'fs';
import { initializeApp, App, cert, Credential } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export type PushMessageInput = {
  fcmToken: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  category: string;
  priority: string;
  data?: Record<string, string>;
};

export type PushSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; invalidToken: boolean; error: string };

/**
 * Wraps firebase-admin so the rest of the app never touches the SDK
 * directly. When no credentials are configured (local/dev/CI), sends are
 * short-circuited into a logged no-op instead of throwing — this keeps the
 * outbox/delivery pipeline fully testable without live Firebase project
 * credentials.
 */
class FirebaseProvider {
  private app: App | null = null;
  private initAttempted = false;

  get enabled(): boolean {
    this.ensureInitialized();
    return this.app !== null;
  }

  private ensureInitialized(): void {
    if (this.initAttempted) return;
    this.initAttempted = true;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    try {
      let credential: Credential | null = null;

      if (serviceAccountJson) {
        credential = cert(JSON.parse(serviceAccountJson));
      } else if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
        credential = cert(JSON.parse(raw));
      }

      if (!credential) {
        console.warn(
          '[FCM] No Firebase credentials configured (FIREBASE_SERVICE_ACCOUNT_JSON / ' +
            'FIREBASE_SERVICE_ACCOUNT_PATH) — push sending is disabled; outbox/delivery ' +
            'jobs will process but mark sends as skipped.',
        );
        return;
      }

      this.app = initializeApp({ credential, projectId });
    } catch (err) {
      console.error('[FCM] Failed to initialize firebase-admin:', err instanceof Error ? err.message : err);
      this.app = null;
    }
  }

  async send(input: PushMessageInput): Promise<PushSendResult> {
    this.ensureInitialized();

    if (!this.app) {
      return { ok: false, invalidToken: false, error: 'FCM_DISABLED' };
    }

    try {
      const providerMessageId = await getMessaging(this.app).send({
        token: input.fcmToken,
        notification: {
          title: input.title,
          body: input.body,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        },
        data: {
          category: input.category,
          priority: input.priority,
          ...(input.deepLink ? { deepLink: input.deepLink } : {}),
          ...(input.data || {}),
        },
        android: {
          priority: input.priority === 'critical' || input.priority === 'high' ? 'high' : 'normal',
          notification: { channelId: mapCategoryToAndroidChannel(input.category) },
        },
        apns: {
          payload: { aps: { sound: 'default', 'content-available': 1 } },
        },
      });
      return { ok: true, providerMessageId };
    } catch (err: any) {
      const code = err?.errorInfo?.code || err?.code || '';
      const invalidToken =
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument';
      return { ok: false, invalidToken, error: code || (err instanceof Error ? err.message : 'UNKNOWN_ERROR') };
    }
  }
}

export function mapCategoryToAndroidChannel(category: string): string {
  const map: Record<string, string> = {
    emergency: 'emergency_alerts',
    pet_health: 'pet_health_reminders',
    campaign: 'campaign_updates',
    booking: 'booking_and_payments',
    payment: 'booking_and_payments',
    membership: 'membership',
    video: 'videos_and_news',
    post: 'videos_and_news',
    promotional: 'promotional_updates',
    certificate: 'membership',
    account: 'membership',
  };
  return map[category] || 'campaign_updates';
}

export const firebaseProvider = new FirebaseProvider();
