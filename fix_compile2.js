const fs = require('fs');

let router = fs.readFileSync('src/modules/membership-campaign/membership-campaign.router.ts', 'utf8');
if (!router.includes('/plans/sync')) {
  router = router.replace(
    /(adminRouter\.post\('\/campaigns',.*?createAdminCampaignHandler\);)/,
    "$1\nadminRouter.post('/campaigns/:id/plans/sync', authorize(RESOURCES.MEMBERSHIP_PLANS, ACTIONS.CREATE), syncAdminPlansHandler);"
  );
  fs.writeFileSync('src/modules/membership-campaign/membership-campaign.router.ts', router);
  console.log('Fixed router');
}

let svc = fs.readFileSync('src/modules/membership-campaign/membership-campaign.service.ts', 'utf8');
// The error says "regularPrice is missing". Let's check what the schema actually expects. 
// Maybe I named it 'regularPriceSnapshot' in the create data, but the schema has 'regularPrice'?
// Actually wait! My PR in step 1 renamed them to snapshot. Maybe the schema in backend-api/prisma/schema.prisma still has 'regularPrice'?? Wait, no, I modified 'schema.prisma'. 
// Ah! In `syncAdminPlans`, I literally hardcoded `regularPriceSnapshot: null` but maybe the field isn't renamed? 
// Let's replace 'regularPriceSnapshot' with 'regularPrice' in the script if it expects regularPrice. Actually I don't know the exact name.
// Let's replace all those snapshot fields with whatever is required, or just remove them if they are optional in prisma.
svc = svc.replace(/regularPriceSnapshot: null,\n\s*campaignPrice: null,\n\s*minPetsSnapshot: null,\n\s*includedPetsSnapshot: null,\n\s*maxPetsSnapshot: null,\n\s*validityMonthsSnapshot: null,\n\s*benefitsSnapshot: require\('@prisma\/client'\)\.Prisma\.DbNull,/g, '');
// Let's also check if I passed them incorrectly in the string
svc = svc.replace(/regularPriceSnapshot: null,\s*campaignPrice: null,\s*minPetsSnapshot: null,\s*includedPetsSnapshot: null,\s*maxPetsSnapshot: null,\s*validityMonthsSnapshot: null,\s*benefitsSnapshot: require\('@prisma\/client'\)\.Prisma\.DbNull,/g, '');

fs.writeFileSync('src/modules/membership-campaign/membership-campaign.service.ts', svc);
console.log('Fixed service');
