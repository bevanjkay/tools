import type { PanoramaOptions } from "./panorama";
import { describe, expect, it } from "vitest";
import { panoramaSlices, panoramaUpscale } from "./panorama";

const base: PanoramaOptions = {
	imageWidth: 3000,
	imageHeight: 1000,
	splitCount: 3,
	outputWidth: 1080,
	outputHeight: 1080,
	paddingPercent: 0,
	paddingMode: "per-slide",
};

describe("panoramaSlices", () => {
	it("cuts equal strips that fill each slide", () => {
		const slices = panoramaSlices(base);
		expect(slices).toHaveLength(3);
		expect(slices.map(slice => slice.source)).toEqual([
			{ x: 0, y: 0, w: 1000, h: 1000 },
			{ x: 1000, y: 0, w: 1000, h: 1000 },
			{ x: 2000, y: 0, w: 1000, h: 1000 },
		]);
		expect(slices[0].dest).toEqual({ x: 0, y: 0, w: 1080, h: 1080 });
	});

	it("crops the strip height when the image is taller than the slide ratio", () => {
		const [slice] = panoramaSlices({ ...base, imageHeight: 2000 });
		expect(slice.source).toEqual({ x: 0, y: 500, w: 1000, h: 1000 });
	});

	it("crops the strip width when the image is shorter than the slide ratio", () => {
		const [slice] = panoramaSlices({ ...base, imageHeight: 500 });
		expect(slice.source).toEqual({ x: 250, y: 0, w: 500, h: 500 });
	});

	it("pads every slide in per-slide mode", () => {
		const slices = panoramaSlices({ ...base, paddingPercent: 10 });
		expect(slices[1].dest).toEqual({ x: 108, y: 108, w: 864, h: 864 });
	});

	it("pads only the outer edges in carousel mode", () => {
		const slices = panoramaSlices({ ...base, paddingPercent: 10, paddingMode: "carousel" });
		expect(slices[0].dest).toEqual({ x: 108, y: 108, w: 972, h: 864 });
		expect(slices[1].dest).toEqual({ x: 0, y: 108, w: 1080, h: 864 });
		expect(slices[2].dest).toEqual({ x: 0, y: 108, w: 972, h: 864 });
	});
});

describe("panoramaUpscale", () => {
	it("reports the enlargement factor of the drawn strip", () => {
		expect(panoramaUpscale(base)).toBeCloseTo(1.08);
		expect(panoramaUpscale({ ...base, imageWidth: 9000, imageHeight: 3000 })).toBeCloseTo(0.36);
	});
});
