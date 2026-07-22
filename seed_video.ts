import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { title: { contains: 'Cat Vaccination Campaign' } }
  })
  
  if (!campaign) {
    console.log('Campaign not found')
    return
  }

  const video = await prisma.campaignVideo.create({
    data: {
      campaignId: campaign.id,
      title: 'Dhaka 2026 Highlights',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: null,
      caption: 'Awesome test video',
      sortOrder: 1,
      isActive: true,
    }
  })

  console.log('Created video:', video)
}

main().catch(console.error).finally(() => prisma.\())
