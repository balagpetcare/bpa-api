const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.campaignVideo.deleteMany({
    where: { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }
  })
  console.log('Deleted demo videos:', result.count)
}

main().catch(console.error).finally(() => prisma.$disconnect())
