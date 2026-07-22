import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';

const FONT_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Regular.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansBengali-Bold.ttf');
const HIND_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Regular.ttf');
const HIND_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf');

export function registerFonts(doc: PDFKit.PDFDocument) {
  const candidates = [
    {
      label: 'Hind Siliguri',
      regularName: 'BPA-HindSiliguri',
      boldName: 'BPA-HindSiliguri-Bold',
      regularPath: HIND_REGULAR_PATH,
      boldPath: HIND_BOLD_PATH,
    },
    {
      label: 'Noto Sans Bengali',
      regularName: 'BPA-NotoSansBengali',
      boldName: 'BPA-NotoSansBengali-Bold',
      regularPath: FONT_REGULAR_PATH,
      boldPath: FONT_BOLD_PATH,
    },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.regularPath) && fs.existsSync(candidate.boldPath)) {
      try {
        doc.registerFont(candidate.regularName, candidate.regularPath);
        doc.registerFont(candidate.boldName, candidate.boldPath);
        return { regular: candidate.regularName, bold: candidate.boldName };
      } catch (err) {
        console.warn(`[guide-pdf] ${candidate.label} registration failed:`, err);
      }
    }
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

function isBangladesh(purchase: any): boolean {
  const phone = purchase.memberMobile || '';
  const startsWithBd = phone.startsWith('+880') || phone.startsWith('880') || phone.startsWith('01');
  const hasLocation = !!(purchase.divisionId || purchase.districtId || purchase.upazilaId || purchase.cityCorporationId);
  return startsWithBd || hasLocation;
}

export function drawMembershipGuideContent(
  doc: PDFKit.PDFDocument,
  purchase: any,
  fonts: { regular: string; bold: string },
  isBd: boolean
) {
  const pageW = doc.page.width;
  const left = 38;
  const right = pageW - 38;
  const width = right - left;

  const sections = [
    {
      titleEn: 'A. What is this card?',
      titleBn: 'ক. কার্ডটি কী?',
      points: [
        {
          en: 'This is a service benefit card.',
          bn: 'এটি একটি সেবা সুবিধা কার্ড।'
        },
        {
          en: 'It is not ownership, equity, investment, profit-sharing, dividend, or financial return.',
          bn: 'এটি কোনো মালিকানা, ইকুইটি, বিনিয়োগ, মুনাফা-অংশীদারিত্ব, লভ্যাংশ বা আর্থিক রিটার্ন নয়।'
        },
        {
          en: 'Benefits depend on BPA program policy, partner availability, and operational capacity.',
          bn: 'সেবাসমূহ বিপিএ প্রোগ্রাম পলিসি, পার্টনারের প্রাপ্যতা এবং কর্মক্ষমতার উপর নির্ভর করে।'
        }
      ]
    },
    {
      titleEn: 'B. Validity',
      titleBn: 'খ. মেয়াদকাল',
      points: [
        {
          en: `Valid for 5 years from issue date, based on tier validityMonths (${purchase.tier.validityMonths} months).`,
          bn: `ইস্যুর তারিখ থেকে ৫ বছর বা টিয়ার মেয়াদ (${purchase.tier.validityMonths} মাস) অনুযায়ী সক্রিয় থাকবে।`
        },
        {
          en: 'Renewal/upgrade may be required after expiry.',
          bn: 'মেয়াদ শেষ হওয়ার পর নবায়ন বা আপগ্রেড করার প্রয়োজন হতে পারে।'
        }
      ]
    },
    {
      titleEn: 'C. Pet coverage',
      titleBn: 'গ. পোষা প্রাণীর কাভারেজ',
      points: [
        {
          en: `Tier pet coverage: up to ${purchase.petLimit} pets.`,
          bn: `টিয়ার অনুযায়ী পোষা প্রাণীর কাভারেজ: সর্বোচ্চ ${purchase.petLimit}টি পোষা প্রাণী পর্যন্ত।`
        },
        {
          en: 'Extra pets require upgrade or separate service policy.',
          bn: 'অতিরিক্ত পোষা প্রাণীর জন্য আপগ্রেড বা আলাদা পলিসি লাগবে।'
        }
      ]
    },
    {
      titleEn: 'D. How to use',
      titleBn: 'ঘ. কীভাবে ব্যবহার করবেন',
      points: [
        {
          en: 'Save the PDF/card on mobile.',
          bn: 'পিডিএফ বা কার্ডটি মোবাইলে সংরক্ষণ করুন।'
        },
        {
          en: 'Show QR/card number/registered mobile at BPA or partner clinic.',
          bn: 'বিপিএ বা পার্টনার ক্লিনিকে কিউআর/কার্ড নম্বর/নিবন্ধিত মোবাইল দেখান।'
        },
        {
          en: 'Clinic verifies the card.',
          bn: 'ক্লিনিক কার্ডটি যাচাই করবে।'
        },
        {
          en: 'Eligible benefits/discounts are applied according to policy.',
          bn: 'নিয়ম অনুযায়ী প্রযোজ্য ছাড় ও সুবিধা প্রদান করা হবে।'
        },
        {
          en: 'Use membership lookup if card is lost.',
          bn: 'কার্ড হারিয়ে গেলে মেম্বারশিপ লুকআপ ব্যবহার করুন।'
        }
      ]
    },
    {
      titleEn: 'E. Benefits',
      titleBn: 'ঙ. সুবিধাসমূহ',
      points: [
        { en: 'Priority services where available', bn: 'প্রযোজ্য ক্ষেত্রে অগ্রাধিকার সেবা।' },
        { en: 'Partner discounts where applicable', bn: 'প্রযোজ্য ক্ষেত্রে পার্টনার ডিসকাউন্ট।' },
        { en: 'Cross-branch service where available', bn: 'ক্রস-ব্রাঞ্চ সেবা সুবিধা।' },
        { en: 'Community care support', bn: 'কমিউনিটি কেয়ার সহায়তা।' },
        { en: 'Social impact contribution', bn: 'সামাজিক উন্নয়ন ও সেবায় অংশীদারিত্ব।' }
      ]
    },
    {
      titleEn: 'F. Limitations',
      titleBn: 'চ. সীমাবদ্ধতা',
      points: [
        {
          en: 'Discounts may not apply to every service.',
          bn: 'সব সেবায় ডিসকাউন্ট প্রযোজ্য নাও হতে পারে।'
        },
        {
          en: 'Medicine, diagnostics, emergency items, surgery, consumables, and third-party lab services may have separate terms.',
          bn: 'ওষুধ, ডায়াগনস্টিকস, জরুরি আইটেম, সার্জারি, কনজ্যুমেবলস এবং থার্ড-পার্টি ল্যাব সার্ভিসের জন্য আলাদা শর্ত প্রযোজ্য।'
        },
        {
          en: 'Partner benefits are subject to availability and partner rules.',
          bn: 'পার্টনার সুবিধা পার্টনারের প্রাপ্যতা ও নিয়মের ওপর নির্ভরশীল।'
        }
      ]
    },
    {
      titleEn: 'G. Preferred clinic zone',
      titleBn: 'ছ. পছন্দের ক্লিনিক জোন',
      points: [
        {
          en: 'Preferred zone helps BPA plan clinic demand.',
          bn: 'পছন্দের জোন বিপিএ-কে ক্লিনিকের চাহিদা নির্ধারণে সহায়তা করে।'
        },
        {
          en: 'It does not guarantee immediate branch establishment.',
          bn: 'এটি তাৎক্ষণিকভাবে শাখা প্রতিষ্ঠার নিশ্চয়তা দেয় না।'
        },
        {
          en: 'Clinic establishment depends on sufficient demand and BPA operational planning.',
          bn: 'শাখা প্রতিষ্ঠা পর্যাপ্ত সদস্য চাহিদা এবং বিপিএ-এর পরিচালনা পরিকল্পনার ওপর নির্ভর করে।'
        }
      ]
    },
    {
      titleEn: 'H. Transfer and misuse',
      titleBn: 'জ. হস্তান্তর এবং অপব্যবহার',
      points: [
        {
          en: 'Card is non-transferable.',
          bn: 'কার্ডটি হস্তান্তরযোগ্য নয়।'
        },
        {
          en: 'Fake, duplicate, altered, or misused card may be suspended.',
          bn: 'নকল, সদৃশ, পরিবর্তিত বা অপব্যবহৃত কার্ড স্থগিত করা হতে পারে।'
        },
        {
          en: 'BPA may verify identity before service.',
          bn: 'সেবা প্রদানের পূর্বে বিপিএ পরিচয় যাচাই করতে পারে।'
        }
      ]
    },
    {
      titleEn: 'I. Refund/cancellation',
      titleBn: 'ঝ. রিফান্ড ও বাতিলকরণ',
      points: [
        {
          en: 'Activated membership is generally non-refundable.',
          bn: 'সক্রিয় মেম্বারশিপ সাধারণত অফেরতযোগ্য।'
        },
        {
          en: 'Duplicate payment or technical error can be reviewed.',
          bn: 'দ্বৈত পেমেন্ট বা টেকনিক্যাল ত্রুটি পর্যালোচনা করা যেতে পারে।'
        },
        {
          en: 'Refund decision follows BPA policy.',
          bn: 'রিফান্ড সংক্রান্ত সিদ্ধান্ত বিপিএ নীতি অনুসরণ করে।'
        }
      ]
    },
    {
      titleEn: 'J. Communication',
      titleBn: 'ঞ. যোগাযোগ ও নোটিফিকেশন',
      points: [
        {
          en: 'User must keep mobile/email active.',
          bn: 'ব্যবহারকারীকে অবশ্যই মোবাইল/ইমেইল সচল রাখতে হবে।'
        },
        {
          en: 'BPA may send SMS/email updates.',
          bn: 'বিপিএ এসএমএস বা ইমেইলের মাধ্যমে আপডেট পাঠাতে পারে।'
        },
        {
          en: 'Wrong contact information may delay support.',
          bn: 'ভুল যোগাযোগ তথ্যের কারণে সেবা বা সহায়তা পেতে বিলম্ব হতে পারে।'
        }
      ]
    }
  ];

  doc.font(fonts.bold).fontSize(14).fillColor('#0f2d59').text(isBd ? 'সদস্য নির্দেশিকা / Membership Guide' : 'Membership Rules & Guide', left);
  doc.y += 5;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.y += 10;

  for (const sec of sections) {
    // Check page space. If too low, add page.
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
      doc.rect(0, 0, pageW, 7).fill('#0f2d59');
      doc.y = 35;
    }

    const titleText = isBd ? `${sec.titleEn} / ${sec.titleBn}` : sec.titleEn;
    doc.font(fonts.bold).fontSize(9.5).fillColor('#0f2d59').text(titleText, left);
    doc.y += 4;

    for (const pt of sec.points) {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, pageW, 7).fill('#0f2d59');
        doc.y = 35;
      }
      
      const pointY = doc.y;
      doc.circle(left + 6, pointY + 5, 2).fill('#16a34a');
      
      const enText = pt.en;
      const bnText = pt.bn;
      
      doc.font(fonts.regular).fontSize(7.5).fillColor('#1e293b');
      doc.text(enText, left + 14, pointY, { width: width - 15, lineGap: 1.1 });
      doc.font(fonts.regular).fontSize(7).fillColor('#64748b');
      doc.text(bnText, left + 14, doc.y + 1, { width: width - 15, lineGap: 1.1 });
      doc.y += 5;
    }
    doc.y += 6;
  }

  // Final Disclaimer Section
  if (doc.y > doc.page.height - 120) {
    doc.addPage();
    doc.rect(0, 0, pageW, 7).fill('#0f2d59');
    doc.y = 35;
  }

  const legalTitle = isBd ? 'K. Final disclaimer / ট. চূড়ান্ত সতর্কীকরণ (ডিসক্লেইমার)' : 'K. Final disclaimer';
  const disclaimerTextEn = "BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return. Service discounts and third-party benefits are subject to availability and partner terms. Clinic zone establishment is subject to sufficient member demand and BPA operational planning.";
  const disclaimerTextBn = "বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড শুধুমাত্র একটি সেবা সুবিধা কার্ড। এটি কোনো মালিকানা, ইকুইটি, মুনাফা-অংশীদারিত্ব, বিনিয়োগ বা আর্থিক রিটার্ন নির্দেশ করে না। সেবামূলক ডিসকাউন্ট এবং তৃতীয় পক্ষের সুবিধাসমূহ প্রাপ্যতা এবং পার্টনারদের শর্তাবলীর ওপর নির্ভরশীল। ক্লিনিক জোন প্রতিষ্ঠা পর্যাপ্ত সদস্য চাহিদা এবং বিপিএ পরিচালনা পরিকল্পনার ওপর নির্ভরশীল।";

  const boxY = doc.y + 10;
  const legalHeight = doc.heightOfString(disclaimerTextEn, { width: width - 20, lineGap: 1.1 }) + 
                       doc.heightOfString(disclaimerTextBn, { width: width - 20, lineGap: 1.1 }) + 32;

  doc.roundedRect(left, boxY, width, legalHeight, 4).fillAndStroke('#fffbeb', '#fde68a');
  doc.font(fonts.bold).fontSize(8.5).fillColor('#b45309').text(legalTitle, left + 10, boxY + 8);
  doc.font(fonts.regular).fontSize(7.5).fillColor('#78350f').text(disclaimerTextEn, left + 10, doc.y + 4, { width: width - 20, lineGap: 1.1 });
  doc.font(fonts.regular).fontSize(7).fillColor('#92400e').text(disclaimerTextBn, left + 10, doc.y + 3, { width: width - 20, lineGap: 1.1 });
  
  doc.y = boxY + legalHeight + 15;
}

export async function streamMembershipGuidePdf(purchase: any, res: Response): Promise<void> {
  const isBd = isBangladesh(purchase);
  const doc = new PDFDocument({ size: 'A4', margin: 38, autoFirstPage: true });
  doc.pipe(res);

  const fonts = registerFonts(doc);

  // Top header bar
  doc.rect(0, 0, doc.page.width, 7).fill('#0f2d59');
  doc.y = 35;

  drawMembershipGuideContent(doc, purchase, fonts, isBd);

  // Footer on last page
  const pageW = doc.page.width;
  const left = 38;
  const width = pageW - left * 2;
  doc.font(fonts.regular).fontSize(7).fillColor('#94a3b8').text(`Bangladesh Pet Association | Reference ID: ${purchase.id}`, left, doc.page.height - 30, { align: 'center', width });

  doc.end();
}
