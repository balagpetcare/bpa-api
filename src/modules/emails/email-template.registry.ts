import { 
  emailButton, 
  emailInfoRow, 
  emailAlertBox, 
  emailStatusBadge
} from './components/email-components';

export interface EmailTemplateResult {
  subject: string;
  previewText: string;
  bodyHtml: string;
  plainText: string;
}

export const EmailTemplateRegistry = {
  GENERAL_NOTIFICATION: (data: {
    title: string;
    message: string;
    actionText?: string;
    actionUrl?: string;
  }): EmailTemplateResult => {
    const actionButton = data.actionText && data.actionUrl 
      ? emailButton({ text: data.actionText, link: data.actionUrl }) 
      : '';
      
    return {
      subject: data.title,
      previewText: data.message.substring(0, 150),
      bodyHtml: `
        <h2 style="color: #1e293b; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">${data.title}</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.6;">${data.message}</p>
        ${actionButton}
      `,
      plainText: `${data.title}\n\n${data.message}${data.actionUrl ? `\n\nLink: ${data.actionUrl}` : ''}`
    };
  },

  PAYMENT_SUCCESS: (data: {
    name: string;
    amount: string;
    txId: string;
    bookingNumber: string;
    date: string;
  }): EmailTemplateResult => {
    const subject = `Payment Confirmed: ${data.bookingNumber}`;
    const previewText = `We successfully received your payment of ${data.amount}.`;
    
    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1a6b3c; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Payment Confirmed</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Dear ${data.name},</p>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">We have received your payment for your booking reference <strong>${data.bookingNumber}</strong>.</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
          <tr bgcolor="#f8fafc">
            <td colspan="2" style="padding: 12px 16px; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">PAYMENT DETAILS</td>
          </tr>
          ${emailInfoRow('Booking Ref', data.bookingNumber)}
          ${emailInfoRow('Transaction ID', data.txId)}
          ${emailInfoRow('Amount Paid', `<span style="color: #1a6b3c; font-weight: bold;">${data.amount}</span>`)}
          ${emailInfoRow('Payment Date', data.date)}
        </table>
        
        ${emailAlertBox({
          message: 'Your booking has been updated to paid status. Please keep this information for your records.',
          type: 'success'
        })}
      `,
      plainText: `Payment Confirmed\n\nDear ${data.name},\nWe have received your payment of ${data.amount} for booking ${data.bookingNumber}.\nTransaction ID: ${data.txId}\nDate: ${data.date}`
    };
  },

  PAYMENT_FAILED: (data: {
    name: string;
    amount: string;
    bookingNumber: string;
    reason?: string;
    retryUrl?: string;
  }): EmailTemplateResult => {
    const subject = `Payment Failed: ${data.bookingNumber}`;
    const previewText = `Your payment of ${data.amount} for booking ${data.bookingNumber} could not be processed.`;
    const actionButton = data.retryUrl 
      ? emailButton({ text: 'Retry Payment', link: data.retryUrl, primaryColor: '#ef4444' }) 
      : '';

    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #ef4444; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Payment Failed</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Dear ${data.name},</p>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">We were unable to process your payment of <strong>${data.amount}</strong> for booking reference <strong>${data.bookingNumber}</strong>.</p>
        
        ${emailAlertBox({
          title: 'Transaction Details',
          message: `Reason: ${data.reason || 'Declined by the payment gateway.'}`,
          type: 'danger'
        })}
        
        <p style="margin: 20px 0; color: #475569; font-size: 15px;">Please try initiating the payment again using the button below or contact your payment provider.</p>
        ${actionButton}
      `,
      plainText: `Payment Failed\n\nDear ${data.name},\nYour payment of ${data.amount} for booking ${data.bookingNumber} failed.\nReason: ${data.reason || 'Declined by gateway.'}${data.retryUrl ? `\nRetry here: ${data.retryUrl}` : ''}`
    };
  },

  BOOKING_CONFIRMATION: (data: {
    ownerName: string;
    bookingNumber: string;
    campaignTitle: string;
    sessionDate: string;
    sessionTime: string;
    venueName: string;
    petCount: number;
    totalAmount: string;
    isFree: boolean;
  }): EmailTemplateResult => {
    const subject = `Booking Confirmed: ${data.bookingNumber} — ${data.campaignTitle}`;
    const previewText = `Your booking for ${data.campaignTitle} has been confirmed.`;
    
    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1a3c5e; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Booking Confirmed</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Dear ${data.ownerName},</p>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Your booking for <strong>${data.campaignTitle}</strong> has been successfully confirmed.</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
          <tr bgcolor="#f8fafc">
            <td colspan="2" style="padding: 12px 16px; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">BOOKING &amp; CAMPAIGN DETAILS</td>
          </tr>
          ${emailInfoRow('Booking Number', data.bookingNumber)}
          ${emailInfoRow('Campaign', data.campaignTitle)}
          ${emailInfoRow('Session Date', data.sessionDate)}
          ${emailInfoRow('Session Time', data.sessionTime)}
          ${emailInfoRow('Venue', data.venueName)}
          ${emailInfoRow('Registered Pets', String(data.petCount))}
          ${emailInfoRow('Total Amount', data.isFree ? 'Free' : '৳' + data.totalAmount)}
        </table>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 16px;">Please bring your pets and this booking reference number on the day of the campaign.</p>
      `,
      plainText: `Booking Confirmed!\n\nDear ${data.ownerName},\nYour booking for ${data.campaignTitle} is confirmed.\nBooking Number: ${data.bookingNumber}\nDate: ${data.sessionDate}\nTime: ${data.sessionTime}\nVenue: ${data.venueName}\nPets: ${data.petCount}\nAmount: ${data.isFree ? 'Free' : '৳' + data.totalAmount}`
    };
  },

  MEMBERSHIP_SUCCESS: (data: {
    name: string;
    membershipNumber: string;
    type: string;
    expiryDate: string;
    portalUrl?: string;
  }): EmailTemplateResult => {
    const subject = `Welcome to BPA: Membership Verified — ${data.membershipNumber}`;
    const previewText = `Your membership to Bangladesh Pet Association has been successfully verified.`;
    const actionButton = data.portalUrl 
      ? emailButton({ text: 'Access Member Portal', link: data.portalUrl }) 
      : '';

    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1a6b3c; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Membership Verified</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Dear ${data.name},</p>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Congratulations! Your application for membership with the <strong>Bangladesh Pet Association</strong> has been verified and approved.</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
          <tr bgcolor="#f8fafc">
            <td colspan="2" style="padding: 12px 16px; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">MEMBERSHIP INFO</td>
          </tr>
          ${emailInfoRow('Member Name', data.name)}
          ${emailInfoRow('Membership Number', data.membershipNumber)}
          ${emailInfoRow('Membership Type', data.type)}
          ${emailInfoRow('Expiry Date', data.expiryDate)}
          ${emailInfoRow('Status', emailStatusBadge({ text: 'ACTIVE', type: 'success' }))}
        </table>
        
        <p style="margin: 20px 0; color: #475569; font-size: 15px;">You can now log in to the BPA portal to access your member ID card, register for campaigns at discounted rates, and view upcoming pet care programs.</p>
        ${actionButton}
      `,
      plainText: `Membership Verified\n\nDear ${data.name},\nYour membership is active!\nMembership ID: ${data.membershipNumber}\nType: ${data.type}\nExpires: ${data.expiryDate}`
    };
  },

  DONATION_RECEIPT: (data: {
    donorName: string;
    referenceNo: string;
    amount: string;
    campaignTitle?: string | null;
    purposeTitle?: string | null;
    paidAt: Date;
    gatewayTransactionId?: string | null;
    receiptUrl: string;
  }): EmailTemplateResult => {
    const dateStr = new Date(data.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const subject = `Donation Receipt — ${data.referenceNo} | Bangladesh Pet Association`;
    const previewText = `Thank you for your donation of ${data.amount} to Bangladesh Pet Association.`;
    
    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1a6b3c; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Official Donation Receipt</h2>
        <p style="margin: 0 0 20px 0; color: #333; font-size: 15px;">Dear ${data.donorName},</p>
        <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;">
          Thank you for your generous donation to BPA. Your contribution directly supports animal welfare programs across Bangladesh.
        </p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
          <tr bgcolor="#f8fafc">
            <td colspan="2" style="padding: 12px 16px; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">RECEIPT DETAILS</td>
          </tr>
          ${emailInfoRow('Reference No', `<span style="font-family: monospace; font-weight: bold;">${data.referenceNo}</span>`)}
          ${emailInfoRow('Date Paid', dateStr)}
          ${emailInfoRow('Amount', `<span style="font-weight: bold; color: #1a6b3c; font-size: 16px;">${data.amount}</span>`)}
          ${data.campaignTitle ? emailInfoRow('Campaign', data.campaignTitle) : ''}
          ${data.purposeTitle ? emailInfoRow('Purpose', data.purposeTitle) : ''}
          ${data.gatewayTransactionId ? emailInfoRow('Gateway Txn Ref', data.gatewayTransactionId) : ''}
        </table>
        
        ${emailButton({ text: 'View & Download Receipt', link: data.receiptUrl })}
      `,
      plainText: `Donation Receipt\n\nDear ${data.donorName},\nThank you for your donation of ${data.amount}.\nReference: ${data.referenceNo}\nDate: ${dateStr}\nDownload receipt: ${data.receiptUrl}`
    };
  },

  PASSWORD_RESET: (data: {
    name: string;
    resetLink: string;
  }): EmailTemplateResult => {
    const subject = 'Password Reset Request';
    const previewText = 'Click the button inside to reset your password. This link expires in 1 hour.';
    
    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1e293b; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 20px;">Password Reset Request</h2>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">Dear ${data.name},</p>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">We received a request to reset your password for your Bangladesh Pet Association account.</p>
        
        ${emailButton({ text: 'Reset Password', link: data.resetLink, primaryColor: '#1a3c5e' })}
        
        <p style="margin: 20px 0; color: #64748b; font-size: 13px; line-height: 1.5;">
          If the button above does not work, copy and paste the following link into your web browser:
          <br>
          <a href="${data.resetLink}" style="color: #1a3c5e; word-break: break-all;">${data.resetLink}</a>
        </p>
        
        ${emailAlertBox({
          message: 'If you did not request a password reset, please ignore this email. Your password will remain secure and the link will expire in 1 hour.',
          type: 'warning'
        })}
      `,
      plainText: `Password Reset Request\n\nDear ${data.name},\nUse the link below to reset your password. It expires in 1 hour.\nReset Link: ${data.resetLink}`
    };
  },

  ADMIN_NOTIFICATION: (data: {
    title: string;
    details: string;
    actionText?: string;
    actionUrl?: string;
  }): EmailTemplateResult => {
    const subject = `[Admin Alert] ${data.title}`;
    const previewText = data.details.substring(0, 150);
    const actionButton = data.actionText && data.actionUrl 
      ? emailButton({ text: data.actionText, link: data.actionUrl, primaryColor: '#475569' }) 
      : '';

    return {
      subject,
      previewText,
      bodyHtml: `
        <h2 style="color: #1e293b; margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 18px;">Admin System Alert</h2>
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background-color: #f8fafc; font-family: Arial, sans-serif;">
          <h3 style="color: #0f172a; margin: 0 0 12px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">${data.title}</h3>
          <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${data.details}</p>
        </div>
        ${actionButton}
      `,
      plainText: `Admin Notification: ${data.title}\n\nDetails:\n${data.details}`
    };
  }
};
