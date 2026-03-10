# Xenosumedia Photography Portfolio

Welcome to the Xenosumedia portfolio template! This project is a highly-customizable, modular React application designed specifically for photographers to beautifully showcase their work.

This guide is broken down based on your technical comfort level. Choose the section that best describes you!

---

## Level 1: "I'm not a tech person, I just want my site up!"

### a. Big Picture (Overview)
This is the code for your photography website. It takes a folder full of your photos and automatically turns them into a fast, beautiful masonry grid. People can click on photos to see full-resolution versions (with EXIF data like camera settings!).

### b. Setup and Run
To get this running, you will likely need to ask a more technical friend to help you or use a drag-and-drop hosting service. But creating the actual *content* of the site is extremely simple!
Just drop your `.jpg` files into folders inside `src/assets/photos`. 
*Pro-tip:* The website automatically reads your folder names (e.g., `Weddings`, `Studio`) and creates a new gallery section for that category on the main page.

### c. Customize and Deploy
You don't need to know how to code to customize this site. All your text, branding, and layout choices live in a single file called `src/site.config.ts`. 
1. Open up `src/site.config.ts` in any text editor.
2. Change the text inside the quotes (like your name or Instagram handle).
3. If you want to change colors, look at the `theme` section at the bottom and change the hex codes (e.g., `#c9a84c`).
To put the site on the internet, you can create a free account on [Netlify](https://www.netlify.com/) or [Vercel](https://vercel.com/) and drag this entire folder into their deployment tool.

---

## Level 2: "I know a bit of code and want to run this locally."

### a. Big Picture (Overview)
This website uses the Node.js ecosystem to process your high-resolution images and convert them into a lightning-fast React application. It handles all the heavy lifting of resizing images for you so your portfolio loads instantly on mobile devices.

### b. Setup and Run
If you've used tools like Terminal or Command Prompt before, here is how you run the website on your own computer:
1. Make sure you have [Node.js](https://nodejs.org/) installed.
2. Open your terminal and navigate to this folder.
3. Run `npm install` to download all the necessary background engines.
4. Run `npm run dev`.
5. The terminal will give you a link (usually `http://localhost:5173`). Click it or copy it into your browser! Whenever you edit `src/site.config.ts`, the browser will automatically refresh.

### c. Customize and Deploy
You can toggle features like watermarks without writing code. Look for a file called `scripts/watermark.config.mjs`. You can turn watermarks `enabled: true` or `false`, change the text, and adjust the opacity. The watermarks will be automatically baked into your images before the site goes live.
To deploy, upload this code to a GitHub repository, then link that repository to a service like Vercel. It will automatically build and publish your site every time you make a change.

---

## Level 3: "I'm comfortable configuring apps."

### a. Big Picture (Overview)
This is a modern React application powered by Vite. To avoid shipping massive JPEGs to end-users, this template utilizes a custom Node.js script using the `sharp` image processing library right before the Vite build step. 

### b. Setup and Run
Development relies on standard NPM scripts. Running `npm run dev` boots the Vite dev server for instant HMR feedback. Adding new photos into `src/assets/photos` dynamically populates the UI via Vite's `import.meta.glob`. 

### c. Customize and Deploy
There are three layout mathematical models to choose from for the main grid. Go into `src/site.config.ts`. Under `features.galleryLayout`, you can swap between:
- `"justified"`: Standard masonry that respects aspect ratios.
- `"grid"`: Uniform, cropped squares.
- `"orientation-dense"`: A smarter masonry that aggressively groups portraits with portraits and landscapes with landscapes so there is less "empty space" at the edges.

The build command you need to give to your hosting provider (Vercel/Netlify) is `npm run build`. The final static site is output to the `dist` directory.

---

## Level 4: "I'm a Software Engineer."

### a. Big Picture (Overview)
This architecture is a hybrid SSG (Static Site Generation) approach. Because image processing is expensive, we do not do runtime resizing or cloud transformations. Instead, `scripts/build-images.mjs` acts as a pre-build step to composite SVG-based EXIF/Text watermarks directly onto image buffers via `sharp`. 

### b. Setup and Run
When you run `npm run build`, the pipeline executes:
1. `build-images.mjs` scans your `src/assets/photos` folder, shrinks every photo down into 400px, 800px, and 1200px thumbnails (in WebP format for speed), and outputs them into `public/thumbs`. 
2. If `watermarkConfig.enabled` is true, it also composites your watermarked originals and stores them in `public/watermarked`.
3. It writes a dictionary file to `src/generated/manifest.json`.
4. Then `tsc -b && vite build` processes the React application. React bootstraps off `manifest.json` at runtime to extract baked WebP URLs and pre-calculated aspect ratios.

### c. Customize and Deploy
`GallerySection.tsx` is essentially a switch router. Based on the config, it delegates rendering to the specific layout mathematical component (currently handled inline via `gallery.ts` algorithms like `computeRows`). `useContainerWidth` utilizes `ResizeObserver` to actively relayout the mathematical models on window rescale.
**Important:** Do NOT modify images directly in `public/`. They are ephemeral build artifacts. Always place source `.jpg` files in `src/assets/photos` and let the prebuild script do the work.
