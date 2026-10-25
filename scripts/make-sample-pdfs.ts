import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { SourceDoc } from '../shared/blueprint';
import { SAMPLE_SOURCE } from '../shared/sampleSource';

// Renders demo documents to real PDFs in public/samples so the upload pipeline can be shown end to end.

const WATER_CYCLE: SourceDoc = {
  name: 'The Water Cycle — A Short Primer',
  pages: [
    {
      page: 1,
      text:
        '1. A Planet of Moving Water. The water cycle describes how water moves continuously between the oceans, the atmosphere and the land. The total amount of water on Earth stays almost constant; it only changes form and location. ' +
        'The cycle is driven by energy from the Sun, which heats water at the surface, and by gravity, which pulls water back down. ' +
        'About 97 percent of Earth\'s water is salt water in the oceans. Most of the remaining fresh water is frozen in glaciers and ice caps, and only a small fraction is found in lakes, rivers and the atmosphere.',
    },
    {
      page: 2,
      text:
        '2. Evaporation and Condensation. Evaporation happens when the Sun heats liquid water and turns it into water vapor, an invisible gas. Most evaporation takes place over the oceans. ' +
        'Plants also release water vapor through tiny pores in their leaves, a process called transpiration. ' +
        'As warm, moist air rises, it expands and cools. Cooler air can hold less water vapor, so the vapor condenses onto tiny particles of dust or salt, forming the droplets that make up clouds. This change from gas to liquid is called condensation.',
    },
    {
      page: 3,
      text:
        '3. Precipitation and Collection. When cloud droplets collide and grow heavy enough, they fall as precipitation: rain, snow, sleet or hail, depending on the temperature. ' +
        'Some precipitation runs off the land into streams and rivers, which carry it back to the oceans. This is called runoff. ' +
        'Some soaks into the ground in a process called infiltration and becomes groundwater, which can stay underground for a very long time. ' +
        'In summary, the main stages of the cycle happen in this order: evaporation, condensation, precipitation, and collection, after which the cycle begins again.',
    },
  ],
};

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function render(doc: SourceDoc, file: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.name);
  pdf.setAuthor('SlothWorld sample');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const p of doc.pages) {
    const page = pdf.addPage([595, 842]);
    const [heading, ...rest] = p.text.split(/(?<=^\d\. [^.]+\.)\s/);
    let y = 780;
    page.drawText(doc.name.replace('—', '-'), { x: 56, y: 806, size: 9, font, color: rgb(0.45, 0.45, 0.5) });
    for (const l of wrap(heading, bold, 18, 483)) {
      page.drawText(l, { x: 56, y, size: 18, font: bold, color: rgb(0.12, 0.16, 0.22) });
      y -= 26;
    }
    y -= 8;
    for (const l of wrap(rest.join(' '), font, 11.5, 483)) {
      page.drawText(l, { x: 56, y, size: 11.5, font, color: rgb(0.15, 0.15, 0.18) });
      y -= 17;
    }
    page.drawText(`Page ${p.page}`, { x: 520, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.5) });
  }
  writeFileSync(file, await pdf.save());
  console.log('wrote', file);
}

mkdirSync('public/samples', { recursive: true });
await render(SAMPLE_SOURCE, 'public/samples/how-neural-networks-learn.pdf');
await render(WATER_CYCLE, 'public/samples/the-water-cycle.pdf');
