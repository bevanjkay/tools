export type PaddingMode = "per-slide" | "carousel";

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PanoramaOptions {
	imageWidth: number;
	imageHeight: number;
	splitCount: number;
	outputWidth: number;
	outputHeight: number;
	/** Padding as a percentage of the output width. */
	paddingPercent: number;
	paddingMode: PaddingMode;
}

export interface Slice {
	/** Region of the source image to draw. */
	source: Rect;
	/** Region of the output slide to draw into. */
	dest: Rect;
}

/**
 * Cut a panorama into equal vertical strips, each cover-fitted into the
 * padded content area of one output slide.
 */
export function panoramaSlices(options: PanoramaOptions): Slice[] {
	const { imageWidth, imageHeight, splitCount, outputWidth, outputHeight, paddingPercent, paddingMode } = options;
	const stripWidth = imageWidth / splitCount;
	const padding = (paddingPercent / 100) * outputWidth;

	return Array.from({ length: splitCount }, (_, i) => {
		const isFirst = i === 0;
		const isLast = i === splitCount - 1;
		const dest: Rect = paddingMode === "per-slide"
			? { x: padding, y: padding, w: outputWidth - padding * 2, h: outputHeight - padding * 2 }
			: {
					x: isFirst ? padding : 0,
					y: padding,
					w: outputWidth - (isFirst ? padding : 0) - (isLast ? padding : 0),
					h: outputHeight - padding * 2,
				};

		const destRatio = dest.w / dest.h;
		const stripRatio = stripWidth / imageHeight;
		const source: Rect = { x: i * stripWidth, y: 0, w: stripWidth, h: imageHeight };
		if (stripRatio < destRatio) {
			source.h = stripWidth / destRatio;
			source.y = (imageHeight - source.h) / 2;
		}
		else {
			source.w = imageHeight * destRatio;
			source.x = i * stripWidth + (stripWidth - source.w) / 2;
		}
		return { source, dest };
	});
}

/** How much the first slice is enlarged; above 1 the output will look soft. */
export function panoramaUpscale(options: PanoramaOptions) {
	const [first] = panoramaSlices(options);
	return first ? first.dest.w / first.source.w : 1;
}
