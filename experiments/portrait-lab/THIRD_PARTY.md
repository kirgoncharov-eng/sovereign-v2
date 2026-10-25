# Sources for experiment #207

The standalone comparison is a local development experiment, not part of the game.

## Processing code

- Pixel It by José Moreira: https://github.com/giventofly/pixelit
  - SHA `9c53dfa191fcb2f4a4507c21f40647c29e352939`.
  - `src/pixelit.js` (only trailing whitespace in a comment removed) in `vendor/pixelit/`. MIT license beside it.
  - Build adapter only appends an ES module export; the algorithm is unchanged.
- Pixel-Art Converter by AleksTomatoOnion: https://github.com/AleksTomatoOnion/Pixel_Art_Converter
  - SHA `c6b074e3348b59d1b45a696aa08f587e3035ead1`.
  - Unmodified `src/pipeline`, `src/palettes`, `src/presets` in `vendor/converter/`. MIT license beside them.
  - No upstream UI, logo, npm package installation scripts or analytics are included.
  - Adapter supplies the trial 8-tone or 24-color palette through the exposed palette object.

Both paths receive the same 192×256 canvas crop and chosen trial palette, with a 48/64/96px output width.
Pixel It works on its native source-sized canvas and is then sampled without smoothing to the target dimensions.
Its intermediate grid height can be fractional; this differs slightly from the other converter's rounded grid.
The converter adds its own flattening, banding, cleanup and contour stages. These are deliberately the variable being compared.
Reported computation times exclude image decoding, crop preparation and UI rendering, and are not a phone hardware benchmark.

## Images

- `collins.png`: Eileen Collins, NASA; public-domain test image distributed by scikit-image.
  - https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png
  - https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut
- `armstrong.jpg`: Neil Armstrong, NASA.
  - https://www.nasa.gov/image-article/official-portrait-of-neil-armstrong/
  - https://www.nasa.gov/wp-content/uploads/2023/03/464436main_S69-31741_full.jpg
- Game portrait references: unchanged copies of `web/public/art/figures/amb_russia.webp`, `amb_eu.webp`, `journalist.webp`.

NASA photos are technical test inputs, not game characters, endorsements, or proposed commercial game assets.
No identity recognition or face model is used. Framing is manual. Source photos stay in memory in the browser;
the user can explicitly export only the processed PNG. Reloading the page discards their original photo.
