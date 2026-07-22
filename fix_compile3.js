const fs = require('fs');

let svc = fs.readFileSync('src/modules/membership-campaign/membership-campaign.service.ts', 'utf8');

// I need to add regularPrice, offerPrice, and the snapshot fields back.
svc = svc.replace(/tierVersion: tier\.version,/g, 'regularPrice: tier.regularPriceBdt,\n          offerPrice: tier.launchPriceBdt,\n          regularPriceSnapshot: null,\n          campaignPrice: null,\n          minPetsSnapshot: null,\n          includedPetsSnapshot: null,\n          maxPetsSnapshot: null,\n          validityMonthsSnapshot: null,\n          benefitsSnapshot: require("@prisma/client").Prisma.DbNull,\n          tierVersion: tier.version,');

fs.writeFileSync('src/modules/membership-campaign/membership-campaign.service.ts', svc);
