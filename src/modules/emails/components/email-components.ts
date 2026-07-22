export interface EmailButtonOptions {
  text: string;
  link: string;
  primaryColor?: string;
  textColor?: string;
}

export function emailButton(options: EmailButtonOptions): string {
  const primaryColor = options.primaryColor || '#1a6b3c';
  const textColor = options.textColor || '#ffffff';
  
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;">
            <tr>
              <td align="center" bgcolor="${primaryColor}" style="border-radius: 8px;">
                <a href="${options.link}" target="_blank" style="display: inline-block; padding: 12px 28px; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: ${textColor}; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px;">
                  ${options.text}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export function emailInfoRow(label: string, value: string): string {
  return `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 10px 16px; font-family: Arial, sans-serif; font-size: 13px; color: #64748b; font-weight: 500; width: 40%; vertical-align: top; text-align: left;">
        ${label}
      </td>
      <td style="padding: 10px 16px; font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; font-weight: 600; vertical-align: top; text-align: left;">
        ${value}
      </td>
    </tr>
  `;
}

export interface EmailAlertBoxOptions {
  title?: string;
  message: string;
  type?: 'success' | 'warning' | 'danger' | 'info';
}

export function emailAlertBox(options: EmailAlertBoxOptions): string {
  const type = options.type || 'info';
  let bgColor = '#eff6ff';
  let borderColor = '#3b82f6';
  let textColor = '#1e3a8a';
  
  if (type === 'success') {
    bgColor = '#f0fdf4';
    borderColor = '#22c55e';
    textColor = '#14532d';
  } else if (type === 'warning') {
    bgColor = '#fffbeb';
    borderColor = '#f59e0b';
    textColor = '#78350f';
  } else if (type === 'danger') {
    bgColor = '#fef2f2';
    borderColor = '#ef4444';
    textColor = '#7f1d1d';
  }
  
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 4px;">
      <tr>
        <td style="padding: 16px;">
          ${options.title ? `<div style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: ${textColor}; margin-bottom: 6px;">${options.title}</div>` : ''}
          <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; color: ${textColor};">
            ${options.message}
          </div>
        </td>
      </tr>
    </table>
  `;
}

export interface EmailStatusBadgeOptions {
  text: string;
  type?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function emailStatusBadge(options: EmailStatusBadgeOptions): string {
  const type = options.type || 'neutral';
  let bgColor = '#f1f5f9';
  let textColor = '#475569';
  
  if (type === 'success') {
    bgColor = '#dcfce7';
    textColor = '#15803d';
  } else if (type === 'warning') {
    bgColor = '#fef3c7';
    textColor = '#b45309';
  } else if (type === 'danger') {
    bgColor = '#fee2e2';
    textColor = '#b91c1c';
  } else if (type === 'info') {
    bgColor = '#dbeafe';
    textColor = '#1d4ed8';
  }
  
  return `<span style="display: inline-block; padding: 4px 10px; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: ${textColor}; background-color: ${bgColor}; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">${options.text}</span>`;
}

export function emailDivider(): string {
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="border-top: 1px solid #e2e8f0; height: 1px; line-height: 1px; font-size: 1px;">&nbsp;</td>
      </tr>
    </table>
  `;
}
