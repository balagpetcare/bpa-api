async function main() {
  try {
    const res = await fetch('http://localhost:4000/api/v1/app/home');
    const json = await res.json();
    console.log(Object.keys(json.data));
    const sliders = json.data.heroBanners || json.data.banners || json.data.hero;
    if (sliders) {
       console.log("ACTIVE SLIDER RECORDS:");
       sliders.forEach(s => {
         console.log(`- id: ${s.id}`);
         console.log(`  title: ${s.title}`);
         console.log(`  imageUrl: ${s.imageUrl}`);
         console.log(`  mobileImageUrl: ${s.mobileImageUrl}`);
         console.log(`  mediaId: ${s.mediaId || 'N/A'}`);
         console.log(`  destination: ${s.destinationType} -> ${s.destinationValue}`);
         console.log(`  sortOrder: ${s.sortOrder}`);
         console.log(`  activeDates: ${s.startsAt} to ${s.endsAt}\n`);
       });
    }
  } catch (e) {
    console.error(e);
  }
}
main();
