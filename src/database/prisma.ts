import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ─── Centralized Activity Event Interceptor Middleware ───────────

prisma.$use(async (params, next) => {
  const result = await next(params);
  
  try {
    if (params.model !== 'ActivityEvent' && result) {
      handlePrismaEvent(params, result).catch((err) => {
        console.error('[PrismaActivityHook] Event logging failed:', err);
      });
    }
  } catch (e) {
    // Swallowed to prevent db operations from breaking core logic
  }

  return result;
});

async function handlePrismaEvent(params: any, result: any) {
  const { model, action } = params;

  // 1. Contact Inquiry Submission
  if (model === 'ContactInquiry' && action === 'create') {
    await logActivity({
      type: 'CONTACT_FORM_SUBMITTED',
      module: 'CONTACT_INQUIRY',
      action: 'CREATE',
      entityType: 'ContactInquiry',
      entityId: result.id,
      title: `Contact Inquiry: ${result.subject || 'New Subject'}`,
      metadata: { name: result.name, email: result.email },
    });
  }

  // 2. Donation events
  if (model === 'Donation') {
    if (action === 'create') {
      await logActivity({
        type: 'DONATION_STARTED',
        module: 'DONATION',
        action: 'CREATE',
        entityType: 'Donation',
        entityId: result.id,
        title: `Donation Started: ৳${Number(result.amount)}`,
        metadata: { donorName: result.donorName, referenceNo: result.referenceNo },
      });
    } else if (action === 'update' && result.status === 'success') {
      await logActivity({
        type: 'DONATION_PAYMENT_COMPLETED',
        module: 'DONATION',
        action: 'PAYMENT_SUCCESS',
        entityType: 'Donation',
        entityId: result.id,
        title: `Donation Completed: ৳${Number(result.amount)} from ${result.donorName}`,
        metadata: { referenceNo: result.referenceNo },
      });
    }
  }

  // 3. Membership events
  if (model === 'CommunityMembershipPurchase') {
    if (action === 'create') {
      await logActivity({
        type: 'MEMBERSHIP_PURCHASE_STARTED',
        module: 'MEMBERSHIP',
        action: 'CREATE',
        entityType: 'CommunityMembershipPurchase',
        entityId: result.id,
        title: `Membership Purchase Initiated: ৳${Number(result.amountBdt)}`,
        metadata: { memberName: result.memberName },
      });
    } else if (action === 'update' && result.status === 'paid') {
      await logActivity({
        type: 'MEMBERSHIP_PAYMENT_COMPLETED',
        module: 'MEMBERSHIP',
        action: 'PAYMENT_SUCCESS',
        entityType: 'CommunityMembershipPurchase',
        entityId: result.id,
        title: `Membership Payment Completed: ৳${Number(result.amountBdt)} for ${result.memberName}`,
        metadata: { memberMobile: result.memberMobile },
      });
    }
  }

  // 4. Campaign Registration events
  if (model === 'CampaignRegistration') {
    if (action === 'create') {
      await logActivity({
        type: 'CAMPAIGN_REGISTER_STARTED',
        module: 'CAMPAIGN',
        action: 'CREATE',
        entityType: 'CampaignRegistration',
        entityId: result.id,
        title: `Campaign Registration Started: ৳${Number(result.totalAmountBdt)}`,
        metadata: { bookingNumber: result.bookingNumber },
      });
    } else if (action === 'update' && result.status === 'confirmed') {
      await logActivity({
        type: 'CAMPAIGN_REGISTRATION_COMPLETED',
        module: 'CAMPAIGN',
        action: 'PAYMENT_SUCCESS',
        entityType: 'CampaignRegistration',
        entityId: result.id,
        title: `Campaign Registration Confirmed: ৳${Number(result.totalAmountBdt)}`,
        metadata: { bookingNumber: result.bookingNumber },
      });
    }
  }

  // 5. Pet Census submission
  if (model === 'PetCensusSubmission' && action === 'create') {
    await logActivity({
      type: 'PET_CENSUS_STARTED',
      module: 'PET_CENSUS',
      action: 'CREATE',
      entityType: 'PetCensusSubmission',
      entityId: result.id,
      title: `Pet Census Submitted by ${result.ownerName}`,
      metadata: { status: result.status },
    });
  }

  // 6. Payment Failures
  if (model === 'Payment' && action === 'update' && result.status === 'failed') {
    await logActivity({
      type: 'PAYMENT_FAILED',
      module: 'PAYMENT',
      action: 'FAIL',
      entityType: 'Payment',
      entityId: result.id,
      title: `Payment Failed: ৳${Number(result.amount)}`,
      metadata: { gateway: result.gateway },
    });
  }

  // 7. SMS Failures
  if (model === 'SmsLog' && action === 'update' && result.status === 'failed') {
    await logActivity({
      type: 'SMS_FAILED',
      module: 'SMS',
      action: 'FAIL',
      entityType: 'SmsLog',
      entityId: result.id,
      title: `SMS Delivery Failed to ${result.recipientMasked || 'recipient'}`,
      metadata: { reason: result.failureReason },
    });
  }
}

async function logActivity(data: any) {
  // Create logging record directly using Prisma Client bypassing middlewares to avoid loops
  await prisma.activityEvent.create({
    data: {
      type: data.type,
      module: data.module,
      action: data.action,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      title: data.title,
      metadata: data.metadata || null,
      createdAt: new Date(),
    },
  }).catch(() => {});
}
