import { prisma } from '../src/database/prisma';
import { initializeDonation, settleDonationPayment, cancelDonationPayment } from '../src/modules/donations/donations.service';

// Mock EPS service config so we don't try to connect to the real gateway
jest.mock('../src/services/eps.service', () => {
  return {
    isEPSConfigured: () => true,
    generateMerchantTxnId: () => `TXN-${Date.now()}`,
    getEPS: () => ({
      initializePayment: jest.fn().mockResolvedValue({
        RedirectURL: 'http://mock-eps.com/pay',
        TransactionId: 'mock-eps-txn-id',
      }),
      verifyPayment: jest.fn().mockResolvedValue({
        Status: 'Success',
        TransactionId: 'mock-eps-txn-id',
      }),
    }),
    initializeEpsPayment: jest.fn().mockResolvedValue({
      RedirectURL: 'http://mock-eps.com/pay',
      TransactionId: 'mock-eps-txn-id',
    }),
  };
});

describe('Donation Payment Callbacks', () => {
  let paymentId: string = '';
  let donationId: string = '';

  beforeAll(async () => {
    // Make sure we have a clean db or handle the test records
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should initialize a donation and create pending records', async () => {
    const result = await initializeDonation({
      amount: 500,
      donorName: 'Test Donor',
      donorEmail: 'test@example.com',
      donorPhone: '01711000000',
    });

    expect(result.referenceNo).toMatch(/^BPA-DON-/);
    expect(result.paymentUrl).toBe('http://mock-eps.com/pay');

    const donation = await prisma.donation.findUnique({
      where: { referenceNo: result.referenceNo },
      include: { payment: true },
    });

    expect(donation).toBeDefined();
    expect(donation?.status).toBe('pending');
    expect(donation?.payment?.status).toBe('pending');
    expect(donation?.payment?.purpose).toBe('donation');

    if (donation && donation.payment) {
      paymentId = donation.payment.id;
      donationId = donation.id;
    }
  });

  it('should settle donation payment successfully', async () => {
    if (!paymentId) return;
    await settleDonationPayment(paymentId);

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { payment: true },
    });

    expect(donation?.status).toBe('success');
    expect(donation?.paidAt).toBeDefined();
  });

  it('should cancel a pending donation', async () => {
    const result = await initializeDonation({
      amount: 1000,
      donorName: 'Cancel Test',
      donorEmail: 'cancel@example.com',
      donorPhone: '01711000000',
    });

    const donation = await prisma.donation.findUnique({
      where: { referenceNo: result.referenceNo },
    });

    if (donation && donation.paymentId) {
      await cancelDonationPayment(donation.paymentId);
      
      const cancelledDonation = await prisma.donation.findUnique({
        where: { id: donation.id },
      });
      
      expect(cancelledDonation?.status).toBe('cancelled');
    }
  });
});

