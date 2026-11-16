export interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

/** Which sides of a tile touch another tile rather than the frame edge. */
export interface Edges {
	left: boolean;
	right: boolean;
	top: boolean;
	bottom: boolean;
}

export interface Placement {
	/** Index into the input image list. */
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	edges: Edges;
	rotation: number;
}

export function mulberry32(seedValue: number) {
	let t = seedValue;
	return () => {
		t += 0x6D2B79F5;
		let r = Math.imul(t ^ (t >>> 15), t | 1);
		r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

/** Splits `total` into groups of at most `perGroup`, sized as evenly as possible so none is left with a lone straggler. */
export function evenGroups(total: number, perGroup: number): number[] {
	const groups = Math.ceil(total / Math.max(1, Math.floor(perGroup)));
	return Array.from({ length: groups }, (_, group) => Math.floor(total / groups) + (group < total % groups ? 1 : 0));
}

/**
 * Rows of equal height that each span the frame. Every photo is placed: when the count does not
 * divide evenly, the leading rows take fewer, wider cells rather than leaving the last row short.
 */
export function gridLayout(count: number, frame: Frame, columns: number, gap: number): Placement[] {
	const rows = evenGroups(count, columns).toReversed();
	const widestRow = Math.max(1, ...rows);
	let safeGap = Math.max(0, gap);
	if (frame.width - safeGap * (widestRow - 1) <= 0 || frame.height - safeGap * (rows.length - 1) <= 0)
		safeGap = 0;
	const cellHeight = (frame.height - safeGap * (rows.length - 1)) / rows.length;

	const placements: Placement[] = [];
	rows.forEach((rowCount, row) => {
		const cellWidth = (frame.width - safeGap * (rowCount - 1)) / rowCount;
		const y = frame.y + row * (cellHeight + safeGap);
		// The last cell in each direction absorbs rounding so the grid fills the frame.
		const height = row === rows.length - 1 ? frame.y + frame.height - y : cellHeight;
		for (let col = 0; col < rowCount; col += 1) {
			const x = frame.x + col * (cellWidth + safeGap);
			const width = col === rowCount - 1 ? frame.x + frame.width - x : cellWidth;
			placements.push({
				index: placements.length,
				x,
				y,
				width,
				height,
				edges: { left: col > 0, right: col < rowCount - 1, top: row > 0, bottom: row < rows.length - 1 },
				rotation: 0,
			});
		}
	});
	return placements;
}

/**
 * Equal-width columns fed shortest-first, each filling the frame from top to bottom.
 * Photos keep their relative heights within a column and are cropped to make up the difference.
 */
export function masonryLayout(sizes: Size[], frame: Frame, columns: number, gap: number): Placement[] {
	const columnCount = Math.max(1, Math.min(Math.floor(columns), sizes.length));
	let safeGap = Math.max(0, gap);
	if (frame.width - safeGap * (columnCount - 1) <= 0)
		safeGap = 0;
	const columnWidth = (frame.width - safeGap * (columnCount - 1)) / columnCount;

	const stacks = Array.from({ length: columnCount }, () => ({ height: 0, tiles: [] as { index: number; height: number }[] }));
	sizes.forEach((size, index) => {
		const shortest = stacks.reduce((best, stack) => (stack.height < best.height ? stack : best));
		const height = columnWidth * (size.height / size.width);
		shortest.tiles.push({ index, height });
		shortest.height += height + safeGap;
	});

	return stacks
		.flatMap(({ tiles }, column) => {
			const stackGap = frame.height - safeGap * (tiles.length - 1) > 0 ? safeGap : 0;
			const stretch = (frame.height - stackGap * (tiles.length - 1)) / tiles.reduce((sum, tile) => sum + tile.height, 0);
			const x = frame.x + column * (columnWidth + safeGap);
			const width = column === columnCount - 1 ? frame.x + frame.width - x : columnWidth;
			let y = frame.y;
			return tiles.map((tile, position) => {
				const height = position === tiles.length - 1 ? frame.y + frame.height - y : tile.height * stretch;
				const placement: Placement = {
					index: tile.index,
					x,
					y,
					width,
					height,
					edges: { left: column > 0, right: column < columnCount - 1, top: position > 0, bottom: position < tiles.length - 1 },
					rotation: 0,
				};
				y += height + stackGap;
				return placement;
			});
		})
		.toSorted((a, b) => a.index - b.index);
}
