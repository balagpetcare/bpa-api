const fs = require('fs');

// 1. Fix Router
let router = fs.readFileSync('src/modules/membership-campaign/membership-campaign.router.ts', 'utf8');
if (!router.includes('/plans/sync')) {
  router = router.replace(
    /adminCampaignsRouter\.post\('\/',(.*?)createAdminCampaignHandler\);/,
    "adminCampaignsRouter.post('/', $1createAdminCampaignHandler);\nadminCampaignsRouter.post('/:id/plans/sync', requirePermission('membership_plans:create'), syncAdminPlansHandler);"
  );
  fs.writeFileSync('src/modules/membership-campaign/membership-campaign.router.ts', router);
}

// 2. Fix Service
let svc = fs.readFileSync('src/modules/membership-campaign/membership-campaign.service.ts', 'utf8');
// Fix unused ctx: change to _ctx or use it
svc = svc.replace(/syncAdminPlans\(campaignId: string, ctx: AuditContext\)/, 'syncAdminPlans(campaignId: string, _ctx: AuditContext)');
// Fix campaign.code, campaign.nameEn, campaign.nameBn -> campaign does not have these! They are campaign.titleEn, etc.
svc = svc.replace(/campaign\.code/g, 'campaign.slug');
svc = svc.replace(/campaign\.nameEn/g, 'campaign.titleEn');
svc = svc.replace(/campaign\.nameBn/g, 'campaign.titleBn');
// Fix JsonValue null -> Prisma.DbNull or undefined
svc = svc.replace(/benefitsSnapshot: null/g, 'benefitsSnapshot: require(\'@prisma/client\').Prisma.DbNull');

fs.writeFileSync('src/modules/membership-campaign/membership-campaign.service.ts', svc);
console.log('Fixed backend compilation issues');
