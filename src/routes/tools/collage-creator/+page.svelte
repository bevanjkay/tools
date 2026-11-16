<script lang="ts">
	import type { Edges, Frame, Placement } from "#lib/collage-layout.js";
	import { asset, resolve as resolvePath } from "$app/paths";
	import { ChevronLeft, ChevronRight, Download, Grid2x2, LoaderCircle, Shuffle } from "@lucide/svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import { scatterCarousel } from "#lib/carousel-scatter.js";
	import { gridLayout, masonryLayout } from "#lib/collage-layout.js";
	import FileDropZone from "#lib/components/file-drop-zone.svelte";
	import { Button, buttonVariants } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Select } from "#lib/components/ui/select/index.js";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { downloadBlob } from "#lib/download.js";
	import { loadImage } from "#lib/image.js";
	import { cn } from "#lib/utils.js";

	type LayoutMode = "grid" | "masonry" | "scattered";
	type EdgeStyle = "crisp" | "shadow" | "feather";
	type BackgroundType = "color" | "gradient" | "image";
	type LoadedImage = {
		file: File;
		source: CanvasImageSource;
		width: number;
		height: number;
		focusX: number;
		focusY: number;
		previewUrl: string;
		cleanup: () => void;
	};

	type FaceDetectorConstructor = new (options?: {
		fastMode?: boolean;
		maxDetectedFaces?: number;
	}) => {
		detect: (image: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
	};

	type TfjsFace = {
		box: {
			xMin: number;
			yMin: number;
			width: number;
			height: number;
		};
	};

	type TfjsFaceDetector = {
		estimateFaces: (input: CanvasImageSource) => Promise<TfjsFace[]>;
		dispose?: () => void;
	};

	const aspectRatios = [
		{ value: "1:1", label: "Square (1:1)", ratio: 1 },
		{ value: "4:5", label: "Portrait (4:5)", ratio: 4 / 5 },
		{ value: "3:2", label: "Classic (3:2)", ratio: 3 / 2 },
		{ value: "16:9", label: "Widescreen (16:9)", ratio: 16 / 9 },
		{ value: "9:16", label: "Story (9:16)", ratio: 9 / 16 },
	];

	const layoutOptions: { value: LayoutMode; name: string; desc: string }[] = [
		{ value: "grid", name: "Grid", desc: "Even rows, every photo included" },
		{ value: "masonry", name: "Masonry", desc: "Columns of varied heights" },
		{ value: "scattered", name: "Scattered", desc: "Loose, layered prints" },
	];

	const edgeOptions: { value: EdgeStyle; label: string }[] = [
		{ value: "crisp", label: "Crisp" },
		{ value: "shadow", label: "Shadow" },
		{ value: "feather", label: "Feathered" },
	];

	const allEdges: Edges = { left: true, right: true, top: true, bottom: true };

	let canvasRef: HTMLCanvasElement | null = $state(null);
	let layoutMode = $state<LayoutMode>("grid");
	let aspectRatio = $state("1:1");
	let resolution = $state(2000);
	let columns = $state(3);
	let gap = $state(16);
	let seed = $state(42042);
	let outerMargin = $state(0);
	let faceDetectionEnabled = $state(false);
	let faceDetectorSupported = $state(false);
	let detectionError = $state("");
	let detectionTotal = $state(0);
	let detectionCount = $state(0);
	let detectionComplete = $state(false);

	let images = $state<LoadedImage[]>([]);
	let error = $state("");
	let loadingImages = $state(false);
	let loadingTotal = $state(0);
	let loadingCount = $state(0);
	let dragIndex: number | null = $state(null);
	let dragOverIndex: number | null = $state(null);

	let backgroundType = $state<BackgroundType>("color");
	let backgroundColor = $state("#0f172a");
	let gradientColorStart = $state("#1d4ed8");
	let gradientColorEnd = $state("#9333ea");
	let gradientAngle = $state(135);
	let backgroundFile = $state<File | null>(null);
	let backgroundImage: HTMLImageElement | null = $state(null);
	let backgroundUrl = $state<string | null>(null);

	let edgeStyle = $state<EdgeStyle>("crisp");
	let featherAmount = $state(48);
	let roundedCorners = $state(false);
	let cornerRadius = $state(24);
	let detectionRun = 0;
	let detectionInProgress = $state(false);
	let scatterSize = $state(50);
	let scatterSpread = $state(35);
	let scatterTilt = $state(5);
	let exportFormat: "png" | "jpg" = $state("png");
	let jpgQuality = $state(92);
	let tfjsDetector: TfjsFaceDetector | null = null;
	let tfjsLoading = $state(false);

	let tileCanvas: HTMLCanvasElement | null = null;
	let blendCanvas: HTMLCanvasElement | null = null;

	const selectedRatio = $derived(
		aspectRatios.find(option => option.value === aspectRatio)?.ratio ?? 1,
	);
	const canvasWidth = $derived(Math.max(200, Math.round(resolution)));
	const canvasHeight = $derived(Math.max(200, Math.round(resolution / selectedRatio)));
	const maxImageDimension = $derived(Math.round(Math.max(canvasWidth, canvasHeight) * 1.5));

	const edgeDescription = $derived.by(() => {
		if (edgeStyle === "shadow")
			return "A soft shadow lifts each photo off the background.";
		if (edgeStyle === "crisp")
			return "Clean, hard edges.";
		return layoutMode === "scattered"
			? "Each photo fades out softly at its edges."
			: "Neighbouring photos fade into each other with no gap; the outer edges stay sharp.";
	});

	// drawCanvas reads every setting it depends on, so Svelte tracks them itself.
	$effect(() => {
		if (!loadingImages)
			drawCanvas();
	});

	onMount(() => {
		faceDetectorSupported = typeof window !== "undefined" && (
			"FaceDetector" in window || "WebGLRenderingContext" in window
		);
	});

	onDestroy(() => {
		clearImages();
		clearBackgroundImage();
		tfjsDetector?.dispose?.();
	});

	function clearImages() {
		images.forEach(image => image.cleanup());
		images = [];
		loadingImages = false;
		loadingTotal = 0;
		loadingCount = 0;
	}

	function removeImageAt(index: number) {
		const next = [...images];
		const [removed] = next.splice(index, 1);
		if (removed)
			removed.cleanup();
		images = next;
	}

	function handleReorderDragOver(event: DragEvent, index: number) {
		if (dragIndex === null)
			return;
		event.preventDefault();
		dragOverIndex = dragIndex === index ? null : index;
	}

	function handleReorderDrop(event: DragEvent, index: number) {
		// Left alone, some browsers follow the dragged thumbnail's URL and leave the page.
		event.preventDefault();
		if (dragIndex !== null && dragIndex !== index) {
			const next = [...images];
			const [moved] = next.splice(dragIndex, 1);
			next.splice(index, 0, moved);
			images = next;
		}
		handleReorderDragEnd();
	}

	async function moveImage(index: number, offset: -1 | 1, event: MouseEvent) {
		const target = index + offset;
		if (target < 0 || target >= images.length)
			return;
		const next = [...images];
		[next[index], next[target]] = [next[target], next[index]];
		images = next;
		// Moving the thumbnail in the page can drop focus from the button that moved it.
		const button = event.currentTarget as HTMLButtonElement;
		await tick();
		button.focus();
	}

	function handleReorderDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}

	function clearBackgroundImage() {
		if (backgroundUrl)
			URL.revokeObjectURL(backgroundUrl);
		backgroundUrl = null;
		backgroundFile = null;
		backgroundImage = null;
	}

	async function loadFileAsImage(file: File): Promise<LoadedImage> {
		const maxDimension = Math.max(200, maxImageDimension);
		if ("createImageBitmap" in window) {
			const bitmap = await createImageBitmap(file);
			const previewUrl = URL.createObjectURL(file);
			let source: CanvasImageSource = bitmap;
			let width = bitmap.width;
			let height = bitmap.height;
			if (Math.max(width, height) > maxDimension) {
				const scale = maxDimension / Math.max(width, height);
				const targetWidth = Math.max(1, Math.round(width * scale));
				const targetHeight = Math.max(1, Math.round(height * scale));
				const canvas = document.createElement("canvas");
				canvas.width = targetWidth;
				canvas.height = targetHeight;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
					source = canvas;
					width = targetWidth;
					height = targetHeight;
				}
				bitmap.close?.();
			}
			return {
				file,
				source,
				width,
				height,
				focusX: 0.5,
				focusY: 0.5,
				previewUrl,
				cleanup: () => {
					if (source === bitmap)
						bitmap.close?.();
					URL.revokeObjectURL(previewUrl);
				},
			};
		}

		const url = URL.createObjectURL(file);
		try {
			const image = await loadImage(url);
			let source: CanvasImageSource = image;
			let width = image.width;
			let height = image.height;
			if (Math.max(width, height) > maxDimension) {
				const scale = maxDimension / Math.max(width, height);
				const targetWidth = Math.max(1, Math.round(width * scale));
				const targetHeight = Math.max(1, Math.round(height * scale));
				const canvas = document.createElement("canvas");
				canvas.width = targetWidth;
				canvas.height = targetHeight;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
					source = canvas;
					width = targetWidth;
					height = targetHeight;
				}
			}
			return {
				file,
				source,
				width,
				height,
				focusX: 0.5,
				focusY: 0.5,
				previewUrl: url,
				cleanup: () => URL.revokeObjectURL(url),
			};
		}
		catch (err) {
			URL.revokeObjectURL(url);
			throw err;
		}
	}

	async function addImages(files: File[]) {
		// Dropping a thumbnail on the drop zone while reordering arrives as an empty file list.
		if (files.length === 0)
			return;
		const filtered = files.filter(file => file.type.startsWith("image/"));
		if (filtered.length === 0) {
			error = "Please select at least one image file.";
			return;
		}

		error = "";
		loadingImages = true;
		loadingTotal = filtered.length;
		loadingCount = 0;
		detectionComplete = false;
		const loaded: LoadedImage[] = [];
		const batchSize = 3;
		try {
			for (let index = 0; index < filtered.length; index += batchSize) {
				const batch = filtered.slice(index, index + batchSize);
				const results = await Promise.all(batch.map(file => loadFileAsImage(file)));
				loaded.push(...results);
				loadingCount = loaded.length;
				await new Promise<void>((resolve) => {
					requestAnimationFrame(() => resolve());
				});
			}
			images = [...images, ...loaded];
		}
		finally {
			loadingImages = false;
		}
		if (faceDetectionEnabled && faceDetectorSupported)
			void runFaceDetection();
	}

	async function handleBackgroundSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file || !file.type.startsWith("image/"))
			return;

		clearBackgroundImage();
		backgroundFile = file;
		backgroundUrl = URL.createObjectURL(file);
		backgroundImage = await loadImage(backgroundUrl);
	}

	function randomizeSeed() {
		seed = Math.floor(Math.random() * 1_000_000_000);
	}

	function resetFocusToCenter() {
		if (images.length === 0)
			return;
		const needsReset = images.some(item => item.focusX !== 0.5 || item.focusY !== 0.5);
		if (!needsReset)
			return;
		images = images.map(item => ({
			...item,
			focusX: 0.5,
			focusY: 0.5,
		}));
	}

	function handleFaceToggle() {
		detectionError = "";
		detectionComplete = false;
		if (!faceDetectionEnabled || !faceDetectorSupported) {
			resetFocusToCenter();
			return;
		}
		void runFaceDetection();
	}

	async function getTfjsDetector(): Promise<TfjsFaceDetector | null> {
		if (tfjsDetector)
			return tfjsDetector;
		if (tfjsLoading)
			return null;
		if (typeof window === "undefined")
			return null;
		try {
			tfjsLoading = true;
			detectionError = "";
			const tf = await import("@tensorflow/tfjs-core");
			await import("@tensorflow/tfjs-backend-webgl");
			await tf.setBackend("webgl");
			await tf.ready();
			const faceDetection = await import("@tensorflow-models/face-detection");
			const detector = await faceDetection.createDetector(
				faceDetection.SupportedModels.MediaPipeFaceDetector,
				{ runtime: "tfjs", modelType: "short", detectorModelUrl: asset("models/face-detection-short/model.json") },
			);
			tfjsDetector = detector as unknown as TfjsFaceDetector;
			return tfjsDetector;
		}
		catch (err) {
			detectionError = (err as Error).message || "Face detection failed to initialize.";
			return null;
		}
		finally {
			tfjsLoading = false;
		}
	}

	async function runFaceDetection() {
		if (!faceDetectionEnabled || !faceDetectorSupported || images.length === 0 || loadingImages)
			return;
		if (detectionInProgress)
			return;

		const FaceDetectorApi = (window as Window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
		const runId = detectionRun + 1;
		detectionRun = runId;
		detectionInProgress = true;
		detectionError = "";
		detectionComplete = false;

		detectionTotal = images.length;
		detectionCount = 0;
		await tick();
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
		const nativeDetector = FaceDetectorApi
			? new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 4 })
			: null;
		const tfDetector = nativeDetector ? null : await getTfjsDetector();

		if (!nativeDetector && !tfDetector) {
			detectionInProgress = false;
			return;
		}

		// Keyed by preview URL so photos reordered or removed mid-run keep the right focus.
		const focusByPreview: Record<string, { focusX: number; focusY: number }> = {};
		const checked: Record<string, true> = {};
		// Taken from the live list each time, so photos added mid-run are checked too.
		const nextUnchecked = () => images.find(item => !checked[item.previewUrl]);
		for (let item = nextUnchecked(); item; item = nextUnchecked()) {
			if (detectionRun !== runId)
				break;
			checked[item.previewUrl] = true;
			detectionTotal = images.length;
			try {
				const faces = nativeDetector
					? await nativeDetector.detect(item.source)
					: await (tfDetector
						? tfDetector.estimateFaces(item.source)
						: Promise.resolve([]));

				if (faces.length > 0) {
					const centers = faces.map((face: { boundingBox?: { x: number; y: number; width: number; height: number }; box?: { xMin: number; yMin: number; width: number; height: number } }) => {
						const box = face.boundingBox
							? {
								x: face.boundingBox.x,
								y: face.boundingBox.y,
								width: face.boundingBox.width,
								height: face.boundingBox.height,
							}
							: {
								x: face.box?.xMin ?? 0,
								y: face.box?.yMin ?? 0,
								width: face.box?.width ?? 0,
								height: face.box?.height ?? 0,
							};
						return {
							x: box.x + box.width / 2,
							y: box.y + box.height / 2,
						};
					});
					const avgX
						= centers.reduce((sum: number, current: { x: number; y: number }) => sum + current.x, 0)
							/ centers.length;
					const avgY
						= centers.reduce((sum: number, current: { x: number; y: number }) => sum + current.y, 0)
							/ centers.length;
					focusByPreview[item.previewUrl] = {
						focusX: Math.min(1, Math.max(0, avgX / item.width)),
						focusY: Math.min(1, Math.max(0, avgY / item.height)),
					};
				}
			}
			catch (err) {
				detectionError = (err as Error).message || "Face detection failed.";
			}
			detectionCount += 1;
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
		}

		detectionInProgress = false;
		if (detectionRun === runId) {
			detectionCount = detectionTotal;
			detectionComplete = true;
			if (Object.keys(focusByPreview).length > 0)
				images = images.map(item => ({ ...item, ...focusByPreview[item.previewUrl] }));
		}
	}

	function drawImageCover(
		ctx: CanvasRenderingContext2D,
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
		x: number,
		y: number,
		width: number,
		height: number,
		focusX = 0.5,
		focusY = 0.5,
	) {
		const imageRatio = sourceWidth / sourceHeight;
		const rectRatio = width / height;
		let drawWidth = width;
		let drawHeight = height;
		let offsetX = 0;
		let offsetY = 0;

		if (imageRatio > rectRatio) {
			drawWidth = height * imageRatio;
			const overflow = drawWidth - width;
			offsetX = -overflow * focusX;
		}
		else {
			drawHeight = width / imageRatio;
			const overflow = drawHeight - height;
			offsetY = -overflow * focusY;
		}

		ctx.drawImage(source, x + offsetX, y + offsetY, drawWidth, drawHeight);
	}

	/** Fades the tile out over `feather` pixels along each of the given edges. */
	function applyFeatherMask(ctx: CanvasRenderingContext2D, width: number, height: number, edges: Edges, feather: number) {
		const fades = [
			{ on: edges.left, from: [0, 0], to: [feather, 0] },
			{ on: edges.right, from: [width, 0], to: [width - feather, 0] },
			{ on: edges.top, from: [0, 0], to: [0, feather] },
			{ on: edges.bottom, from: [0, height], to: [0, height - feather] },
		];

		ctx.save();
		ctx.globalCompositeOperation = "destination-in";
		for (const fade of fades) {
			if (!fade.on)
				continue;
			const gradient = ctx.createLinearGradient(fade.from[0], fade.from[1], fade.to[0], fade.to[1]);
			gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		ctx.restore();
	}

	function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(0, 0, width, height);

		if (backgroundType === "gradient") {
			const angleRad = (gradientAngle * Math.PI) / 180;
			const halfWidth = width / 2;
			const halfHeight = height / 2;
			const x0 = halfWidth - Math.cos(angleRad) * halfWidth;
			const y0 = halfHeight - Math.sin(angleRad) * halfHeight;
			const x1 = halfWidth + Math.cos(angleRad) * halfWidth;
			const y1 = halfHeight + Math.sin(angleRad) * halfHeight;
			const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
			gradient.addColorStop(0, gradientColorStart);
			gradient.addColorStop(1, gradientColorEnd);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}
		else if (backgroundType === "image" && backgroundImage) {
			drawImageCover(ctx, backgroundImage, backgroundImage.width, backgroundImage.height, 0, 0, width, height);
		}
	}

	function layoutPlacements(frame: Frame): Placement[] {
		const safeColumns = Math.max(1, Math.floor(columns) || 1);
		// Feathered tiles cross-fade into each other, which only works if they meet.
		const safeGap = edgeStyle === "feather" ? 0 : Math.max(0, gap || 0);
		if (layoutMode === "grid")
			return gridLayout(images.length, frame, safeColumns, safeGap);
		if (layoutMode === "masonry")
			return masonryLayout(images, frame, safeColumns, safeGap);

		// A scattered collage is a carousel with a single slide holding every photo.
		const density = scatterSize / 100;
		const { placements } = scatterCarousel(images, {
			slideWidth: frame.width,
			slideHeight: frame.height,
			perSlide: images.length,
			spread: scatterSpread,
			tilt: scatterTilt,
			seed,
			coverage: 0.5 + density * 0.7,
			maxOverlap: 0.1 + density * 0.22,
			maxShare: 0.55 + density * 0.4,
		});
		return placements.map(photo => ({
			index: photo.index,
			x: frame.x + photo.cx - photo.width / 2,
			y: frame.y + photo.cy - photo.height / 2,
			width: photo.width,
			height: photo.height,
			edges: allEdges,
			rotation: photo.rotation,
		}));
	}

	/**
	 * Renders one photo, cropped and styled, onto a scratch canvas and stamps it into place.
	 * With `blend`, the tile grows across its inner edges so its fade overlaps its neighbour's.
	 */
	function drawTile(ctx: CanvasRenderingContext2D, placement: Placement, feather: number, blend: boolean, shadow: number) {
		tileCanvas ??= document.createElement("canvas");
		const tileContext = tileCanvas.getContext("2d");
		if (!tileContext)
			return;

		const item = images[placement.index];
		const rotated = placement.rotation !== 0;
		const grow = blend ? feather / 2 : 0;
		// Upright tiles sit on whole pixels so they stay sharp and their gaps stay even.
		const snap = rotated ? (value: number) => value : Math.round;
		const left = snap(placement.x) - (placement.edges.left ? grow : 0);
		const top = snap(placement.y) - (placement.edges.top ? grow : 0);
		const right = snap(placement.x + placement.width) + (placement.edges.right ? grow : 0);
		const bottom = snap(placement.y + placement.height) + (placement.edges.bottom ? grow : 0);
		const width = right - left;
		const height = bottom - top;
		const tileWidth = Math.max(1, Math.round(width));
		const tileHeight = Math.max(1, Math.round(height));
		tileCanvas.width = tileWidth;
		tileCanvas.height = tileHeight;

		tileContext.save();
		if (roundedCorners) {
			tileContext.beginPath();
			tileContext.roundRect(0, 0, tileWidth, tileHeight, Math.max(0, Math.min(cornerRadius || 0, tileWidth / 2, tileHeight / 2)));
			tileContext.clip();
		}
		drawImageCover(tileContext, item.source, item.width, item.height, 0, 0, tileWidth, tileHeight, item.focusX, item.focusY);
		tileContext.restore();
		if (feather > 0)
			applyFeatherMask(tileContext, tileWidth, tileHeight, placement.edges, Math.min(feather, tileWidth / 2, tileHeight / 2));

		ctx.save();
		if (shadow > 0) {
			ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
			ctx.shadowBlur = shadow;
			ctx.shadowOffsetY = shadow / 2;
		}
		if (rotated) {
			ctx.translate(left + width / 2, top + height / 2);
			ctx.rotate(placement.rotation);
			ctx.drawImage(tileCanvas, -width / 2, -height / 2, width, height);
		}
		else {
			ctx.drawImage(tileCanvas, left, top);
		}
		ctx.restore();
	}

	function drawCanvas() {
		if (!canvasRef)
			return;

		const width = canvasWidth;
		const height = canvasHeight;
		canvasRef.width = width;
		canvasRef.height = height;
		const ctx = canvasRef.getContext("2d");
		if (!ctx)
			return;

		drawBackground(ctx, width, height);

		if (images.length === 0) {
			// A dark plate keeps the hint readable over any background.
			const hint = "Add photos to preview your collage";
			const fontSize = Math.round(width * 0.035);
			ctx.font = `600 ${fontSize}px system-ui`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			const plateWidth = ctx.measureText(hint).width + fontSize * 2;
			ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
			ctx.beginPath();
			ctx.roundRect((width - plateWidth) / 2, height / 2 - fontSize * 1.2, plateWidth, fontSize * 2.4, fontSize * 1.2);
			ctx.fill();
			ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
			ctx.fillText(hint, width / 2, height / 2);
			return;
		}

		const framePadding = Math.max(0, outerMargin || 0);
		const placements = layoutPlacements({
			x: framePadding,
			y: framePadding,
			width: Math.max(1, width - framePadding * 2),
			height: Math.max(1, height - framePadding * 2),
		});
		const shadow = edgeStyle === "shadow" ? Math.round(Math.min(width, height) * 0.016) : 0;

		if (edgeStyle !== "feather") {
			for (const placement of placements)
				drawTile(ctx, placement, 0, false, shadow);
			return;
		}

		if (layoutMode === "scattered") {
			for (const placement of placements)
				drawTile(ctx, placement, Math.max(0, featherAmount || 0), false, 0);
			return;
		}

		// Grid and masonry tiles overlap by one shared feather width and are summed rather than
		// stacked, so each seam is a true cross-fade between neighbours with no background showing.
		const smallestSide = Math.min(...placements.flatMap(placement => [placement.width, placement.height]));
		const feather = Math.floor(Math.max(0, Math.min(featherAmount || 0, smallestSide / 2)) / 2) * 2;
		blendCanvas ??= document.createElement("canvas");
		blendCanvas.width = width;
		blendCanvas.height = height;
		const blendContext = blendCanvas.getContext("2d");
		if (!blendContext)
			return;
		blendContext.globalCompositeOperation = "lighter";
		for (const placement of placements)
			drawTile(blendContext, placement, feather, true, 0);
		ctx.drawImage(blendCanvas, 0, 0);
	}

	function downloadCollage() {
		if (!canvasRef)
			return;
		const mime = exportFormat === "jpg" ? "image/jpeg" : "image/png";
		const quality = exportFormat === "jpg" ? Math.min(1, Math.max(0.6, jpgQuality / 100)) : undefined;
		canvasRef.toBlob((blob) => {
			if (!blob)
				return;
			downloadBlob(blob, `collage.${exportFormat}`);
		}, mime, quality);
	}
</script>

<svelte:head>
	<title>Collage Creator</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight"><Grid2x2 class="text-primary size-7" /> Collage Creator</h1>
	<p class="text-muted-foreground mb-8">Build clean grids, bold masonry layouts, or scattered collages in seconds.</p>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
		<Card.Root>
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Upload Images</Card.Title>
				{#if images.length > 0}
					<Button variant="outline" size="sm" onclick={clearImages}>Clear All</Button>
				{/if}
			</Card.Header>
			<Card.Content class="space-y-4">
				<FileDropZone accept="image/*" label="Drag & drop images here" multiple onfiles={addImages}>
					{#if images.length > 0}
						<p class="text-muted-foreground text-sm">{images.length} image{images.length === 1 ? "" : "s"} ready</p>
					{/if}
				</FileDropZone>
				{#if loadingImages}
					<div class="text-muted-foreground flex items-center gap-2 text-sm">
						<LoaderCircle class="size-4 animate-spin" />
						<span>Loading {loadingCount} of {loadingTotal} images…</span>
					</div>
				{/if}
				{#if error}
					<div class="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">{error}</div>
				{/if}
				{#if images.length > 0}
					{#if images.length > 1}
						<p class="text-muted-foreground text-sm">💡 Drag images to reorder, or use the arrows on each one</p>
					{/if}
					<div class="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
						{#each images as image, index (image.previewUrl)}
							<div
								class={cn(
									"group relative overflow-hidden rounded-md border",
									dragIndex === index && "opacity-50",
									dragOverIndex === index && "ring-primary ring-2",
								)}
								draggable="true"
								ondragstart={() => (dragIndex = index)}
								ondragover={event => handleReorderDragOver(event, index)}
								ondrop={event => handleReorderDrop(event, index)}
								ondragend={handleReorderDragEnd}
								role="listitem"
							>
								<img src={image.previewUrl} alt="Preview {index + 1}" class="aspect-square w-full cursor-grab object-cover" />
								<button
									type="button"
									class="bg-background/80 hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 flex size-6 items-center justify-center rounded-full text-xs opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
									aria-label="Remove image {index + 1}"
									onclick={() => removeImageAt(index)}
								>✕</button>
								{#if images.length > 1}
									<div class="absolute right-1 bottom-1 flex gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
										<button
											type="button"
											class="bg-background/80 hover:bg-accent flex size-6 items-center justify-center rounded-full aria-disabled:opacity-40"
											aria-label="Move image {index + 1} earlier"
											aria-disabled={index === 0}
											onclick={event => moveImage(index, -1, event)}
										><ChevronLeft class="size-3.5" /></button>
										<button
											type="button"
											class="bg-background/80 hover:bg-accent flex size-6 items-center justify-center rounded-full aria-disabled:opacity-40"
											aria-label="Move image {index + 1} later"
											aria-disabled={index === images.length - 1}
											onclick={event => moveImage(index, 1, event)}
										><ChevronRight class="size-3.5" /></button>
									</div>
								{/if}
								<span class="bg-background/80 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">{index + 1}</span>
							</div>
						{/each}
					</div>
					<div class="space-y-2">
						<Label class="font-normal">
							<Checkbox bind:checked={faceDetectionEnabled} disabled={!faceDetectorSupported} onCheckedChange={handleFaceToggle} />
							Face-aware Positioning
						</Label>
						<p class="text-muted-foreground text-sm">
							{#if faceDetectorSupported}
								Detect faces and keep them centered in each crop.
							{:else}
								Face detection is not supported in this browser.
							{/if}
						</p>
						{#if faceDetectionEnabled && (tfjsLoading || detectionInProgress)}
							<p class="text-muted-foreground text-sm">Detecting faces…</p>
							{#if detectionTotal > 0}
								<div class="flex items-center gap-2">
									<div class="bg-muted h-2 flex-1 overflow-hidden rounded-full">
										<div class="bg-primary h-full transition-all" style="width: {Math.min(100, Math.round((detectionCount / detectionTotal) * 100))}%;"></div>
									</div>
									<span class="text-muted-foreground text-xs">{Math.min(100, Math.round((detectionCount / detectionTotal) * 100))}%</span>
								</div>
							{/if}
						{/if}
						{#if faceDetectionEnabled && detectionComplete}
							<p class="text-sm text-emerald-600 dark:text-emerald-400">Face detection complete ✓</p>
						{/if}
						{#if detectionError}
							<p class="text-sm text-amber-600 dark:text-amber-400">{detectionError}</p>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
			<Card.Header class="flex-row items-center justify-between space-y-0">
				<Card.Title>Preview</Card.Title>
				<span class="text-muted-foreground text-sm">{canvasWidth} × {canvasHeight}px</span>
			</Card.Header>
			<Card.Content class="space-y-4">
				<canvas bind:this={canvasRef} class="bg-muted mx-auto block max-h-[65vh] max-w-full rounded-lg border"></canvas>
				<div class="flex flex-wrap items-end gap-3">
					<div class="grid gap-1.5">
						<Label for="exportFormat">Export Format</Label>
						<Select id="exportFormat" bind:value={exportFormat} class="w-28">
							<option value="png">PNG</option>
							<option value="jpg">JPEG</option>
						</Select>
					</div>
					{#if exportFormat === "jpg"}
						<div class="grid gap-1.5">
							<Label for="jpgQuality">JPEG Quality</Label>
							<Input id="jpgQuality" type="number" min={60} max={100} step={1} bind:value={jpgQuality} class="w-24" />
						</div>
					{/if}
					<Button class="ml-auto" onclick={downloadCollage} disabled={images.length === 0}>
						<Download class="size-4" />
						Download {exportFormat === "png" ? "PNG" : "JPEG"}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="space-y-6 lg:col-start-1">
			<Card.Root>
				<Card.Header><Card.Title>Canvas Settings</Card.Title></Card.Header>
				<Card.Content>
					<div class="grid grid-cols-2 gap-3">
						<div class="grid gap-1.5">
							<Label for="aspectRatio">Aspect Ratio</Label>
							<Select id="aspectRatio" bind:value={aspectRatio}>
								{#each aspectRatios as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
						</div>
						<div class="grid gap-1.5">
							<Label for="resolution">Resolution (width px)</Label>
							<Input id="resolution" type="number" min={600} max={8000} step={10} bind:value={resolution} />
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header><Card.Title>Layout</Card.Title></Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-3 sm:grid-cols-3">
						{#each layoutOptions as option (option.value)}
							<button
								type="button"
								class={cn("flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors", layoutMode === option.value ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}
								onclick={() => (layoutMode = option.value)}
							>
								<span class="font-semibold">{option.name}</span>
								<span class="text-muted-foreground text-sm">{option.desc}</span>
							</button>
						{/each}
					</div>
					{#if layoutMode === "scattered"}
						<div class="grid gap-1.5">
							<Label for="scatterSize">Photo Size ({scatterSize}%)</Label>
							<div class="flex h-9 items-center"><Slider id="scatterSize" type="single" min={0} max={100} bind:value={scatterSize} /></div>
						</div>
						<div class="grid gap-1.5">
							<Label for="scatterSpread">Spread ({scatterSpread}%)</Label>
							<div class="flex h-9 items-center"><Slider id="scatterSpread" type="single" min={0} max={100} bind:value={scatterSpread} /></div>
						</div>
						<div class="grid gap-1.5">
							<Label for="scatterTilt">Tilt ({scatterTilt}°)</Label>
							<div class="flex h-9 items-center"><Slider id="scatterTilt" type="single" min={0} max={15} bind:value={scatterTilt} /></div>
						</div>
					{/if}
					<div class="flex flex-wrap items-end gap-3">
						{#if layoutMode !== "scattered"}
							<div class="grid w-24 gap-1.5">
								<Label for="columns">Columns</Label>
								<Input id="columns" type="number" min={1} max={8} bind:value={columns} />
							</div>
							{#if edgeStyle !== "feather"}
								<div class="grid w-24 gap-1.5">
									<Label for="gap">Gap (px)</Label>
									<Input id="gap" type="number" min={0} max={200} step={1} bind:value={gap} />
								</div>
							{/if}
						{/if}
						<div class="grid w-32 gap-1.5">
							<Label for="outerMargin">Outer Margin (px)</Label>
							<Input id="outerMargin" type="number" min={0} max={300} step={1} bind:value={outerMargin} />
						</div>
						{#if layoutMode === "scattered"}
							<Button variant="outline" onclick={randomizeSeed}><Shuffle class="size-4" /> Randomize</Button>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header><Card.Title>Photo Style</Card.Title></Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-1.5">
						<Label>Edges</Label>
						<div class="flex flex-wrap gap-2">
							{#each edgeOptions as option (option.value)}
								<Button variant={edgeStyle === option.value ? "default" : "outline"} size="sm" onclick={() => (edgeStyle = option.value)}>{option.label}</Button>
							{/each}
						</div>
						<p class="text-muted-foreground text-sm">{edgeDescription}</p>
					</div>
					{#if edgeStyle === "feather"}
						<div class="grid gap-1.5">
							<Label for="featherAmount">Feather Strength ({featherAmount}px)</Label>
							<div class="flex h-9 items-center"><Slider id="featherAmount" type="single" min={4} max={240} bind:value={featherAmount} /></div>
						</div>
					{/if}
					<Label class="font-normal"><Checkbox bind:checked={roundedCorners} /> Rounded Corners</Label>
					{#if roundedCorners}
						<div class="grid gap-1.5">
							<Label for="cornerRadius">Corner Radius ({cornerRadius}px)</Label>
							<div class="flex h-9 items-center"><Slider id="cornerRadius" type="single" min={0} max={160} bind:value={cornerRadius} /></div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header><Card.Title>Background</Card.Title></Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-1.5 sm:max-w-xs">
						<Label for="backgroundType">Background Type</Label>
						<Select id="backgroundType" bind:value={backgroundType}>
							<option value="color">Solid Color</option>
							<option value="gradient">Gradient</option>
							<option value="image">Image</option>
						</Select>
					</div>
					{#if backgroundType === "color"}
						<div class="flex flex-wrap items-center gap-4">
							<div class="size-16 shrink-0 rounded-lg border" style="background: {backgroundColor};"></div>
							<div class="flex items-center gap-2">
								<input id="backgroundColor" type="color" bind:value={backgroundColor} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
								<Input type="text" bind:value={backgroundColor} class="w-28 font-mono" />
							</div>
						</div>
					{:else if backgroundType === "gradient"}
						<div class="space-y-4">
							<div class="h-24 w-full rounded-lg border" style="background: linear-gradient({gradientAngle}deg, {gradientColorStart}, {gradientColorEnd});"></div>
							<div class="flex flex-wrap items-end gap-4">
								<div class="flex items-center gap-2">
									<input id="gradientColorStart" type="color" bind:value={gradientColorStart} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
									<Input type="text" bind:value={gradientColorStart} class="w-28 font-mono" />
								</div>
								<div class="flex items-center gap-2">
									<input id="gradientColorEnd" type="color" bind:value={gradientColorEnd} class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
									<Input type="text" bind:value={gradientColorEnd} class="w-28 font-mono" />
								</div>
								<div class="grid gap-1.5">
									<Label for="gradientAngle">Angle</Label>
									<Input id="gradientAngle" type="number" min={0} max={360} bind:value={gradientAngle} class="w-24" />
								</div>
							</div>
						</div>
					{:else}
						<div class="flex flex-wrap items-center gap-4">
							{#if backgroundUrl}
								<img src={backgroundUrl} alt="Background preview" class="size-20 rounded-lg border object-cover" />
							{/if}
							<label class={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
								{backgroundFile ? "Replace Image" : "Upload Image"}
								<input id="backgroundImage" type="file" accept="image/*" onchange={handleBackgroundSelect} hidden />
							</label>
							{#if backgroundFile}
								<Button variant="outline" onclick={clearBackgroundImage}>Remove</Button>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</main>
