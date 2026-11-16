import type { ScatterPlacement } from "./carousel-scatter";
import { describe, expect, it } from "vitest";
import { MAX_OVERLAP, photosPerSlide, scatterCarousel } from "./carousel-scatter";
import { mulberry32 } from "./collage-layout";

const landscape = { width: 3000, height: 2000 };
const portrait = { width: 2000, height: 3000 };
const square = { width: 2000, height: 2000 };
const panorama = { width: 4000, height: 1500 };
const shapes = [landscape, portrait, square, panorama];
const mixed = [landscape, portrait, square, landscape, portrait, landscape, panorama];
const options = { slideWidth: 1080, slideHeight: 1350, perSlide: 3, spread: 50, tilt: 6, seed: 7 };

function byIndex(placements: ScatterPlacement[]) {
	return placements.toSorted((a, b) => a.index - b.index);
}

function halfExtents(photo: ScatterPlacement) {
	const sin = Math.abs(Math.sin(photo.rotation));
	const cos = Math.abs(Math.cos(photo.rotation));
	return { x: (photo.width * cos + photo.height * sin) / 2, y: (photo.width * sin + photo.height * cos) / 2 };
}

/** Overlap of the upright boxes the tilted photos occupy: never less than what is drawn. */
function sharedArea(a: ScatterPlacement, b: ScatterPlacement) {
	const x = halfExtents(a).x + halfExtents(b).x - Math.abs(a.cx - b.cx);
	const y = halfExtents(a).y + halfExtents(b).y - Math.abs(a.cy - b.cy);
	return x > 0 && y > 0 ? x * y : 0;
}

/** A spread of slide shapes, photo mixes and settings, repeatable from one seed. */
function randomCases(count: number) {
	const pick = mulberry32(2026);
	const slides = [{ slideWidth: 1080, slideHeight: 1080 }, { slideWidth: 1080, slideHeight: 1350 }, { slideWidth: 1080, slideHeight: 566 }];
	return Array.from({ length: count }, () => ({
		sizes: Array.from({ length: 1 + Math.floor(pick() * 14) }, () => shapes[Math.floor(pick() * shapes.length)]),
		options: {
			...slides[Math.floor(pick() * slides.length)],
			perSlide: 1 + Math.floor(pick() * 6),
			spread: Math.floor(pick() * 101),
			tilt: Math.floor(pick() * 16),
			seed: 1 + Math.floor(pick() * 100),
		},
	}));
}

describe("photosPerSlide", () => {
	it("shares photos evenly rather than leaving a straggler", () => {
		expect(photosPerSlide(7, 3)).toEqual([3, 2, 2]);
		expect(photosPerSlide(6, 3)).toEqual([3, 3]);
		expect(photosPerSlide(4, 1)).toEqual([1, 1, 1, 1]);
		expect(photosPerSlide(2, 5)).toEqual([2]);
		expect(photosPerSlide(0, 3)).toEqual([]);
	});
});

describe("scatterCarousel", () => {
	it("is deterministic per seed and places every photo once", () => {
		const layout = scatterCarousel(mixed, options);
		expect(scatterCarousel(mixed, options)).toEqual(layout);
		expect(scatterCarousel(mixed, { ...options, seed: 8 })).not.toEqual(layout);
		expect(layout.slideCount).toBe(3);
		expect(byIndex(layout.placements).map(photo => photo.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("fills slides in photo order and keeps each photo's proportions", () => {
		const placements = byIndex(scatterCarousel(mixed, options).placements);
		expect(placements.map(photo => photo.slide)).toEqual([0, 0, 0, 1, 1, 2, 2]);
		placements.forEach((photo, index) => {
			expect(photo.width / photo.height).toBeCloseTo(mixed[index].width / mixed[index].height);
		});
	});

	it("tilts photos no further than asked, and not at all when tilt is zero", () => {
		const tilted = scatterCarousel(mixed, { ...options, tilt: 10 }).placements;
		expect(tilted.some(photo => photo.rotation !== 0)).toBe(true);
		for (const photo of tilted)
			expect(Math.abs(photo.rotation)).toBeLessThanOrEqual(10 * Math.PI / 180);
		for (const photo of scatterCarousel(mixed, { ...options, tilt: 0 }).placements)
			expect(Math.abs(photo.rotation)).toBe(0);
	});

	it("keeps the arrangement when only spread or tilt changes", () => {
		const base = byIndex(scatterCarousel(mixed, { ...options, spread: 0, tilt: 0 }).placements);
		const loose = byIndex(scatterCarousel(mixed, { ...options, spread: 20, tilt: 3 }).placements);
		loose.forEach((photo, index) => {
			expect(Math.abs(photo.cx - base[index].cx)).toBeLessThan(options.slideWidth * 0.2);
			expect(Math.abs(photo.cy - base[index].cy)).toBeLessThan(options.slideHeight * 0.2);
		});
	});

	it("lets photos lean across the seam between slides", () => {
		const { slideWidth } = options;
		const crossesSeam = (photo: ScatterPlacement) =>
			Math.floor((photo.cx - photo.width / 2) / slideWidth) !== Math.floor((photo.cx + photo.width / 2) / slideWidth);
		const seeds = Array.from({ length: 10 }, (_, seed) => seed + 1);
		expect(seeds.every(seed => scatterCarousel(mixed, { ...options, spread: 100, seed }).placements.some(crossesSeam))).toBe(true);
	});

	it("keeps every photo on the strip and centred on its own slide", () => {
		for (const { sizes, options: random } of randomCases(300)) {
			const layout = scatterCarousel(sizes, random);
			for (const photo of layout.placements) {
				const half = halfExtents(photo);
				expect(photo.cy - half.y).toBeGreaterThanOrEqual(0);
				expect(photo.cy + half.y).toBeLessThanOrEqual(random.slideHeight);
				expect(photo.cx - half.x).toBeGreaterThanOrEqual(0);
				expect(photo.cx + half.x).toBeLessThanOrEqual(random.slideWidth * layout.slideCount);
				expect(photo.cx).toBeGreaterThanOrEqual(photo.slide * random.slideWidth);
				expect(photo.cx).toBeLessThanOrEqual((photo.slide + 1) * random.slideWidth);
			}
		}
	});

	it("keeps a tilted photo on the strip when the slide is far taller than it is wide", () => {
		const sliver = { slideWidth: 100, slideHeight: 4096 };
		const layout = scatterCarousel([{ width: 100, height: 4096 }], { ...options, ...sliver, perSlide: 1, tilt: 15, seed: 1 });
		const [photo] = layout.placements;
		const half = halfExtents(photo);
		expect(photo.cx - half.x).toBeGreaterThanOrEqual(0);
		expect(photo.cx + half.x).toBeLessThanOrEqual(sliver.slideWidth);
		expect(photo.cy - half.y).toBeGreaterThanOrEqual(0);
		expect(photo.cy + half.y).toBeLessThanOrEqual(sliver.slideHeight);
	});

	it("returns an empty layout rather than throwing while a slide dimension is missing", () => {
		for (const blank of [0, -10, Number.NaN, null as unknown as number]) {
			for (const dimension of [{ slideWidth: blank }, { slideHeight: blank }])
				expect(scatterCarousel(mixed, { ...options, ...dimension })).toEqual({ slideCount: 3, placements: [] });
		}
	});

	it("never buries a photo under its neighbours", () => {
		for (const { sizes, options: random } of randomCases(300)) {
			const { placements } = scatterCarousel(sizes, random);
			placements.forEach((below, position) => {
				for (const above of placements.slice(position + 1)) {
					const smaller = Math.min(below.width * below.height, above.width * above.height);
					expect(sharedArea(below, above)).toBeLessThanOrEqual(smaller * MAX_OVERLAP * 1.001);
					const centreCovered = Math.abs(below.cx - above.cx) < above.width / 2 && Math.abs(below.cy - above.cy) < above.height / 2;
					expect(centreCovered).toBe(false);
				}
			});
		}
	});

	it("keeps photos a worthwhile size however many share a slide", () => {
		for (const { sizes, options: random } of randomCases(300)) {
			for (const photo of scatterCarousel(sizes, random).placements)
				expect(Math.max(photo.width / random.slideWidth, photo.height / random.slideHeight)).toBeGreaterThan(0.25);
		}
	});
});
