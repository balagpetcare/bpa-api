const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { title: { contains: 'Cat Vaccination Campaign' } },
    include: { videos: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } }
  })
  
  if (!campaign) {
    console.log('Campaign not found')
    return
  }

  console.log('API Response snippet for:', campaign.title)
  console.log(JSON.stringify({ videos: campaign.videos }, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
