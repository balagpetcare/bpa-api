import { PrismaClient } from '@prisma/client';

const LEGAL_DISCLAIMER =
  'This Care Partner Card is a contribution recognition and community service benefit card only. ' +
  'It does not represent ownership, equity, profit-sharing, or any form of investment in BPA or any clinic. ' +
  'Discounts on products, medicines, food, accessories, or any third-party costs are not guaranteed. ' +
  'Benefits are subject to availability and BPA policy at the time of service.';

const COMMUNITY_ZONES = [
  { name: 'Zone 1 – Uttara & Turag', nameBn: 'জোন ১ – উত্তরা ও তুরাগ', slug: 'zone-1-uttara-turag', description: 'Covering Uttara, Turag, and surrounding areas of northern Dhaka.', sortOrder: 1, priorityOrder: 1 },
  { name: 'Zone 2 – Mirpur & Pallabi', nameBn: 'জোন ২ – মিরপুর ও পল্লবী', slug: 'zone-2-mirpur-pallabi', description: 'Covering Mirpur, Pallabi, Kafrul, and Shah Ali areas.', sortOrder: 2, priorityOrder: 2 },
  { name: 'Zone 3 – Mohammadpur & Adabor', nameBn: 'জোন ৩ – মোহাম্মদপুর ও আদাবর', slug: 'zone-3-mohammadpur-adabor', description: 'Covering Mohammadpur, Adabor, Sher-e-Bangla Nagar, and Shyamoli areas.', sortOrder: 3, priorityOrder: 3 },
  { name: 'Zone 4 – Gulshan & Banani', nameBn: 'জোন ৪ – গুলশান ও বনানী', slug: 'zone-4-gulshan-banani', description: 'Covering Gulshan, Banani, Baridhara, and Niketon areas.', sortOrder: 4, priorityOrder: 4 },
  { name: 'Zone 5 – Dhanmondi & Kalabagan', nameBn: 'জোন ৫ – ধানমন্ডি ও কলাবাগান', slug: 'zone-5-dhanmondi-kalabagan', description: 'Covering Dhanmondi, Kalabagan, Hazaribagh, and Lalbagh areas.', sortOrder: 5, priorityOrder: 5 },
  { name: 'Zone 6 – Rampura & Badda', nameBn: 'জোন ৬ – রামপুরা ও বাড্ডা', slug: 'zone-6-rampura-badda', description: 'Covering Rampura, Badda, Khilgaon, and Bashabo areas.', sortOrder: 6, priorityOrder: 6 },
  { name: 'Zone 7 – Motijheel & Wari', nameBn: 'জোন ৭ – মতিঝিল ও ওয়ারী', slug: 'zone-7-motijheel-wari', description: 'Covering Motijheel, Wari, Sutrapur, and Kotwali areas.', sortOrder: 7, priorityOrder: 7 },
  { name: 'Zone 8 – Demra & Shyampur', nameBn: 'জোন ৮ – ডেমরা ও শ্যামপুর', slug: 'zone-8-demra-shyampur', description: 'Covering Demra, Shyampur, Kadamtali, and Jatrabari areas.', sortOrder: 8, priorityOrder: 8 },
];

const SERVICES = [
  { nameEn: 'General Checkup', nameBn: 'সাধারণ চেকআপ', category: 'HEALTH_CHECKUP' as const, basePriceBdt: 500 },
  { nameEn: 'Vaccination', nameBn: 'টিকা', category: 'VACCINATION' as const, basePriceBdt: 800 },
  { nameEn: 'Deworming', nameBn: 'কৃমিনাশক', category: 'DEWORMING' as const, basePriceBdt: 300 },
  { nameEn: 'Microchipping', nameBn: 'মাইক্রোচিপিং', category: 'MICROCHIP' as const, basePriceBdt: 1000 },
  { nameEn: 'Blood Test', nameBn: 'রক্ত পরীক্ষা', category: 'LAB_TEST' as const, basePriceBdt: 1200 },
  { nameEn: 'X-Ray', nameBn: 'এক্স-রে', category: 'IMAGING' as const, basePriceBdt: 1500 },
  { nameEn: 'Ultrasound', nameBn: 'আল্ট্রাসাউন্ড', category: 'IMAGING' as const, basePriceBdt: 2000 },
  { nameEn: 'Surgery', nameBn: 'অপারেশন', category: 'SURGERY' as const, basePriceBdt: 5000 },
  { nameEn: 'Grooming', nameBn: 'গ্রুমিং', category: 'GROOMING' as const, basePriceBdt: 600 },
  { nameEn: 'Emergency Care', nameBn: 'জরুরি সেবা', category: 'EMERGENCY' as const, basePriceBdt: 3000 },
];

const PRIMARY_BENEFITS = [
  { titleEn: 'Digital BPA Community Care Partner Card', titleBn: 'ডিজিটাল বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড', icon: 'mdi:card-account-details' },
  { titleEn: 'QR Code Verification', titleBn: 'কিউআর কোড ভেরিফিকেশন', icon: 'mdi:qrcode' },
  { titleEn: 'Preferred Clinic Zone Vote', titleBn: 'পছন্দের ক্লিনিক জোন ভোট', icon: 'mdi:vote-outline' },
  { titleEn: 'Partner Clinic Service Discounts', titleBn: 'পার্টনার ক্লিনিক সেবা ডিসকাউন্ট', icon: 'mdi:percent' },
  { titleEn: '5-Year Card Validity', titleBn: '৫ বছর কার্ড বৈধতা', icon: 'mdi:calendar-check' },
];

const PREMIUM_BENEFITS = [
  { titleEn: 'Higher Service Discount', titleBn: 'উচ্চতর সেবা ডিসকাউন্ট', icon: 'mdi:sale' },
  { titleEn: 'Priority Service Support', titleBn: 'অগ্রাধিকার সেবা সহায়তা', icon: 'mdi:headphones' },
  { titleEn: 'Coverage for Up to 10 Pets', titleBn: '১০টি পোষা প্রাণী পর্যন্ত কভারেজ', icon: 'mdi:paw' },
  { titleEn: 'Preferred Clinic/Branch Priority', titleBn: 'পছন্দের ক্লিনিক/শাখা অগ্রাধিকার', icon: 'mdi:hospital-box' },
];

const ENTERPRISE_BENEFITS = [
  { titleEn: 'Highest Service Discount', titleBn: 'সর্বোচ্চ সেবা ডিসকাউন্ট', icon: 'mdi:sale' },
  { titleEn: 'Multi-Pet/Family/Shelter Support', titleBn: 'একাধিক পোষা/পরিবার/শেল্টার সমর্থন', icon: 'mdi:home-heart' },
  { titleEn: 'Priority Branch Service', titleBn: 'অগ্রাধিকার শাখা সেবা', icon: 'mdi:star' },
  { titleEn: 'Extended Pet Coverage', titleBn: 'বর্ধিত পোষা প্রাণী কভারেজ', icon: 'mdi:shield-check' },
];

const DOCUMENTS = [
  {
    documentType: 'terms_and_conditions', version: 1,
    titleEn: 'Terms & Conditions', titleBn: 'শর্তাবলী',
    contentEn: '1. This membership is non-transferable.\n2. Benefits are subject to availability at BPA-partnered clinics.\n3. BPA reserves the right to modify benefits with prior notice.\n4. Membership fees are non-refundable except as per the refund policy.',
    contentBn: '১. এই সদস্যপদ হস্তান্তরযোগ্য নয়।\n২. সুবিধাগুলি বিপিএ-এর অংশীদার ক্লিনিকগুলিতে প্রাপ্যতা সাপেক্ষে।\n৩. বিপিএ পূর্ব বিজ্ঞপ্তি সহ সুবিধা পরিবর্তনের অধিকার রাখে।\n৪. ফেরত নীতি অনুযায়ী ছাড়া সদস্যপদ ফি ফেরতযোগ্য নয়।',
  },
  {
    documentType: 'refund_policy', version: 1,
    titleEn: 'Refund Policy', titleBn: 'ফেরত নীতি',
    contentEn: 'Membership fees are refundable within 14 days of purchase if no benefits have been utilized. After 14 days, no refund shall be provided.',
    contentBn: 'কোনো সুবিধা ব্যবহার না করা হলে ক্রয়ের ১৪ দিনের মধ্যে সদস্যপদ ফি ফেরতযোগ্য। ১৪ দিন পর কোন ফেরত প্রদান করা হবে না।',
  },
  {
    documentType: 'service_availability_policy', version: 1,
    titleEn: 'Service Availability Policy', titleBn: 'পরিষেবার প্রাপ্যতা নীতি',
    contentEn: 'Services are provided at BPA-partnered veterinary clinics. Availability varies by location and clinic capacity.',
    contentBn: 'পরিষেবাগুলি বিপিএ-এর অংশীদার ভেটেরিনারি ক্লিনিকে প্রদান করা হয়। অবস্থান এবং ক্লিনিক সক্ষমতা অনুযায়ী প্রাপ্যতা পরিবর্তিত হয়।',
  },
  {
    documentType: 'discount_policy', version: 1,
    titleEn: 'Discount Policy', titleBn: 'ডিসকাউন্ট নীতি',
    contentEn: 'Tier-based discounts apply to listed services at partner clinics. Discounts cannot be combined with other offers.',
    contentBn: 'টিয়ার-ভিত্তিক ডিসকাউন্ট অংশীদার ক্লিনিকগুলিতে তালিকাভুক্ত ভাষা বা পরিষেবাগুলিতে প্রযোজ্য।',
  },
  {
    documentType: 'welcome_letter', version: 1,
    titleEn: 'Welcome to BPA Community Care', titleBn: 'বিপিএ কমিউনিটি কেয়ারে স্বাগতম',
    contentEn: 'Dear Member,\n\nWelcome to the BPA Community Care Partnership Program! Your membership helps us provide better veterinary care for pets across Bangladesh.\n\n— BPA Team',
    contentBn: 'প্রিয় সদস্য,\n\nবিপিএ কমিউনিটি কেয়ার পার্টনারশিপ প্রোগ্রামে স্বাগতম! আপনার সদস্যপদ বাংলাদেশ জুড়ে পোষা প্রাণীদের জন্য আরও ভাল সেবা প্রদানে সহায়তা করে।\n\n— বিপিএ টিম',
  },
];

const DIAGNOSTIC_SERVICES = [
  { titleEn: 'Complete Blood Count (CBC)', titleBn: 'কমপ্লিট ব্লাড কাউন্ট (সিবিসি)', category: 'LAB' as const, descriptionEn: 'Full blood panel including red cells, white cells, and platelets.', descriptionBn: 'লোহিত কণিকা, শ্বেত কণিকা ও প্লেটলেট সহ সম্পূর্ণ রক্ত পরীক্ষা।', icon: 'mdi:blood-bag', sortOrder: 1 },
  { titleEn: 'Blood Chemistry Panel', titleBn: 'ব্লাড কেমিস্ট্রি প্যানেল', category: 'LAB' as const, descriptionEn: 'Liver function, kidney function, glucose, and electrolyte analysis.', descriptionBn: 'লিভার, কিডনি, গ্লুকোজ ও ইলেক্ট্রোলাইট পরীক্ষা।', icon: 'mdi:test-tube', sortOrder: 2 },
  { titleEn: 'Urinalysis', titleBn: 'প্রস্রাব পরীক্ষা', category: 'LAB' as const, descriptionEn: 'Urine analysis for infection, crystals, and kidney health markers.', descriptionBn: 'সংক্রমণ, ক্রিস্টাল ও কিডনি স্বাস্থ্য সূচকের জন্য প্রস্রাব বিশ্লেষণ।', icon: 'mdi:flask', sortOrder: 3 },
  { titleEn: 'Fecal Examination', titleBn: 'মলমূত্র পরীক্ষা', category: 'LAB' as const, descriptionEn: 'Stool test to detect parasites, worm eggs, and intestinal infections.', descriptionBn: 'পরজীবী, কৃমির ডিম ও অন্ত্রের সংক্রমণ সনাক্তের জন্য মল পরীক্ষা।', icon: 'mdi:microscope', sortOrder: 4 },
  { titleEn: 'Thyroid Function Test (T4)', titleBn: 'থাইরয়েড ফাংশন টেস্ট (T4)', category: 'LAB' as const, descriptionEn: 'Thyroid hormone level check — important for cats and senior dogs.', descriptionBn: 'থাইরয়েড হরমোন স্তর পরীক্ষা — বিড়াল ও বয়স্ক কুকুরের জন্য গুরুত্বপূর্ণ।', icon: 'mdi:dna', sortOrder: 5 },
  { titleEn: 'FIV / FeLV Rapid Test', titleBn: 'FIV/FeLV র‍্যাপিড টেস্ট', category: 'LAB' as const, descriptionEn: 'Rapid test for Feline Immunodeficiency Virus and Feline Leukemia Virus.', descriptionBn: 'বিড়ালের ইমিউনোডিফিসিয়েন্সি ভাইরাস ও লিউকেমিয়া ভাইরাসের দ্রুত পরীক্ষা।', icon: 'mdi:virus', sortOrder: 6 },
  { titleEn: 'Parvovirus Rapid Test', titleBn: 'পারভোভাইরাস র‍্যাপিড টেস্ট', category: 'LAB' as const, descriptionEn: 'Quick diagnosis of canine parvovirus from fecal sample.', descriptionBn: 'মলের নমুনা থেকে কুকুরের পারভোভাইরাসের দ্রুত নির্ণয়।', icon: 'mdi:virus-outline', sortOrder: 7 },
  { titleEn: 'Digital X-Ray', titleBn: 'ডিজিটাল এক্স-রে', category: 'IMAGING' as const, descriptionEn: 'Digital radiography for bones, chest, and abdominal organs.', descriptionBn: 'হাড়, বুক ও পেটের অঙ্গের জন্য ডিজিটাল রেডিওগ্রাফি।', icon: 'mdi:radiology-box-outline', sortOrder: 8 },
  { titleEn: 'Ultrasound (Abdomen)', titleBn: 'আল্ট্রাসাউন্ড (পেট)', category: 'IMAGING' as const, descriptionEn: 'Abdominal ultrasound for liver, spleen, bladder, and reproductive organs.', descriptionBn: 'লিভার, প্লীহা, মূত্রথলি ও প্রজনন অঙ্গের আল্ট্রাসাউন্ড।', icon: 'mdi:ultrasound', sortOrder: 9 },
  { titleEn: 'Echocardiography', titleBn: 'ইকোকার্ডিওগ্রাফি', category: 'IMAGING' as const, descriptionEn: 'Cardiac ultrasound to evaluate heart structure and function.', descriptionBn: 'হার্টের গঠন ও কার্যকারিতা মূল্যায়নের জন্য কার্ডিয়াক আল্ট্রাসাউন্ড।', icon: 'mdi:heart-pulse', sortOrder: 10 },
  { titleEn: 'Orthopedic Consultation', titleBn: 'অর্থোপেডিক পরামর্শ', category: 'SPECIALIST' as const, descriptionEn: 'Specialist evaluation for joint, bone, and musculoskeletal issues.', descriptionBn: 'জয়েন্ট, হাড় ও পেশীতন্ত্রের সমস্যার জন্য বিশেষজ্ঞ মূল্যায়ন।', icon: 'mdi:bone', sortOrder: 11 },
  { titleEn: 'Dermatology Consultation', titleBn: 'ডার্মাটোলজি পরামর্শ', category: 'SPECIALIST' as const, descriptionEn: 'Skin disease diagnosis including allergies, infections, and coat conditions.', descriptionBn: 'অ্যালার্জি, সংক্রমণ ও লোমের সমস্যা সহ চর্মরোগ নির্ণয়।', icon: 'mdi:emoticon-poop', sortOrder: 12 },
  { titleEn: 'Dental Examination & Scaling', titleBn: 'দাঁত পরীক্ষা ও স্কেলিং', category: 'SPECIALIST' as const, descriptionEn: 'Oral health check and professional teeth cleaning under sedation.', descriptionBn: 'মৌখিক স্বাস্থ্য পরীক্ষা এবং সেডেশনের অধীনে পেশাদার দাঁত পরিষ্কার।', icon: 'mdi:tooth-outline', sortOrder: 13 },
  { titleEn: 'Emergency Triage & Stabilisation', titleBn: 'জরুরি ট্রিয়াজ ও স্থিতিশীলকরণ', category: 'EMERGENCY' as const, descriptionEn: 'Immediate assessment and stabilisation for critical or injured animals.', descriptionBn: 'সংকটজনক বা আহত প্রাণীর জন্য তাৎক্ষণিক মূল্যায়ন ও স্থিতিশীলকরণ।', icon: 'mdi:ambulance', sortOrder: 14 },
  { titleEn: '24/7 Emergency Care', titleBn: '২৪/৭ জরুরি সেবা', category: 'EMERGENCY' as const, descriptionEn: 'Round-the-clock emergency veterinary care for life-threatening conditions.', descriptionBn: 'জীবন-হুমকির পরিস্থিতির জন্য সার্বক্ষণিক জরুরি ভেটেরিনারি সেবা।', icon: 'mdi:hospital-box', sortOrder: 15 },
  { titleEn: 'DNA / Breed Profiling', titleBn: 'ডিএনএ / ব্রিড প্রোফাইলিং', category: 'FUTURE_TECH' as const, descriptionEn: 'Genetic breed identification and inherited disease screening (coming soon).', descriptionBn: 'জেনেটিক ব্রিড সনাক্তকরণ ও বংশগত রোগ স্ক্রিনিং (শীঘ্রই আসছে)।', icon: 'mdi:dna', sortOrder: 16 },
];

const CARE_PARTNER_BENEFITS = [
  { titleEn: 'Priority Service at BPA Community Clinics', titleBn: 'বিপিএ কমিউনিটি ক্লিনিকে অগ্রাধিকার সেবা', category: 'SERVICE' as const, icon: 'mdi:hospital-building', descriptionEn: 'Fast-track access to veterinary services at all BPA-partnered community clinics.', descriptionBn: 'সব বিপিএ-অংশীদার কমিউনিটি ক্লিনিকে ভেটেরিনারি সেবায় দ্রুত প্রবেশাধিকার।', sortOrder: 1 },
  { titleEn: 'Free General Health Checkup (Annual)', titleBn: 'বিনামূল্যে বার্ষিক স্বাস্থ্য পরীক্ষা', category: 'SERVICE' as const, icon: 'mdi:stethoscope', descriptionEn: 'One free general health checkup per registered pet per year.', descriptionBn: 'প্রতি বছর প্রতিটি নিবন্ধিত পোষা প্রাণীর জন্য একটি বিনামূল্যে সাধারণ স্বাস্থ্য পরীক্ষা।', sortOrder: 2 },
  { titleEn: 'Discount on Veterinary Consultations', titleBn: 'ভেটেরিনারি পরামর্শে ছাড়', category: 'DISCOUNT' as const, icon: 'mdi:percent', descriptionEn: 'Flat percentage discount on consultation fees at partner clinics.', descriptionBn: 'অংশীদার ক্লিনিকে পরামর্শ ফিতে নির্দিষ্ট শতাংশ ছাড়।', sortOrder: 3 },
  { titleEn: 'Discount on Vaccines & Medicines', titleBn: 'টিকা ও ওষুধে ছাড়', category: 'DISCOUNT' as const, icon: 'mdi:needle', descriptionEn: 'Preferential pricing on all routine vaccinations and prescribed medicines.', descriptionBn: 'সব নিয়মিত টিকা ও প্রেসক্রাইবড ওষুধে অগ্রাধিকারমূলক মূল্য নির্ধারণ।', sortOrder: 4 },
  { titleEn: 'Discount on Diagnostic Tests', titleBn: 'ডায়াগনস্টিক পরীক্ষায় ছাড়', category: 'DIAGNOSTIC' as const, icon: 'mdi:test-tube', descriptionEn: 'Discounted rates on blood tests, imaging, and other laboratory services.', descriptionBn: 'রক্ত পরীক্ষা, ইমেজিং ও অন্যান্য ল্যাবরেটরি সেবায় ছাড়কৃত মূল্য।', sortOrder: 5 },
  { titleEn: 'Digital BPA Care Partner Card', titleBn: 'ডিজিটাল বিপিএ কেয়ার পার্টনার কার্ড', category: 'DIGITAL' as const, icon: 'mdi:card-account-details', descriptionEn: 'A digital card with QR code that proves your Care Partner status at any clinic.', descriptionBn: 'QR কোড সহ একটি ডিজিটাল কার্ড যা যেকোনো ক্লিনিকে কেয়ার পার্টনার স্ট্যাটাস প্রমাণ করে।', sortOrder: 6 },
  { titleEn: 'BPA Member Portal Access', titleBn: 'বিপিএ সদস্য পোর্টাল অ্যাক্সেস', category: 'DIGITAL' as const, icon: 'mdi:account-circle-outline', descriptionEn: 'Access to your personal dashboard with pet records, vaccination history, and reports.', descriptionBn: 'পোষা প্রাণীর রেকর্ড, টিকার ইতিহাস ও রিপোর্ট সহ ব্যক্তিগত ড্যাশবোর্ডে প্রবেশাধিকার।', sortOrder: 7 },
  { titleEn: 'Founding Clinic Zone Vote', titleBn: 'প্রতিষ্ঠাতা ক্লিনিক জোন ভোট', category: 'WELFARE' as const, icon: 'mdi:vote', descriptionEn: 'Vote on which Dhaka zone gets the first BPA Community Clinic.', descriptionBn: 'কোন ঢাকা জোনে প্রথম বিপিএ কমিউনিটি ক্লিনিক হবে তা ভোট দিন।', sortOrder: 8 },
  { titleEn: 'Annual Transparency Report', titleBn: 'বার্ষিক স্বচ্ছতা রিপোর্ট', category: 'WELFARE' as const, icon: 'mdi:file-chart-outline', descriptionEn: 'Annual report showing how contributions have been utilised for community pet care.', descriptionBn: 'কমিউনিটি পোষা প্রাণী সেবায় অবদান কীভাবে ব্যবহার করা হয়েছে তা দেখানো বার্ষিক রিপোর্ট।', sortOrder: 9 },
  { titleEn: 'Recognition as Founding Care Partner', titleBn: 'প্রতিষ্ঠাতা কেয়ার পার্টনার হিসেবে স্বীকৃতি', category: 'MEMBERSHIP' as const, icon: 'mdi:star-circle-outline', descriptionEn: 'Your name listed as a founding contributor in BPA Community Clinic dedication records.', descriptionBn: 'বিপিএ কমিউনিটি ক্লিনিক উৎসর্গ রেকর্ডে প্রতিষ্ঠাতা অবদানকারী হিসেবে আপনার নাম।', sortOrder: 10 },
  { titleEn: 'Future Platform Benefits', titleBn: 'ভবিষ্যত প্ল্যাটফর্ম সুবিধা', category: 'FUTURE' as const, icon: 'mdi:rocket-launch-outline', descriptionEn: 'All future BPA platform benefits, programs, and features automatically included.', descriptionBn: 'সমস্ত ভবিষ্যত বিপিএ প্ল্যাটফর্ম সুবিধা, প্রোগ্রাম এবং ফিচার স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত।', sortOrder: 11 },
];

const SOCIAL_IMPACT = [
  { titleEn: 'Stray Animal Medical Treatment', titleBn: 'পথ-প্রাণীর চিকিৎসা কর্মসূচি', impactType: 'STRAY_TREATMENT' as const, icon: 'mdi:paw', descriptionEn: 'Free medical treatment for injured and sick stray dogs and cats in Dhaka city.', descriptionBn: 'ঢাকা শহরের আহত ও অসুস্থ পথ-কুকুর ও বিড়ালের বিনামূল্যে চিকিৎসা।', sortOrder: 1 },
  { titleEn: 'Community Feeding Programme', titleBn: 'কমিউনিটি খাদ্য সহায়তা কর্মসূচি', impactType: 'FEEDING' as const, icon: 'mdi:bowl-mix-outline', descriptionEn: 'Regular feeding stations for stray animals across Dhaka, managed by BPA volunteers.', descriptionBn: 'বিপিএ স্বেচ্ছাসেবকদের দ্বারা পরিচালিত ঢাকা জুড়ে পথ-প্রাণীর জন্য নিয়মিত খাদ্য কেন্দ্র।', sortOrder: 2 },
  { titleEn: 'Mass Vaccination Drive', titleBn: 'গণ টিকাদান অভিযান', impactType: 'VACCINATION' as const, icon: 'mdi:needle', descriptionEn: 'Large-scale subsidised vaccination campaigns for pets in low-income communities.', descriptionBn: 'নিম্ন-আয়ের সম্প্রদায়ে পোষা প্রাণীদের জন্য বড় আকারের ভর্তুকিযুক্ত টিকাদান প্রচারণা।', sortOrder: 3 },
  { titleEn: 'Animal Rescue & Rehabilitation', titleBn: 'প্রাণী উদ্ধার ও পুনর্বাসন', impactType: 'RESCUE' as const, icon: 'mdi:dog-service', descriptionEn: 'Emergency rescue and short-term rehabilitation for abused or abandoned pets.', descriptionBn: 'নির্যাতিত বা পরিত্যক্ত পোষা প্রাণীর জন্য জরুরি উদ্ধার ও স্বল্পমেয়াদী পুনর্বাসন।', sortOrder: 4 },
  { titleEn: 'Temporary Shelter Support', titleBn: 'অস্থায়ী আশ্রয় সহায়তা', impactType: 'SHELTER' as const, icon: 'mdi:home-heart', descriptionEn: 'Support for partner shelters providing temporary housing for rescued animals.', descriptionBn: 'উদ্ধারকৃত প্রাণীদের অস্থায়ী আবাসন প্রদানকারী অংশীদার আশ্রয়ের সহায়তা।', sortOrder: 5 },
  { titleEn: 'Low-Income Family Pet Care Support', titleBn: 'নিম্ন-আয়ী পরিবারের পোষা প্রাণী সেবা সহায়তা', impactType: 'LOW_INCOME_SUPPORT' as const, icon: 'mdi:hand-heart-outline', descriptionEn: 'Subsidised or free veterinary care for pets owned by low-income families.', descriptionBn: 'নিম্ন-আয়ের পরিবারের পোষা প্রাণীর জন্য ভর্তুকিযুক্ত বা বিনামূল্যে ভেটেরিনারি সেবা।', sortOrder: 6 },
  { titleEn: 'Pet Welfare Education', titleBn: 'পোষা প্রাণী কল্যাণ শিক্ষা', impactType: 'EDUCATION' as const, icon: 'mdi:school-outline', descriptionEn: 'Community workshops, school programmes, and online resources on responsible pet ownership.', descriptionBn: 'দায়িত্বশীল পোষা প্রাণী পালন সম্পর্কে কমিউনিটি কর্মশালা, স্কুল প্রোগ্রাম ও অনলাইন সম্পদ।', sortOrder: 7 },
];

const ROADMAP = [
  { phase: 'Phase 1', year: 2026, titleEn: 'Launch BPA Community Care Partner Card', titleBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড চালু', status: 'IN_PROGRESS' as const, descriptionEn: 'Online registration and digital card issuance for founding Care Partners across Dhaka.', descriptionBn: 'ঢাকা জুড়ে প্রতিষ্ঠাতা কেয়ার পার্টনারদের জন্য অনলাইন নিবন্ধন ও ডিজিটাল কার্ড ইস্যু।', sortOrder: 1 },
  { phase: 'Phase 1', year: 2026, titleEn: 'Pet Census 2026 — Dhaka Household Survey', titleBn: 'পেট সেনসাস ২০২৬ — ঢাকা পরিবার জরিপ', status: 'IN_PROGRESS' as const, descriptionEn: 'First-ever structured census of pets in Dhaka to guide clinic placement and resource allocation.', descriptionBn: 'ক্লিনিক স্থাপন ও সম্পদ বরাদ্দ নির্দেশিকা তৈরির জন্য ঢাকায় পোষা প্রাণীর প্রথম কাঠামোগত আদমশুমারি।', sortOrder: 2 },
  { phase: 'Phase 2', year: 2026, titleEn: 'Establish First BPA Community Clinic (Pilot Zone)', titleBn: 'প্রথম বিপিএ কমিউনিটি ক্লিনিক স্থাপন (পাইলট জোন)', status: 'PLANNED' as const, descriptionEn: 'Open the first BPA Community 24/7 Pet Clinic in the zone with highest member demand.', descriptionBn: 'সর্বোচ্চ সদস্য চাহিদার জোনে প্রথম বিপিএ কমিউনিটি ২৪/৭ পেট ক্লিনিক খোলা।', sortOrder: 3 },
  { phase: 'Phase 2', year: 2026, titleEn: 'Partner Clinic Network — Discount Integration', titleBn: 'পার্টনার ক্লিনিক নেটওয়ার্ক — ডিসকাউন্ট ইন্টিগ্রেশন', status: 'PLANNED' as const, descriptionEn: 'On-board existing veterinary clinics as partner clinics offering Care Partner card discounts.', descriptionBn: 'বিদ্যমান ভেটেরিনারি ক্লিনিকগুলিকে কেয়ার পার্টনার কার্ড ছাড় প্রদানকারী পার্টনার ক্লিনিক হিসেবে যুক্ত করা।', sortOrder: 4 },
  { phase: 'Phase 3', year: 2027, titleEn: 'Expand to 3 Additional Clinic Zones', titleBn: 'আরও ৩টি ক্লিনিক জোনে সম্প্রসারণ', status: 'PLANNED' as const, descriptionEn: 'Scale the community clinic model to three more Dhaka zones based on census data and member demand.', descriptionBn: 'আদমশুমারি তথ্য ও সদস্য চাহিদার উপর ভিত্তি করে ঢাকার আরও তিনটি জোনে কমিউনিটি ক্লিনিক মডেল সম্প্রসারণ।', sortOrder: 5 },
  { phase: 'Phase 3', year: 2027, titleEn: 'Pet Smart Solution Platform Integration', titleBn: 'পেট স্মার্ট সলিউশন প্ল্যাটফর্ম ইন্টিগ্রেশন', status: 'PLANNED' as const, descriptionEn: 'Full integration with Pet Smart Solution for advanced pet health tracking and smart clinic management.', descriptionBn: 'উন্নত পোষা প্রাণী স্বাস্থ্য ট্র্যাকিং ও স্মার্ট ক্লিনিক ব্যবস্থাপনার জন্য পেট স্মার্ট সলিউশনের সাথে সম্পূর্ণ ইন্টিগ্রেশন।', sortOrder: 6 },
  { phase: 'Phase 4', year: 2028, titleEn: 'All 8 Dhaka Zones — Full Clinic Coverage', titleBn: 'সব ৮টি ঢাকা জোন — সম্পূর্ণ ক্লিনিক কভারেজ', status: 'PLANNED' as const, descriptionEn: 'Complete the BPA Community Clinic network across all 8 defined zones of Dhaka city.', descriptionBn: 'ঢাকা শহরের সমস্ত ৮টি নির্ধারিত জোন জুড়ে বিপিএ কমিউনিটি ক্লিনিক নেটওয়ার্ক সম্পূর্ণ করা।', sortOrder: 7 },
];

export async function seedCommunity(prisma: PrismaClient) {
  const counts = {
    zones: 0, contributionPlan: 0,
    membershipProgram: 0, tiers: 0, services: 0, discounts: 0, benefits: 0, documents: 0,
    membershipCampaigns: 0, membershipPlans: 0,
    diagnosticServices: 0, carePartnerBenefits: 0, socialImpact: 0, roadmap: 0,
  };

  // ── 1. Community Zones ────────────────────────────────────────────────────
  for (const zone of COMMUNITY_ZONES) {
    await prisma.communityZone.upsert({
      where: { slug: zone.slug },
      update: { name: zone.name, nameBn: zone.nameBn, description: zone.description },
      create: {
        ...zone,
        city: 'Dhaka', district: 'Dhaka District', division: 'Dhaka',
        targetContributors: 10000, currentContributors: 0,
        targetAmountBdt: 30000000, currentAmountBdt: 0,
        status: 'active', isActive: true, publicVisible: true,
      },
    });
    counts.zones++;
  }

  // ── 2. Contribution Plan ──────────────────────────────────────────────────
  await prisma.contributionPlan.upsert({
    where: { slug: 'standard-care-partner-3000' },
    update: {},
    create: {
      title: 'Standard Care Partner',
      slug: 'standard-care-partner-3000',
      contributionType: 'care_partner',
      amountBdt: 3000, currency: 'BDT',
      description: 'Contribute ৳3,000 to support the establishment of BPA Community 24/7 Pet Clinics in Dhaka.',
      benefitsSummaryJson: [
        'Priority service access at BPA Community Pet Clinics (subject to availability)',
        'Digital Care Partner Card with QR verification',
        'Recognition as a founding Care Partner of BPA Community Pet Clinics',
        'Annual transparency report on fund utilisation',
      ],
      legalDisclaimerText: LEGAL_DISCLAIMER,
      isActive: true, sortOrder: 0,
    },
  });
  counts.contributionPlan++;

  // ── 3. Membership Program ─────────────────────────────────────────────────
  await prisma.communityMembershipProgram.upsert({
    where: { id: 'default' },
    update: {
      nameEn: 'BPA Community Care Partner Card Program',
      nameBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রাম',
      cardValidityLabel: '5-Year Card Validity',
      legalDisclaimer: 'BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return.',
    },
    create: {
      id: 'default',
      nameEn: 'BPA Community Care Partner Card Program',
      nameBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রাম',
      slug: 'community-care-partner-card',
      descriptionEn: 'Join BPA Community Care Partner Card Program and get exclusive benefits for your pets.',
      descriptionBn: 'বিপিএ কমিউনিটি কেয়ার পার্টনার কার্ড প্রোগ্রামে যোগ দিন এবং আপনার পোষা প্রাণীর জন্য এক্সক্লুসিভ সুবিধা পান।',
      offerStartAt: new Date('2026-01-01'),
      offerEndAt: new Date('2027-12-31'),
      priceAfterOffer: 'USE_REGULAR_PRICE',
      offerBannerEn: 'Founding Member Offer — Limited Time!',
      offerBannerBn: 'প্রতিষ্ঠাতা সদস্য অফার — সীমিত সময়!',
      cardValidityLabel: '5-Year Card Validity',
      legalDisclaimer: 'BPA Community Care Partner Card is a service benefit card only. It does not represent ownership, equity, profit-sharing, investment, or financial return.',
      isActive: true,
    },
  });
  counts.membershipProgram++;

  // ── 4. Membership Tiers ───────────────────────────────────────────────────
  const primaryTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'primary' },
    update: {
      code: 'PRIMARY',
      launchPriceBdt: 3000,
      regularPriceBdt: 10000,
      petLimitMin: 1,
      includedPets: 3,
      petLimitMax: 3,
      validityMonths: 60,
      version: 1,
      status: 'active',
      isActive: true,
      sortOrder: 1,
    },
    create: {
      code: 'PRIMARY',
      nameEn: 'Primary Card', nameBn: 'প্রাইমারি কার্ড', slug: 'primary',
      launchPriceBdt: 3000, regularPriceBdt: 10000,
      petLimitMin: 1, includedPets: 3, petLimitMax: 3, validityMonths: 60,
      badgeTextEn: 'Best Value', badgeTextBn: 'সেরা মূল্য',
      shortDescEn: 'Essential care for up to 3 pets with core benefits and service discounts.',
      shortDescBn: '৩টি পোষা প্রাণীর জন্য প্রয়োজনীয় যত্ন ও পরিষেবা ছাড়।',
      fullDescEn: 'The Primary Card is perfect for pet owners with up to 3 pets. Enjoy core veterinary services, diagnostics discounts, and digital membership benefits.',
      fullDescBn: 'প্রাইমারি কার্ডটি ৩টি পর্যন্ত পোষা প্রাণীর মালিকদের জন্য উপযুক্ত।',
      cardTheme: 'primary', version: 1, status: 'active', isActive: true, sortOrder: 1,
    },
  });

  const premiumTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'premium' },
    update: {
      code: 'PREMIUM',
      launchPriceBdt: 5000,
      regularPriceBdt: 18000,
      petLimitMin: 1,
      includedPets: 10,
      petLimitMax: 10,
      validityMonths: 60,
      version: 1,
      status: 'active',
      isActive: true,
      sortOrder: 2,
    },
    create: {
      code: 'PREMIUM',
      nameEn: 'Premium Card', nameBn: 'প্রিমিয়াম কার্ড', slug: 'premium',
      launchPriceBdt: 5000, regularPriceBdt: 18000,
      petLimitMin: 1, includedPets: 10, petLimitMax: 10, validityMonths: 60,
      badgeTextEn: 'Most Popular', badgeTextBn: 'সবচেয়ে জনপ্রিয়',
      shortDescEn: 'Extended care for up to 10 pets with premium discounts and priority services.',
      shortDescBn: '১০টি পোষা প্রাণীর জন্য বর্ধিত যত্ন ও প্রিমিয়াম ছাড়।',
      fullDescEn: 'The Premium Card offers comprehensive coverage for households with up to 10 pets. Includes higher service discounts, priority clinic access, and exclusive social impact program participation.',
      fullDescBn: 'প্রিমিয়াম কার্ডটি ১০টি পর্যন্ত পোষা প্রাণীর জন্য ব্যাপক কভারেজ অফার করে।',
      cardTheme: 'premium', version: 1, status: 'active', isActive: true, sortOrder: 2,
    },
  });

  const enterpriseTier = await prisma.communityMembershipTier.upsert({
    where: { slug: 'enterprise' },
    update: {
      code: 'ENTERPRISE',
      launchPriceBdt: 10000,
      regularPriceBdt: 30000,
      petLimitMin: 1,
      includedPets: 20,
      petLimitMax: 50,
      validityMonths: 60,
      version: 1,
      status: 'active',
      isActive: true,
      sortOrder: 3,
    },
    create: {
      code: 'ENTERPRISE',
      nameEn: 'Enterprise Card', nameBn: 'এন্টারপ্রাইজ কার্ড', slug: 'enterprise',
      launchPriceBdt: 10000, regularPriceBdt: 30000,
      petLimitMin: 1, includedPets: 20, petLimitMax: 50, validityMonths: 60,
      badgeTextEn: 'Ultimate Care', badgeTextBn: 'আল্টিমেট কেয়ার',
      shortDescEn: 'Maximum coverage for 20-50 pets with highest discounts and VIP services.',
      shortDescBn: '২০-৫০টি পোষা প্রাণীর জন্য সর্বোচ্চ কভারেজ ও ভিআইপি পরিষেবা।',
      fullDescEn: 'The Enterprise Card is designed for breeders, shelters, and multi-pet households.',
      fullDescBn: 'এন্টারপ্রাইজ কার্ডটি ব্রিডার, শেল্টার এবং বহু-পোষা পরিবারের জন্য ডিজাইন করা হয়েছে।',
      cardTheme: 'enterprise', version: 1, status: 'active', isActive: true, sortOrder: 3,
    },
  });
  counts.tiers = 3;

  // ── 5. Membership Services ────────────────────────────────────────────────
  const serviceIds: Record<string, string> = {};
  for (let i = 0; i < SERVICES.length; i++) {
    const s = SERVICES[i];
    const existing = await prisma.communityMembershipService.findFirst({ where: { nameEn: s.nameEn } });
    if (existing) {
      serviceIds[s.nameEn] = existing.id;
    } else {
      const created = await prisma.communityMembershipService.create({
        data: { ...s, sortOrder: i + 1, isActive: true },
      });
      serviceIds[s.nameEn] = created.id;
      counts.services++;
    }
  }

  // ── 6. Tier Discounts ──────────────────────────────────────────────────────
  const allServices = await prisma.communityMembershipService.findMany({ where: { isActive: true } });
  const discountConfig = [
    { tierId: primaryTier.id, discountType: 'PERCENTAGE' as const, discountValue: 15 },
    { tierId: premiumTier.id, discountType: 'PERCENTAGE' as const, discountValue: 20 },
    { tierId: enterpriseTier.id, discountType: 'PERCENTAGE' as const, discountValue: 25 },
  ];
  for (const svc of allServices) {
    for (const cfg of discountConfig) {
      await prisma.communityTierServiceDiscount.upsert({
        where: { tierId_serviceId: { tierId: cfg.tierId, serviceId: svc.id } },
        update: { discountValue: cfg.discountValue },
        create: { tierId: cfg.tierId, serviceId: svc.id, discountType: cfg.discountType, discountValue: cfg.discountValue, minDiscount: null, maxDiscount: null },
      });
      counts.discounts++;
    }
  }

  // ── 7. Membership Benefits ────────────────────────────────────────────────
  async function upsertBenefit(data: { titleEn: string; titleBn: string; icon: string }) {
    const existing = await prisma.communityMembershipBenefit.findFirst({ where: { titleEn: data.titleEn } });
    if (existing) return existing.id;
    const b = await prisma.communityMembershipBenefit.create({ data: { ...data, sortOrder: 0, isActive: true } });
    counts.benefits++;
    return b.id;
  }
  async function assignBenefit(benefitId: string, tierId: string) {
    await prisma.communityTierBenefitMapping.upsert({
      where: { tierId_benefitId: { tierId, benefitId } },
      update: {}, create: { tierId, benefitId },
    });
  }

  for (const b of PRIMARY_BENEFITS) {
    const id = await upsertBenefit(b);
    await assignBenefit(id, primaryTier.id);
    await assignBenefit(id, premiumTier.id);
    await assignBenefit(id, enterpriseTier.id);
  }
  for (const b of PREMIUM_BENEFITS) {
    const id = await upsertBenefit(b);
    await assignBenefit(id, premiumTier.id);
    await assignBenefit(id, enterpriseTier.id);
  }
  for (const b of ENTERPRISE_BENEFITS) {
    const id = await upsertBenefit(b);
    await assignBenefit(id, enterpriseTier.id);
  }

  // ── 8. Documents ──────────────────────────────────────────────────────────
  for (const doc of DOCUMENTS) {
    const existing = await prisma.communityMembershipDocument.findFirst({
      where: { documentType: doc.documentType, version: doc.version },
    });
    if (!existing) {
      await prisma.communityMembershipDocument.create({ data: { ...doc, isActive: true } });
      counts.documents++;
    }
  }

  // Legacy/community engine remains primary today; seed the new membership
  // campaign architecture alongside it without overwriting production data.
  const membershipCampaign = await prisma.membershipCampaign.upsert({
    where: { slug: 'bpa-membership-2026' },
    update: {
      titleEn: 'BPA Membership Campaign 2026',
      titleBn: 'বিপিএ মেম্বারশিপ ক্যাম্পেইন ২০২৬',
      status: 'published',
      publishedAt: new Date('2026-07-11T00:00:00.000Z'),
    },
    create: {
      slug: 'bpa-membership-2026',
      titleEn: 'BPA Membership Campaign 2026',
      titleBn: 'বিপিএ মেম্বারশিপ ক্যাম্পেইন ২০২৬',
      shortDescriptionEn: 'Flexible pet membership plans with backend-controlled pricing and later clinic-based pet linking.',
      shortDescriptionBn: 'ব্যাকএন্ড-নিয়ন্ত্রিত মূল্য এবং পরবর্তী ক্লিনিক-ভিত্তিক পোষা প্রাণী লিংকিংসহ নমনীয় সদস্যপদ পরিকল্পনা।',
      descriptionEn: 'Join the official BPA membership campaign. Members apply first, then covered pets are permanently linked later at authorized clinics when service is provided.',
      descriptionBn: 'অফিসিয়াল বিপিএ সদস্যপদ ক্যাম্পেইনে যোগ দিন। সদস্য প্রথমে আবেদন করবে, পরে অনুমোদিত ক্লিনিকে সেবা দেওয়ার সময় কভার্ড পোষা প্রাণী স্থায়ীভাবে লিঙ্ক করা হবে।',
      status: 'published',
      offerStartAt: new Date('2026-01-01T00:00:00.000Z'),
      offerEndAt: new Date('2027-12-31T23:59:59.000Z'),
      applicationStartAt: new Date('2026-07-01T00:00:00.000Z'),
      applicationEndAt: new Date('2027-12-31T23:59:59.000Z'),
      publishedAt: new Date('2026-07-11T00:00:00.000Z'),
      eligibilityContentEn: 'Applicants must provide valid owner identity and contact information. Pets are not selected during the application stage.',
      eligibilityContentBn: 'আবেদনকারীদের বৈধ মালিক পরিচয় ও যোগাযোগের তথ্য দিতে হবে। আবেদন পর্যায়ে পোষা প্রাণী নির্বাচন করা হবে না।',
      howItWorksContentEn: 'Apply for a plan, complete payment, receive membership activation, and link pets later at an authorized clinic when services are used.',
      howItWorksContentBn: 'একটি পরিকল্পনার জন্য আবেদন করুন, পেমেন্ট সম্পন্ন করুন, সদস্যপদ সক্রিয় করুন, তারপর সেবা ব্যবহারের সময় অনুমোদিত ক্লিনিকে পরে পোষা প্রাণী লিঙ্ক করুন।',
      termsContentEn: 'Linked pets cannot be removed by members or clinic staff. Replacement is allowed only for deceased or permanently lost pets after approval.',
      termsContentBn: 'লিঙ্ক করা পোষা প্রাণী সদস্য বা ক্লিনিক স্টাফ অপসারণ করতে পারবে না। শুধুমাত্র মৃত বা স্থায়ীভাবে হারিয়ে যাওয়া পোষা প্রাণীর ক্ষেত্রে অনুমোদনের পর প্রতিস্থাপন করা যাবে।',
      refundPolicyEn: 'Refunds follow BPA approval policy and only apply before activation or according to approved exception rules.',
      refundPolicyBn: 'রিফান্ড বিপিএ অনুমোদন নীতিমালা অনুযায়ী এবং শুধুমাত্র অ্যাক্টিভেশনের আগে বা অনুমোদিত ব্যতিক্রমে প্রযোজ্য।',
      organizerNameEn: 'Bangladesh Pet Association',
      organizerNameBn: 'বাংলাদেশ পেট অ্যাসোসিয়েশন',
      supportPhone: '+8801700000000',
      supportEmail: 'support@bdpetassociation.org',
      supportWhatsapp: '+8801700000000',
      supportAddress: 'Dhaka, Bangladesh',
    },
  });
  counts.membershipCampaigns++;

  const membershipPlans = [
    {
      tierId: primaryTier.id,
      tierVersion: 1,
      code: 'PRIMARY',
      nameEn: 'Primary',
      nameBn: 'প্রাইমারি',
      regularPrice: 10000,
      offerPrice: 3000,
      regularPriceSnapshot: 10000,
      campaignPrice: 3000,
      minPetsSnapshot: 1,
      includedPetsSnapshot: 3,
      maxPetsSnapshot: 3,
      maxCoveredPets: 3,
      validityYears: 5,
      validityMonths: 60,
      validityMonthsSnapshot: 60,
      benefitsSnapshot: PRIMARY_BENEFITS.map((benefit) => benefit.titleEn),
      maximumReplacementCount: 1,
      replacementRequiresApproval: true,
      replacementFee: 0,
      sortOrder: 1,
    },
    {
      tierId: premiumTier.id,
      tierVersion: 1,
      code: 'PREMIUM',
      nameEn: 'Premium',
      nameBn: 'প্রিমিয়াম',
      regularPrice: 18000,
      offerPrice: 5000,
      regularPriceSnapshot: 18000,
      campaignPrice: 5000,
      minPetsSnapshot: 1,
      includedPetsSnapshot: 10,
      maxPetsSnapshot: 10,
      maxCoveredPets: 10,
      validityYears: 5,
      validityMonths: 60,
      validityMonthsSnapshot: 60,
      benefitsSnapshot: [...PRIMARY_BENEFITS, ...PREMIUM_BENEFITS].map((benefit) => benefit.titleEn),
      maximumReplacementCount: 2,
      replacementRequiresApproval: true,
      replacementFee: 0,
      sortOrder: 2,
    },
    {
      tierId: enterpriseTier.id,
      tierVersion: 1,
      code: 'ENTERPRISE',
      nameEn: 'Enterprise',
      nameBn: 'এন্টারপ্রাইজ',
      regularPrice: 30000,
      offerPrice: 10000,
      regularPriceSnapshot: 30000,
      campaignPrice: 10000,
      minPetsSnapshot: 1,
      includedPetsSnapshot: 20,
      maxPetsSnapshot: 50,
      maxCoveredPets: 50,
      validityYears: 5,
      validityMonths: 60,
      validityMonthsSnapshot: 60,
      benefitsSnapshot: [...PRIMARY_BENEFITS, ...PREMIUM_BENEFITS, ...ENTERPRISE_BENEFITS].map((benefit) => benefit.titleEn),
      maximumReplacementCount: 5,
      replacementRequiresApproval: true,
      replacementFee: 0,
      sortOrder: 3,
    },
  ];

  for (const plan of membershipPlans) {
    await prisma.membershipPlan.upsert({
      where: { campaignId_code: { campaignId: membershipCampaign.id, code: plan.code } },
      update: {
        tierId: plan.tierId,
        nameEn: plan.nameEn,
        nameBn: plan.nameBn,
        regularPrice: plan.regularPrice,
        offerPrice: plan.offerPrice,
        regularPriceSnapshot: plan.regularPriceSnapshot,
        campaignPrice: plan.campaignPrice,
        minPetsSnapshot: plan.minPetsSnapshot,
        includedPetsSnapshot: plan.includedPetsSnapshot,
        maxPetsSnapshot: plan.maxPetsSnapshot,
        validityMonthsSnapshot: plan.validityMonthsSnapshot,
        benefitsSnapshot: plan.benefitsSnapshot,
        tierVersion: plan.tierVersion,
        maxCoveredPets: plan.maxCoveredPets,
        validityYears: plan.validityYears,
        validityMonths: plan.validityMonths,
        maximumReplacementCount: plan.maximumReplacementCount,
        replacementRequiresApproval: plan.replacementRequiresApproval,
        replacementFee: plan.replacementFee,
        sortOrder: plan.sortOrder,
        isActive: true,
      },
      create: {
        campaignId: membershipCampaign.id,
        tierId: plan.tierId,
        code: plan.code,
        nameEn: plan.nameEn,
        nameBn: plan.nameBn,
        regularPrice: plan.regularPrice,
        offerPrice: plan.offerPrice,
        regularPriceSnapshot: plan.regularPriceSnapshot,
        campaignPrice: plan.campaignPrice,
        minPetsSnapshot: plan.minPetsSnapshot,
        includedPetsSnapshot: plan.includedPetsSnapshot,
        maxPetsSnapshot: plan.maxPetsSnapshot,
        validityMonthsSnapshot: plan.validityMonthsSnapshot,
        benefitsSnapshot: plan.benefitsSnapshot,
        tierVersion: plan.tierVersion,
        maxCoveredPets: plan.maxCoveredPets,
        validityYears: plan.validityYears,
        validityMonths: plan.validityMonths,
        maximumReplacementCount: plan.maximumReplacementCount,
        replacementRequiresApproval: plan.replacementRequiresApproval,
        replacementFee: plan.replacementFee,
        sortOrder: plan.sortOrder,
        isActive: true,
      },
    });
    counts.membershipPlans++;
  }

  const demoMediaFiles = [
    {
      key: 'hero',
      filename: 'bpa-membership-hero.jpg',
      originalName: 'bpa-membership-hero.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 245000,
      url: 'https://placehold.co/1200x600/jpeg?text=BPA+Membership+Hero',
      altText: 'BPA membership hero image',
    },
    {
      key: 'mobile',
      filename: 'bpa-membership-mobile.jpg',
      originalName: 'bpa-membership-mobile.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 145000,
      url: 'https://placehold.co/720x720/jpeg?text=BPA+Membership+Mobile',
      altText: 'BPA membership mobile image',
    },
    {
      key: 'thumbnail',
      filename: 'bpa-membership-thumbnail.jpg',
      originalName: 'bpa-membership-thumbnail.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 86000,
      url: 'https://placehold.co/400x400/jpeg?text=BPA+Membership+Thumb',
      altText: 'BPA membership thumbnail image',
    },
    {
      key: 'video',
      filename: 'bpa-membership-intro.mp4',
      originalName: 'bpa-membership-intro.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1880000,
      url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      altText: 'BPA membership intro video',
    },
    {
      key: 'document',
      filename: 'bpa-membership-terms.pdf',
      originalName: 'bpa-membership-terms.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 56000,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      altText: 'BPA membership terms document',
    },
  ] as const;

  const mediaFileIds: Record<string, string> = {};
  for (const file of demoMediaFiles) {
    const existing = await prisma.mediaFile.findFirst({ where: { url: file.url } });
    const mediaFile = existing ?? await prisma.mediaFile.create({
      data: {
        filename: file.filename,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        url: file.url,
        altText: file.altText,
        uploadedById: null,
      },
    });
    mediaFileIds[file.key] = mediaFile.id;
  }

  const membershipMedia = [
    { role: 'hero', mediaFileId: mediaFileIds.hero, titleEn: 'Hero Banner', titleBn: 'হিরো ব্যানার', altText: 'BPA membership hero image', sortOrder: 1 },
    { role: 'mobile_banner', mediaFileId: mediaFileIds.mobile, titleEn: 'Mobile Banner', titleBn: 'মোবাইল ব্যানার', altText: 'BPA membership mobile image', sortOrder: 2 },
    { role: 'thumbnail', mediaFileId: mediaFileIds.thumbnail, titleEn: 'Thumbnail', titleBn: 'থাম্বনেইল', altText: 'BPA membership thumbnail image', sortOrder: 3 },
    { role: 'gallery', mediaFileId: mediaFileIds.hero, titleEn: 'Campaign Gallery', titleBn: 'ক্যাম্পেইন গ্যালারি', altText: 'Gallery preview', sortOrder: 4 },
    { role: 'video_poster', mediaFileId: mediaFileIds.video, titleEn: 'Intro Video', titleBn: 'ইন্ট্রো ভিডিও', altText: 'Campaign intro video', sortOrder: 5 },
  ] as const;

  for (const item of membershipMedia) {
    const existing = await prisma.membershipMedia.findFirst({
      where: {
        campaignId: membershipCampaign.id,
        role: item.role,
        mediaFileId: item.mediaFileId,
      },
    });
    if (!existing) {
      await prisma.membershipMedia.create({
        data: {
          campaignId: membershipCampaign.id,
          mediaFileId: item.mediaFileId,
          role: item.role as never,
          titleEn: item.titleEn,
          titleBn: item.titleBn,
          altText: item.altText,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }
  }

  const membershipDocuments = [
    { documentType: 'terms_and_conditions', code: 'TNC', titleEn: 'Terms & Conditions', titleBn: 'শর্তাবলি', fileUrl: demoMediaFiles[4].url, mediaFileId: mediaFileIds.document, sortOrder: 1 },
    { documentType: 'refund_policy', code: 'REFUND', titleEn: 'Refund Policy', titleBn: 'রিফান্ড নীতি', fileUrl: demoMediaFiles[4].url, mediaFileId: mediaFileIds.document, sortOrder: 2 },
  ] as const;

  for (const item of membershipDocuments) {
    const existing = await prisma.membershipDocument.findFirst({
      where: {
        campaignId: membershipCampaign.id,
        documentType: item.documentType,
        code: item.code,
      },
    });
    if (!existing) {
      await prisma.membershipDocument.create({
        data: {
          campaignId: membershipCampaign.id,
          mediaFileId: item.mediaFileId,
          documentType: item.documentType,
          code: item.code,
          titleEn: item.titleEn,
          titleBn: item.titleBn,
          fileUrl: item.fileUrl,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }
  }

  // ── 9. Diagnostic Center Services ────────────────────────────────────────
  for (const ds of DIAGNOSTIC_SERVICES) {
    const existing = await prisma.diagnosticCenterService.findFirst({ where: { titleEn: ds.titleEn } });
    if (!existing) {
      await prisma.diagnosticCenterService.create({ data: { ...ds, isActive: true } });
      counts.diagnosticServices++;
    }
  }

  // ── 10. Care Partner Benefits ─────────────────────────────────────────────
  for (const b of CARE_PARTNER_BENEFITS) {
    const existing = await prisma.carePartnerBenefit.findFirst({ where: { titleEn: b.titleEn } });
    if (!existing) {
      await prisma.carePartnerBenefit.create({ data: { ...b, isActive: true } });
      counts.carePartnerBenefits++;
    }
  }

  // ── 11. Social Impact Programs ────────────────────────────────────────────
  for (const sp of SOCIAL_IMPACT) {
    const existing = await prisma.socialImpactProgram.findFirst({ where: { titleEn: sp.titleEn } });
    if (!existing) {
      await prisma.socialImpactProgram.create({ data: { ...sp, isActive: true } });
      counts.socialImpact++;
    }
  }

  // ── 12. Roadmap Items ─────────────────────────────────────────────────────
  for (const ri of ROADMAP) {
    const existing = await prisma.roadmapItem.findFirst({ where: { titleEn: ri.titleEn } });
    if (!existing) {
      await prisma.roadmapItem.create({ data: { ...ri, isActive: true } });
      counts.roadmap++;
    }
  }

  return counts;
}
