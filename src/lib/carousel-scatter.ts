import type { Frame, Size } from "./collage-layout";
import { evenGroups, mulberry32 } from "./collage-layout";

export interface ScatterOptions {
	slideWidth: number;
	slideHeight: number;
	/** Most photos to put on one slide. */
	perSlide: number;
	/** 0–100: how far photos stray from a tidy arrangement, including across slide edges. */
	spread: number;
	/** Largest tilt in degrees, applied in either direction. */
	tilt: number;
	seed: number;
	/** Share of a slide its photos would cover between them if all were the same size. */
	coverage?: number;
	/** Most of the smaller photo's area that two photos may share. */
	maxOverlap?: number;
	/** Largest share of the slide a single photo may fill, leaving room to scatter. */
	maxShare?: number;
}

export interface ScatterPlacement {
	/** Index into the input photo list. */
	index: number;
	/** Slide the photo's centre sits on. */
	slide: number;
	/** Centre, measured along the whole strip of slides. */
	cx: number;
	cy: number;
	width: number;
	height: number;
	/** Radians. */
	rotation: number;
}

export interface ScatterLayout {
	slideCount: number;
	/** In paint order: later photos sit on top. */
	placements: ScatterPlacement[];
}

const PARTITION_ATTEMPTS = 32;
const MAX_SHARE = 0.74;
const COVERAGE = 0.68;
/** How far a photo's scale may fall below or rise above that even share. */
const SIZE_RANGE = { min: 0.9, max: 1.4 };
const MARGIN_SHARE = 0.035;
/** How far past its cell a photo may wander at full spread, as a share of the cell. */
const STRAY_SHARE = { x: 0.22, y: 0.14 };
export const MAX_OVERLAP = 0.2;
const SETTLE_ROUNDS = 10;
const SETTLE_PASSES = 24;
const SHRINK = 0.93;

function clamp(value: number, min: number, max: number) {
	return min > max ? (min + max) / 2 : Math.max(min, Math.min(max, value));
}

function aspectRatio(box: Size) {
	return box.width / box.height;
}

function fitScale(size: Size, box: Size) {
	return Math.min(box.width / size.width, box.height / size.height);
}

/** The upright box a rotated one occupies. */
function tiltedSize(box: Size, rotation: number): Size {
	const sin = Math.abs(Math.sin(rotation));
	const cos = Math.abs(Math.cos(rotation));
	return { width: box.width * cos + box.height * sin, height: box.width * sin + box.height * cos };
}

/** Randomly halves the frame until there is one cell per photo. */
function splitFrame(frame: Frame, count: number, rng: () => number): Frame[] {
	if (count === 1)
		return [frame];
	const first = Math.floor(count / 2) + (count % 2 === 1 && rng() < 0.5 ? 1 : 0);
	const share = clamp(first / count + (rng() - 0.5) * 0.5, 0.25, 0.75);
	// Wide frames split into columns and tall ones into rows; near-square frames go either way.
	const sideBySide = Math.log(aspectRatio(frame)) > rng() - 0.5;
	const [a, b] = sideBySide
		? [{ ...frame, width: frame.width * share }, { ...frame, x: frame.x + frame.width * share, width: frame.width * (1 - share) }]
		: [{ ...frame, height: frame.height * share }, { ...frame, y: frame.y + frame.height * share, height: frame.height * (1 - share) }];
	return [...splitFrame(a, first, rng), ...splitFrame(b, count - first, rng)];
}

/**
 * Tries several random partitions of the frame and keeps the one whose cells suit the photos best,
 * pairing wide photos with wide cells. Returns the chosen cell for each photo, in input order.
 */
function assignCells(sizes: Size[], frame: Frame, rng: () => number): Frame[] {
	const byAspect = sizes.map((size, order) => ({ size, order })).toSorted((a, b) => aspectRatio(a.size) - aspectRatio(b.size));
	let best: Frame[] = [];
	let bestScore = -Infinity;
	for (let attempt = 0; attempt < PARTITION_ATTEMPTS; attempt += 1) {
		const cells = splitFrame(frame, sizes.length, rng).toSorted((a, b) => aspectRatio(a) - aspectRatio(b));
		// Summing inverse areas punishes any layout that leaves one photo tiny.
		const score = -cells.reduce((sum, cell, rank) => {
			const { size } = byAspect[rank];
			const scale = fitScale(size, cell);
			return sum + 1 / (size.width * size.height * scale * scale);
		}, 0);
		if (score > bestScore) {
			bestScore = score;
			best = cells;
		}
	}
	const cells: Frame[] = [];
	byAspect.forEach(({ order }, rank) => {
		cells[order] = best[rank];
	});
	return cells;
}

/**
 * Nudges apart any two photos sharing more than `maxOverlap` of the smaller one,
 * shrinking the pair when there is no room left to move.
 */
function settle(photos: ScatterPlacement[], maxOverlap: number, confine: (photo: ScatterPlacement) => void) {
	for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
		let crowded = new Set<ScatterPlacement>();
		for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
			crowded = new Set();
			for (const [position, a] of photos.entries()) {
				for (const b of photos.slice(position + 1)) {
					if (b.slide - a.slide > 1)
						break;
					// Measured on the upright boxes the tilted photos occupy, which errs towards more room.
					const boxA = tiltedSize(a, a.rotation);
					const boxB = tiltedSize(b, b.rotation);
					const overlapX = (boxA.width + boxB.width) / 2 - Math.abs(a.cx - b.cx);
					const overlapY = (boxA.height + boxB.height) / 2 - Math.abs(a.cy - b.cy);
					const allowed = maxOverlap * Math.min(a.width * a.height, b.width * b.height);
					if (overlapX <= 0 || overlapY <= 0 || overlapX * overlapY <= allowed)
						continue;
					crowded.add(a).add(b);
					// Separate along whichever axis needs the shorter move.
					const pushX = overlapX - allowed / overlapY;
					const pushY = overlapY - allowed / overlapX;
					if (pushX <= pushY) {
						const direction = a.cx <= b.cx ? 1 : -1;
						a.cx -= direction * pushX / 2;
						b.cx += direction * pushX / 2;
					}
					else {
						const direction = a.cy <= b.cy ? 1 : -1;
						a.cy -= direction * pushY / 2;
						b.cy += direction * pushY / 2;
					}
				}
			}
			if (crowded.size === 0)
				return;
			photos.forEach(confine);
		}
		for (const photo of crowded) {
			photo.width *= SHRINK;
			photo.height *= SHRINK;
			confine(photo);
		}
	}
}

/**
 * Scatters photos along a carousel treated as one continuous strip, several to a slide.
 * Photos keep their aspect ratio, may lean across the seam into a neighbouring slide,
 * and never run off the top, bottom or outer ends of the strip.
 * The same seed always yields the same layout, and spread and tilt adjust it without reshuffling.
 */
export function scatterCarousel(sizes: Size[], options: ScatterOptions): ScatterLayout {
	const { slideWidth, slideHeight, coverage = COVERAGE, maxOverlap = MAX_OVERLAP, maxShare = MAX_SHARE } = options;
	const counts = evenGroups(sizes.length, options.perSlide);
	// A cleared or zero dimension field leaves nothing to lay photos out on.
	if (!(slideWidth > 0 && slideHeight > 0))
		return { slideCount: counts.length, placements: [] };
	const stripWidth = slideWidth * counts.length;
	const margin = Math.min(slideWidth, slideHeight) * MARGIN_SHARE;
	const spread = clamp(options.spread / 100, 0, 1);
	const maxTilt = Math.max(0, options.tilt) * (Math.PI / 180);
	const rng = mulberry32(options.seed);

	function confine(photo: ScatterPlacement) {
		const tilted = tiltedSize(photo, photo.rotation);
		const halfWidth = tilted.width / 2;
		const halfHeight = tilted.height / 2;
		const left = photo.slide * slideWidth;
		photo.cx = clamp(
			photo.cx,
			photo.slide === 0 ? margin + halfWidth : left,
			photo.slide === counts.length - 1 ? stripWidth - margin - halfWidth : left + slideWidth,
		);
		photo.cy = clamp(photo.cy, margin + halfHeight, slideHeight - margin - halfHeight);
	}

	const photos: ScatterPlacement[] = [];
	const depths: number[] = [];
	counts.forEach((count, slide) => {
		const left = slide === 0 ? margin : margin / 4;
		const right = slide === counts.length - 1 ? margin : margin / 4;
		const frame = { x: slide * slideWidth + left, y: margin, width: slideWidth - left - right, height: slideHeight - margin * 2 };
		const first = photos.length;
		const slideSizes = sizes.slice(first, first + count);
		const cells = assignCells(slideSizes, frame, rng);
		const rolls = slideSizes.map(() => ({ grow: rng(), tilt: rng() * 2 - 1, x: rng() * 2 - 1, y: rng() * 2 - 1, depth: rng() }));
		// Photos sharing a slide drift in opposing directions, which keeps the slide balanced.
		const drift = count > 1
			? { x: rolls.reduce((sum, roll) => sum + roll.x, 0) / count, y: rolls.reduce((sum, roll) => sum + roll.y, 0) / count }
			: { x: 0, y: 0 };

		slideSizes.forEach((size, offset) => {
			const cell = cells[offset];
			const roll = rolls[offset];
			const evenShare = Math.sqrt(coverage * frame.width * frame.height / (count * size.width * size.height));
			const rotation = roll.tilt * maxTilt;
			// Photos fill the cell they were dealt, within limits that stop any looking lost or dominant,
			// and never grow so large that tilting them would push a corner off the slide.
			const scale = Math.min(
				clamp(fitScale(size, cell) * (0.92 + roll.grow * 0.22), evenShare * SIZE_RANGE.min, evenShare * SIZE_RANGE.max),
				fitScale(size, frame) * maxShare,
				fitScale(tiltedSize(size, rotation), frame),
			);
			const width = size.width * scale;
			const height = size.height * scale;
			const strayX = Math.min(cell.width / 2, Math.max(0, cell.width - width) / 2 + cell.width * STRAY_SHARE.x);
			const strayY = Math.min(cell.height / 2, Math.max(0, cell.height - height) / 2 + cell.height * STRAY_SHARE.y);
			const photo = {
				index: first + offset,
				slide,
				cx: cell.x + cell.width / 2 + clamp(roll.x - drift.x, -1, 1) * strayX * spread,
				cy: cell.y + cell.height / 2 + clamp(roll.y - drift.y, -1, 1) * strayY * spread,
				width,
				height,
				rotation,
			};
			confine(photo);
			photos.push(photo);
			depths.push(roll.depth);
		});
	});

	settle(photos, maxOverlap, confine);

	// Larger photos go underneath so they cannot bury smaller ones.
	const paintWeight = (photo: ScatterPlacement) => photo.width * photo.height * (0.8 + depths[photo.index] * 0.4);
	return { slideCount: counts.length, placements: photos.toSorted((a, b) => paintWeight(b) - paintWeight(a)) };
}
