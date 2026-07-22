fetch('http://localhost:4000/api/v1/app/home')
  .then(r => r.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
