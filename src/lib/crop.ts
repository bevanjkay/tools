export interface CropRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type CropHandle = "nw" | "ne" | "sw" | "se";

export const MIN_CROP_PX = 16;

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** Largest crop of `ratio` that fits the image, anchored by alignment fractions in [0, 1]. */
export function defaultCrop(natW: number, natH: number, ratio: number | null, ax: number, ay: number): CropRect {
	if (ratio === null)
		return { x: 0, y: 0, w: natW, h: natH };
	const imageRatio = natW / natH;
	let w: number;
	let h: number;
	if (imageRatio > ratio) {
		h = natH;
		w = h * ratio;
	}
	else {
		w = natW;
		h = w / ratio;
	}
	w = Math.round(w);
	h = Math.round(h);
	return {
		x: Math.round((natW - w) * ax),
		y: Math.round((natH - h) * ay),
		w,
		h,
	};
}

/** Snap a crop offset to the nearest alignment step (0, 0.5 or 1). */
export function nearestAlign(pos: number, total: number, size: number) {
	if (total - size <= 0)
		return 0.5;
	const fraction = pos / (total - size);
	return fraction < 0.25 ? 0 : fraction > 0.75 ? 1 : 0.5;
}

/** Move a crop to an alignment anchor, keeping its size. */
export function alignCrop(rect: CropRect, natW: number, natH: number, ax: number, ay: number): CropRect {
	return {
		...rect,
		x: Math.round((natW - rect.w) * ax),
		y: Math.round((natH - rect.h) * ay),
	};
}

export function moveCrop(rect: CropRect, dx: number, dy: number, natW: number, natH: number): CropRect {
	return {
		...rect,
		x: clamp(rect.x + dx, 0, natW - rect.w),
		y: clamp(rect.y + dy, 0, natH - rect.h),
	};
}

/** Resize from a corner handle; the opposite corner stays fixed and `ratio` is kept when set. */
export function resizeCrop(
	start: CropRect,
	handle: CropHandle,
	dx: number,
	dy: number,
	natW: number,
	natH: number,
	ratio: number | null,
	minPx = MIN_CROP_PX,
): CropRect {
	const dirX = handle === "ne" || handle === "se" ? 1 : -1;
	const dirY = handle === "sw" || handle === "se" ? 1 : -1;
	const fixedX = dirX > 0 ? start.x : start.x + start.w;
	const fixedY = dirY > 0 ? start.y : start.y + start.h;
	const pointerX = (dirX > 0 ? start.x + start.w : start.x) + dx;
	const pointerY = (dirY > 0 ? start.y + start.h : start.y) + dy;

	const availW = dirX > 0 ? natW - fixedX : fixedX;
	const availH = dirY > 0 ? natH - fixedY : fixedY;

	let w = clamp(Math.abs(pointerX - fixedX), minPx, availW);
	let h: number;
	if (ratio !== null) {
		h = w / ratio;
		if (h > availH) {
			h = availH;
			w = h * ratio;
		}
		w = Math.max(w, minPx);
		h = Math.max(h, minPx);
	}
	else {
		h = clamp(Math.abs(pointerY - fixedY), minPx, availH);
	}

	return {
		x: Math.round(dirX > 0 ? fixedX : fixedX - w),
		y: Math.round(dirY > 0 ? fixedY : fixedY - h),
		w: Math.round(w),
		h: Math.round(h),
	};
}
