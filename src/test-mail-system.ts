import { prisma } from './database/prisma';
import { encryptPassword, decryptPassword, resolveMailServerConfig } from './modules/mail/mail-account.service';
import { addInternalNote, getThreadDetails } from './modules/mail/mail-thread.service';

async function runTests() {
  console.log('========================================================');
  console.log('   BPA MAIL SYSTEM DIAGNOSTICS & FUNCTIONAL TESTS       ');
  console.log('========================================================');

  // Test 1: Password Encryption & Decryption
  console.log('\n[Test 1] Encryption & Decryption...');
  const originalPass = 'SecureCPane1Password!2026';
  const encrypted = encryptPassword(originalPass);
  const decrypted = decryptPassword(encrypted);
  console.log(`  Original:  ${originalPass}`);
  console.log(`  Encrypted: ${encrypted}`);
  console.log(`  Decrypted: ${decrypted}`);
  if (originalPass === decrypted) {
    console.log('  ✓ Encryption/Decryption test passed.');
  } else {
    throw new Error('Encryption/Decryption test failed.');
  }

  // Test 2: Seed Verification
  console.log('\n[Test 2] Seed Verification...');
  const seededAccounts = await prisma.mailAccount.findMany({
    where: { deletedAt: null },
  });
  console.log(`  Found ${seededAccounts.length} seeded accounts in database.`);
  seededAccounts.forEach(acc => {
    console.log(`  - ${acc.emailAddress} (${acc.displayName}): status=${acc.status}, isDefault=${acc.isDefault}, overrides={smtpHost: ${acc.smtpHost}, imapHost: ${acc.imapHost}}`);
  });
  if (seededAccounts.length >= 6) {
    console.log('  ✓ Seed verification test passed.');
  } else {
    throw new Error('Seed verification test failed: expected at least 6 mailboxes.');
  }

  // Test 3: Override config resolver
  console.log('\n[Test 3] Server Configuration Override Resolver...');
  const testAccountNoOverrides = {
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    imapHost: null,
    imapPort: null,
    imapSecure: null,
  };
  const resolvedDefault = resolveMailServerConfig(testAccountNoOverrides);
  console.log('  Resolved Defaults (should match global .env):');
  console.log('   ', JSON.stringify(resolvedDefault));

  const testAccountWithOverrides = {
    smtpHost: 'custom.smtp.com',
    smtpPort: 587,
    smtpSecure: false,
    imapHost: 'custom.imap.com',
    imapPort: 143,
    imapSecure: false,
  };
  const resolvedOverrides = resolveMailServerConfig(testAccountWithOverrides);
  console.log('  Resolved Overrides (should use custom settings):');
  console.log('   ', JSON.stringify(resolvedOverrides));

  if (
    resolvedOverrides.smtpHost === 'custom.smtp.com' &&
    resolvedOverrides.smtpPort === 587 &&
    resolvedOverrides.smtpSecure === false &&
    resolvedOverrides.imapHost === 'custom.imap.com' &&
    resolvedOverrides.imapPort === 143 &&
    resolvedOverrides.imapSecure === false
  ) {
    console.log('  ✓ Configuration override resolver test passed.');
  } else {
    throw new Error('Configuration override resolver test failed.');
  }

  // Test 4: Internal Notes logging & retrieval
  console.log('\n[Test 4] Internal Notes Logging & Retrieval...');
  // Find or create a thread
  let thread = await prisma.mailThread.findFirst();
  if (!thread) {
    thread = await prisma.mailThread.create({
      data: { subject: 'Internal Discussion Test' },
    });
  }
  
  // Find a user to act as author
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('  ⚠ Skipping internal note logging because no User exists in the local database.');
  } else {
    const noteContent = 'This is a private discussion note for BPA administrators.';
    const newNote = await addInternalNote({
      threadId: thread.id,
      note: noteContent,
      createdById: user.id,
    });
    console.log(`  Internal note created: id=${newNote.id}, author=${newNote.createdBy.name}`);

    // Retrieve thread details and verify notes are present
    const details = await getThreadDetails(thread.id);
    const foundNote = details.thread?.internalNotes?.find(n => n.id === newNote.id);
    if (foundNote && foundNote.note === noteContent) {
      console.log('  ✓ Internal notes logging and retrieval test passed.');
      // Cleanup test note
      await prisma.mailInternalNote.delete({ where: { id: newNote.id } });
    } else {
      throw new Error('Internal notes logging or retrieval failed.');
    }
  }

  console.log('\nAll core backend mail flows diagnostic checks completed successfully!\n');
}

runTests()
  .catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
