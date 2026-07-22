const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const campaign = await prisma.campaign.findFirst()
  
  if (!campaign) {
    console.log('Campaign not found')
    return
  }

  const video = await prisma.campaignVideo.create({
    data: {
      campaignId: campaign.id,
      title: 'QA Test Video',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      thumbnailUrl: null,
      caption: 'Testing video API integration',
      sortOrder: 1,
      isActive: true,
    }
  })

  console.log('Created video:', video)

  const publicData = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { videos: { where: { isActive: true } } }
  })
  
  console.log('API Response snippet:', JSON.stringify({ videos: publicData.videos }, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
