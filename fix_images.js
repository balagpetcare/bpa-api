const sharp = require('sharp');
const fs = require('fs');
const files = ['57813748-4805-45fd-87df-a006b701883f.jpg', '911e5748-246e-487c-9442-a3acd5cdd7ca.jpg', '59d04f23-3553-48a5-84b8-2de03ed7ccb5.jpg'];
files.forEach(file => {
  sharp('uploads/' + file).jpeg({ progressive: false, force: true }).toFile('uploads/fixed_' + file, (err, info) => {
    if (err) console.error(err);
    else {
      fs.renameSync('uploads/fixed_' + file, 'uploads/' + file);
      console.log('Fixed ' + file);
    }
  });
});
