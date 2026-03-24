import { stitch } from '@google/stitch-sdk';
import { writeFileSync, mkdirSync } from 'fs';

const PROJECT_ID = '6395731574102595327';
const SCREEN_IDS = [
  '9f82cd55c3774172bd050ca4bd2861f2',   // Log Workout
  '904931e709ce4cb49673ea12ee0f2235',   // Upload Import
  'd156b1798df74b57843877541c9e3e58',   // Progress History
  '6db670d38d434ca1945890c25d9b4fef',   // Today Dashboard
];

const project = stitch.project(PROJECT_ID);

mkdirSync('./stitch-screens', { recursive: true });

for (const screenId of SCREEN_IDS) {
  console.log(`Fetching screen ${screenId}...`);
  const screen = await project.getScreen(screenId);
  const htmlUrl = await screen.getHtml();
  const image = await screen.getImage();
  const htmlContent = await fetch(htmlUrl).then(r => r.text());
  writeFileSync(`./stitch-screens/${screenId}.html`, htmlContent);
  console.log(`  HTML: saved (${htmlContent.length} chars)`);
  console.log(`  Image URL: ${image}`);
}

console.log('Done! Check ./stitch-screens/');
