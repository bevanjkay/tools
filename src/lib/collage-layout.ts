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

function edgesWithin(frame: Frame, x: number, y: number, width: number, height: number): Edges {
	return {
		left: x > frame.x,
		right: x + width < frame.x + frame.width,
		top: y > frame.y,
		bottom: y + height < frame.y + frame.height,
	};
}

/** Even rows and columns; the last column and row absorb rounding so the grid fills the frame. */
export function gridLayout(count: number, frame: Frame, columns: number, gap: number): Placement[] {
	const safeColumns = Math.max(1, Math.floor(columns));
	const rows = Math.ceil(count / safeColumns);
	let safeGap = Math.max(0, gap);
	let availableWidth = frame.width - safeGap * (safeColumns - 1);
	let availableHeight = frame.height - safeGap * (rows - 1);
	if (availableWidth <= 0 || availableHeight <= 0) {
		safeGap = 0;
		availableWidth = frame.width;
		availableHeight = frame.height;
	}
	const cellWidth = availableWidth / safeColumns;
	const cellHeight = availableHeight / rows;

	const placements: Placement[] = [];
	for (let index = 0; index < count; index += 1) {
		const col = index % safeColumns;
		const row = Math.floor(index / safeColumns);
		const x = frame.x + col * (cellWidth + safeGap);
		const y = frame.y + row * (cellHeight + safeGap);
		const width = col === safeColumns - 1 ? frame.x + frame.width - x : cellWidth;
		const height = row === rows - 1 ? frame.y + frame.height - y : cellHeight;
		if (width <= 0 || height <= 0)
			continue;
		placements.push({
			index,
			x,
			y,
			width,
			height,
			edges: { left: col > 0, right: col < safeColumns - 1, top: row > 0, bottom: row < rows - 1 },
			rotation: 0,
		});
	}
	return placements;
}

/** Shortest-column-first masonry, then stretched so every column spans the frame height. */
export function masonryLayout(sizes: Size[], frame: Frame, columns: number, gap: number): Placement[] {
	const safeColumns = Math.max(1, Math.floor(columns));
	const safeGap = Math.max(0, gap);
	const columnWidth = (frame.width - safeGap * (safeColumns - 1)) / safeColumns;
	const columnHeights = Array.from<number>({ length: safeColumns }).fill(0);
	const columnCounts = Array.from<number>({ length: safeColumns }).fill(0);
	const cells = sizes.map((size, index) => {
		let column = 0;
		for (let c = 1; c < safeColumns; c += 1) {
			if (columnHeights[c] < columnHeights[column])
				column = c;
		}
		const cell = {
			index,
			column,
			localIndex: columnCounts[column],
			x: column * (columnWidth + safeGap),
			y: columnHeights[column],
			height: columnWidth * (size.height / size.width),
		};
		columnHeights[column] += cell.height + safeGap;
		columnCounts[column] += 1;
		return cell;
	});

	const totalWidth = columnWidth * safeColumns + safeGap * (safeColumns - 1);
	const scale = frame.width / totalWidth;
	const scaledGap = safeGap * scale;
	const extraGapByColumn = columnHeights.map((value, column) => {
		const count = columnCounts[column];
		if (count <= 1)
			return 0;
		const used = Math.max(0, value * scale - scaledGap);
		return Math.max(0, frame.height - used) / (count - 1);
	});

	return cells.map((cell) => {
		const x = frame.x + cell.x * scale;
		const y = frame.y + cell.y * scale + cell.localIndex * extraGapByColumn[cell.column];
		const width = columnWidth * scale;
		const height = cell.height * scale;
		return { index: cell.index, x, y, width, height, edges: edgesWithin(frame, x, y, width, height), rotation: 0 };
	});
}

/** Loosely jittered, rotated tiles on a hidden grid; the same seed always yields the same layout. */
export function scatteredLayout(count: number, frame: Frame, gap: number, seed: number, variation: number): Placement[] {
	const safeGap = Math.max(0, gap);
	const gridColumns = Math.max(1, Math.ceil(Math.sqrt(count * (frame.width / frame.height))));
	const gridRows = Math.ceil(count / gridColumns);
	const cellWidth = (frame.width - safeGap * (gridColumns - 1)) / gridColumns;
	const cellHeight = (frame.height - safeGap * (gridRows - 1)) / gridRows;
	const rng = mulberry32(seed);
	const spread = Math.max(0, Math.min(1, variation / 100));

	const order = Array.from({ length: count }, (_, index) => index).toSorted(() => rng() - 0.5);

	return order.map((index, slot) => {
		const col = slot % gridColumns;
		const row = Math.floor(slot / gridColumns);
		const jitterX = (rng() - 0.5) * cellWidth * (0.1 + spread * 0.4);
		const jitterY = (rng() - 0.5) * cellHeight * (0.1 + spread * 0.4);
		const scale = 1.15 + rng() * (0.35 + spread * 0.25);
		const rotation = (rng() - 0.5) * (Math.PI / 16);
		const width = cellWidth * scale;
		const height = cellHeight * scale;
		const x = frame.x + col * (cellWidth + safeGap) + jitterX;
		const y = frame.y + row * (cellHeight + safeGap) + jitterY;
		return { index, x, y, width, height, edges: edgesWithin(frame, x, y, width, height), rotation };
	});
}
