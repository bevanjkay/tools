<script lang="ts">
	import { base } from "$app/paths";
	import { onDestroy, onMount, tick } from "svelte";

	type LayoutMode = "grid" | "masonry" | "scattered";
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

	let backgroundType = $state<BackgroundType>("color");
	let backgroundColor = $state("#0f172a");
	let gradientColorStart = $state("#1d4ed8");
	let gradientColorEnd = $state("#9333ea");
	let gradientAngle = $state(135);
	let backgroundFile = $state<File | null>(null);
	let backgroundImage: HTMLImageElement | null = $state(null);
	let backgroundUrl = $state<string | null>(null);

	let featherEnabled = $state(false);
	let featherAmount = $state(24);
	const overlapAmount = $state(0);
	let roundedCorners = $state(false);
	let cornerRadius = $state(24);
	let detectionRun = 0;
	let detectionInProgress = $state(false);
	let scatterVariation = $state(35);
	let exportFormat: "png" | "jpg" = $state("png");
	let jpgQuality = $state(92);
	let tfjsDetector: TfjsFaceDetector | null = null;
	let tfjsLoading = $state(false);

	let drawHandle: number | null = null;
	let maskCanvas: HTMLCanvasElement | null = null;
	let maskContext: CanvasRenderingContext2D | null = null;

	const selectedRatio = $derived(
		aspectRatios.find(option => option.value === aspectRatio)?.ratio ?? 1,
	);
	const canvasWidth = $derived(Math.max(200, Math.round(resolution)));
	const canvasHeight = $derived(Math.max(200, Math.round(resolution / selectedRatio)));
	const safeColumns = $derived(Math.max(1, Math.floor(columns)));
	const maxImageDimension = $derived(Math.round(Math.max(canvasWidth, canvasHeight) * 1.5));

	const gridDropCount = $derived(
		layoutMode !== "grid" || images.length === 0 ? 0 : images.length % safeColumns,
	);

	const usableImages = $derived((() => {
		if (layoutMode !== "grid")
			return images;
		if (gridDropCount === 0)
			return images;
		return images.slice(0, images.length - gridDropCount);
	})());

	$effect(() => {
		void layoutMode;
		void aspectRatio;
		void resolution;
		void columns;
		void gap;
		void seed;
		void scatterVariation;
		void outerMargin;
		void images;
		void backgroundType;
		void backgroundColor;
		void gradientColorStart;
		void gradientColorEnd;
		void gradientAngle;
		void backgroundImage;
		void featherEnabled;
		void featherAmount;
		void overlapAmount;
		void roundedCorners;
		void cornerRadius;
		queueDraw();
	});

	onMount(() => {
		faceDetectorSupported = typeof window !== "undefined" && (
			"FaceDetector" in window || "WebGLRenderingContext" in window
		);
	});

	onDestroy(() => {
		if (drawHandle !== null)
			cancelAnimationFrame(drawHandle);
		clearImages();
		clearBackgroundImage();
		tfjsDetector?.dispose?.();
	});

	function queueDraw() {
		if (!canvasRef)
			return;
		if (loadingImages)
			return;
		if (drawHandle !== null)
			cancelAnimationFrame(drawHandle);
		drawHandle = requestAnimationFrame(() => {
			drawHandle = null;
			drawCanvas();
		});
	}

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

	function clearBackgroundImage() {
		if (backgroundUrl)
			URL.revokeObjectURL(backgroundUrl);
		backgroundUrl = null;
		backgroundFile = null;
		backgroundImage = null;
	}

	async function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = (event) => {
				const error = new Error(`Failed to load image: ${src}`);
				(error as Error & { event: unknown }).event = event;
				reject(error);
			};
			img.src = src;
		});
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

	async function setImages(files: File[], mode: "replace" | "append" = "replace") {
		if (mode === "replace")
			clearImages();
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
		const loaded: LoadedImage[] = mode === "append" ? [...images] : [];
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
			images = loaded;
		}
		finally {
			loadingImages = false;
			queueDraw();
		}
		if (faceDetectionEnabled && faceDetectorSupported)
			void runFaceDetection();
	}

	async function handleImageSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files ? [...target.files] : [];
		await setImages(files, images.length > 0 ? "append" : "replace");
		if (target)
			target.value = "";
	}

	async function handleImageDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
		await setImages(files, "replace");
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
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
		queueDraw();
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
				{ runtime: "tfjs", modelType: "short" },
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

		const updated: LoadedImage[] = [];
		for (const item of images) {
			if (detectionRun !== runId)
				break;
			try {
				const faces = nativeDetector
					? await nativeDetector.detect(item.source)
					: await (tfDetector
						? tfDetector.estimateFaces(item.source)
						: Promise.resolve([]));

				if (faces.length === 0) {
					updated.push(item);
				}
				else {
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
					updated.push({
						...item,
						focusX: Math.min(1, Math.max(0, avgX / item.width)),
						focusY: Math.min(1, Math.max(0, avgY / item.height)),
					});
				}
			}
			catch (err) {
				detectionError = (err as Error).message || "Face detection failed.";
				updated.push(item);
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
		}
		if (detectionRun === runId && updated.length > 0) {
			images = updated;
			queueDraw();
		}
	}

	function mulberry32(seedValue: number) {
		let t = seedValue;
		return () => {
			t += 0x6D2B79F5;
			let r = Math.imul(t ^ (t >>> 15), t | 1);
			r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
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

	function applyFeatherMask(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		edges: { left: boolean; right: boolean; top: boolean; bottom: boolean },
	) {
		if (!featherEnabled)
			return;

		const feather = Math.max(0, Math.min(featherAmount, Math.min(width, height) / 2));
		if (feather <= 0)
			return;

		ctx.save();
		ctx.globalCompositeOperation = "destination-in";

		if (edges.left) {
			const gradient = ctx.createLinearGradient(0, 0, feather, 0);
			gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}

		if (edges.right) {
			const gradient = ctx.createLinearGradient(width - feather, 0, width, 0);
			gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}

		if (edges.top) {
			const gradient = ctx.createLinearGradient(0, 0, 0, feather);
			gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}

		if (edges.bottom) {
			const gradient = ctx.createLinearGradient(0, height - feather, 0, height);
			gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
		}

		ctx.restore();
	}

	function drawImageWithMask(
		ctx: CanvasRenderingContext2D,
		source: CanvasImageSource,
		sourceWidth: number,
		sourceHeight: number,
		focusX: number,
		focusY: number,
		x: number,
		y: number,
		width: number,
		height: number,
		edges: { left: boolean; right: boolean; top: boolean; bottom: boolean },
		rotation = 0,
		clipRect = false,
	) {
		const needsMask = featherEnabled || roundedCorners;
		const needsRotation = rotation !== 0;

		if (!needsMask && !needsRotation) {
			ctx.save();
			if (clipRect) {
				ctx.beginPath();
				ctx.rect(x, y, width, height);
				ctx.clip();
			}
			if (roundedCorners) {
				ctx.translate(x, y);
				applyRoundedClip(ctx, width, height, cornerRadius);
				drawImageCover(ctx, source, sourceWidth, sourceHeight, 0, 0, width, height, focusX, focusY);
			}
			else {
				drawImageCover(ctx, source, sourceWidth, sourceHeight, x, y, width, height, focusX, focusY);
			}
			ctx.restore();
			return;
		}

		if (!maskCanvas || !maskContext) {
			maskCanvas = document.createElement("canvas");
			maskContext = maskCanvas.getContext("2d");
		}

		const targetWidth = Math.max(1, Math.round(width));
		const targetHeight = Math.max(1, Math.round(height));
		maskCanvas.width = targetWidth;
		maskCanvas.height = targetHeight;
		if (!maskContext)
			return;
		maskContext.clearRect(0, 0, targetWidth, targetHeight);

		maskContext.save();
		if (roundedCorners)
			applyRoundedClip(maskContext, targetWidth, targetHeight, cornerRadius);
		drawImageCover(maskContext, source, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight, focusX, focusY);
		maskContext.restore();
		applyFeatherMask(maskContext, targetWidth, targetHeight, edges);

		ctx.save();
		if (needsRotation) {
			ctx.translate(x + width / 2, y + height / 2);
			ctx.rotate(rotation);
			ctx.drawImage(maskCanvas, -width / 2, -height / 2, width, height);
		}
		else {
			ctx.drawImage(maskCanvas, x, y, width, height);
		}
		ctx.restore();
	}

	function applyRoundedClip(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
		const clamped = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
		if (clamped <= 0)
			return;
		ctx.beginPath();
		ctx.moveTo(clamped, 0);
		ctx.lineTo(width - clamped, 0);
		ctx.quadraticCurveTo(width, 0, width, clamped);
		ctx.lineTo(width, height - clamped);
		ctx.quadraticCurveTo(width, height, width - clamped, height);
		ctx.lineTo(clamped, height);
		ctx.quadraticCurveTo(0, height, 0, height - clamped);
		ctx.lineTo(0, clamped);
		ctx.quadraticCurveTo(0, 0, clamped, 0);
		ctx.closePath();
		ctx.clip();
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

		if (usableImages.length === 0) {
			ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
			ctx.font = "600 18px system-ui";
			ctx.textAlign = "center";
			ctx.fillText("Upload images to preview collage", width / 2, height / 2);
			return;
		}

		const framePadding = Math.max(0, outerMargin);
		const frameX = framePadding;
		const frameY = framePadding;
		const frameWidth = Math.max(1, width - framePadding * 2);
		const frameHeight = Math.max(1, height - framePadding * 2);

		if (layoutMode === "grid") {
			drawGridLayout(ctx, frameX, frameY, frameWidth, frameHeight);
		}
		else if (layoutMode === "masonry") {
			drawMasonryLayout(ctx, frameX, frameY, frameWidth, frameHeight);
		}
		else {
			drawScatteredLayout(ctx, frameX, frameY, frameWidth, frameHeight);
		}
	}

	function drawGridLayout(
		ctx: CanvasRenderingContext2D,
		frameX: number,
		frameY: number,
		frameWidth: number,
		frameHeight: number,
	) {
		const safeColumns = Math.max(1, Math.floor(columns));
		const imagesToUse = usableImages;
		const rows = Math.ceil(imagesToUse.length / safeColumns);
		let safeGap = Math.max(0, gap);
		let availableWidth = frameWidth - safeGap * (safeColumns - 1);
		let availableHeight = frameHeight - safeGap * (rows - 1);
		if (availableWidth <= 0 || availableHeight <= 0) {
			safeGap = 0;
			availableWidth = frameWidth;
			availableHeight = frameHeight;
		}
		const cellWidth = availableWidth / safeColumns;
		const cellHeight = availableHeight / rows;
		const overlap = 0;

		imagesToUse.forEach((item, index) => {
			const col = index % safeColumns;
			const row = Math.floor(index / safeColumns);

			const baseX = frameX + col * (cellWidth + safeGap);
			const baseY = frameY + row * (cellHeight + safeGap);
			const currentCellWidth = col === safeColumns - 1
				? frameX + frameWidth - baseX
				: cellWidth;
			const currentCellHeight = row === rows - 1
				? frameY + frameHeight - baseY
				: cellHeight;
			if (currentCellWidth <= 0 || currentCellHeight <= 0)
				return;

			const extendLeft = col > 0 ? overlap : 0;
			const extendRight = col < safeColumns - 1 ? overlap : 0;
			const extendTop = row > 0 ? overlap : 0;
			const extendBottom = row < rows - 1 ? overlap : 0;

			const rectX = baseX - extendLeft;
			const rectY = baseY - extendTop;
			const rectWidth = currentCellWidth + extendLeft + extendRight;
			const rectHeight = currentCellHeight + extendTop + extendBottom;

			drawImageWithMask(
				ctx,
				item.source,
				item.width,
				item.height,
				item.focusX,
				item.focusY,
				rectX,
				rectY,
				rectWidth,
				rectHeight,
				{
					left: col > 0,
					right: col < safeColumns - 1,
					top: row > 0,
					bottom: row < rows - 1,
				},
				0,
				true,
			);
		});
	}

	function drawMasonryLayout(
		ctx: CanvasRenderingContext2D,
		frameX: number,
		frameY: number,
		frameWidth: number,
		frameHeight: number,
	) {
		const safeColumns = Math.max(1, Math.floor(columns));
		const safeGap = Math.max(0, gap);
		const columnWidth = (frameWidth - safeGap * (safeColumns - 1)) / safeColumns;
		const columnHeights = Array.from({ length: safeColumns }).fill(0) as number[];
		const columnCounts = Array.from({ length: safeColumns }).fill(0) as number[];
		const placements: {
			source: CanvasImageSource;
			sourceWidth: number;
			sourceHeight: number;
			focusX: number;
			focusY: number;
			x: number;
			y: number;
			width: number;
			height: number;
			columnIndex: number;
			localIndex: number;
		}[] = [];

		usableImages.forEach((item) => {
			const ratios = columnHeights.map((value, index) => ({ index, value }));
			ratios.sort((a, b) => a.value - b.value);
			const targetColumn = ratios[0].index;
			const localIndex = columnCounts[targetColumn];
			const x = targetColumn * (columnWidth + safeGap);
			const y = columnHeights[targetColumn];
			const scaledHeight = columnWidth * (item.height / item.width);
			placements.push({
				source: item.source,
				sourceWidth: item.width,
				sourceHeight: item.height,
				focusX: item.focusX,
				focusY: item.focusY,
				x,
				y,
				width: columnWidth,
				height: scaledHeight,
				columnIndex: targetColumn,
				localIndex,
			});
			columnHeights[targetColumn] += scaledHeight + safeGap;
			columnCounts[targetColumn] += 1;
		});

		const totalWidth = columnWidth * safeColumns + safeGap * (safeColumns - 1);
		const scale = frameWidth / totalWidth;
		const scaledGap = safeGap * scale;
		const columnHeightsScaled = columnHeights.map(value => Math.max(0, value * scale - scaledGap));
		const extraGapByColumn = columnHeightsScaled.map((value, index) => {
			const count = columnCounts[index];
			if (count <= 1)
				return 0;
			return Math.max(0, frameHeight - value) / (count - 1);
		});
		const overlap = 0;

		placements.forEach((placement) => {
			const extraGap = extraGapByColumn[placement.columnIndex];
			const rectX = frameX + placement.x * scale;
			const rectY = frameY + placement.y * scale + placement.localIndex * extraGap;
			const rectWidth = placement.width * scale;
			const rectHeight = placement.height * scale;

			const extendLeft = rectX > frameX ? overlap : 0;
			const extendRight = rectX + rectWidth < frameX + frameWidth ? overlap : 0;
			const extendTop = rectY > frameY ? overlap : 0;
			const extendBottom = rectY + rectHeight < frameY + frameHeight ? overlap : 0;

			drawImageWithMask(
				ctx,
				placement.source,
				placement.sourceWidth,
				placement.sourceHeight,
				placement.focusX,
				placement.focusY,
				rectX - extendLeft,
				rectY - extendTop,
				rectWidth + extendLeft + extendRight,
				rectHeight + extendTop + extendBottom,
				{
					left: rectX > frameX,
					right: rectX + rectWidth < frameX + frameWidth,
					top: rectY > frameY,
					bottom: rectY + rectHeight < frameY + frameHeight,
				},
				0,
				true,
			);
		});
	}

	function drawScatteredLayout(
		ctx: CanvasRenderingContext2D,
		frameX: number,
		frameY: number,
		frameWidth: number,
		frameHeight: number,
	) {
		const count = usableImages.length;
		const safeGap = Math.max(0, gap);
		const gridColumns = Math.max(1, Math.ceil(Math.sqrt(count * (frameWidth / frameHeight))));
		const gridRows = Math.ceil(count / gridColumns);
		const cellWidth = (frameWidth - safeGap * (gridColumns - 1)) / gridColumns;
		const cellHeight = (frameHeight - safeGap * (gridRows - 1)) / gridRows;
		const rng = mulberry32(seed);
		const overlap = 0;
		const spread = Math.max(0, Math.min(1, scatterVariation / 100));

		const shuffled = usableImages.toSorted(() => rng() - 0.5);

		shuffled.forEach((item, index) => {
			const col = index % gridColumns;
			const row = Math.floor(index / gridColumns);
			const jitterX = (rng() - 0.5) * cellWidth * (0.1 + spread * 0.4);
			const jitterY = (rng() - 0.5) * cellHeight * (0.1 + spread * 0.4);
			const scale = 1.15 + rng() * (0.35 + spread * 0.25);
			const rotation = (rng() - 0.5) * (Math.PI / 16);

			const rectWidth = cellWidth * scale + overlap * 2;
			const rectHeight = cellHeight * scale + overlap * 2;
			const rectX = frameX + col * (cellWidth + safeGap) + jitterX - overlap;
			const rectY = frameY + row * (cellHeight + safeGap) + jitterY - overlap;

			drawImageWithMask(
				ctx,
				item.source,
				item.width,
				item.height,
				item.focusX,
				item.focusY,
				rectX,
				rectY,
				rectWidth,
				rectHeight,
				{
					left: rectX > frameX,
					right: rectX + rectWidth < frameX + frameWidth,
					top: rectY > frameY,
					bottom: rectY + rectHeight < frameY + frameHeight,
				},
				rotation,
				false,
			);
		});
	}

	function downloadPng() {
		if (!canvasRef)
			return;
		const mime = exportFormat === "jpg" ? "image/jpeg" : "image/png";
		const quality = exportFormat === "jpg" ? Math.min(1, Math.max(0.6, jpgQuality / 100)) : undefined;
		canvasRef.toBlob((blob) => {
			if (!blob)
				return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `collage.${exportFormat}`;
			link.click();
			URL.revokeObjectURL(url);
		}, mime, quality);
	}
</script>

<svelte:head>
	<title>Collage Creator</title>
</svelte:head>

<main class="page-container">
	<a href="{base}/" class="back-link">← Back to Tools</a>

	<h1>🧩 Collage Creator</h1>
	<p class="subtitle">Build clean grids, bold masonry layouts, or scattered collages in seconds.</p>

	<section class="card-section">
		<div class="section-header">
			<h2>Upload Images</h2>
			{#if images.length > 0}
				<button type="button" class="btn btn-small" onclick={clearImages}>Clear All</button>
			{/if}
		</div>
		<div
			class="drop-zone"
			class:has-images={images.length > 0}
			ondrop={handleImageDrop}
			ondragover={handleDragOver}
			role="button"
			tabindex="0"
		>
			<div class="drop-content">
				<span class="upload-icon">📥</span>
				<p>Drag & drop images here</p>
				<p class="text-muted">or</p>
				<div class="drop-actions">
					<label class="btn btn-primary">
						{images.length > 0 ? "Add More Images" : "Browse Images"}
						<input type="file" accept="image/*" multiple onchange={handleImageSelect} hidden />
					</label>
				</div>
				{#if images.length > 0}
					<p class="text-muted">{images.length} image{images.length === 1 ? "" : "s"} ready</p>
				{/if}
			</div>
		</div>
		{#if loadingImages}
			<div class="loading-row">
				<span class="loading-spinner"></span>
				<span>Loading {loadingCount} of {loadingTotal} images…</span>
			</div>
		{/if}
		{#if error}
			<p class="alert alert-error">{error}</p>
		{/if}
		{#if images.length > 0}
			<p class="text-muted reorder-hint">Preview</p>
			<div class="image-grid">
				{#each images as image, index}
					<div class="image-item" role="listitem">
						<img src={image.previewUrl} alt="Preview {index + 1}" />
						<button
							type="button"
							class="image-remove"
							aria-label="Remove image {index + 1}"
							onclick={() => removeImageAt(index)}
						>
							✕
						</button>
						<span class="image-number">{index + 1}</span>
					</div>
				{/each}
			</div>
			<div class="setting-group mt-2">
				<label class="switch">
					<input
						type="checkbox"
						bind:checked={faceDetectionEnabled}
						disabled={!faceDetectorSupported}
						onchange={handleFaceToggle}
					/>
					<span>Face-aware Positioning</span>
				</label>
				<span class="text-muted">
					{#if faceDetectorSupported}
						Detect faces and keep them centered in each crop.
					{:else}
						Face detection is not supported in this browser.
					{/if}
				</span>
				{#if faceDetectionEnabled && (tfjsLoading || detectionInProgress)}
					<span class="text-muted">
						Detecting faces…
					</span>
					{#if detectionTotal > 0}
						<div class="progress-row">
							<div class="progress-track">
								<div class="progress-fill" style="width: {Math.min(100, Math.round((detectionCount / detectionTotal) * 100))}%;"></div>
							</div>
							<span class="progress-text">
								{Math.min(100, Math.round((detectionCount / detectionTotal) * 100))}%
							</span>
						</div>
					{/if}
				{/if}
				{#if faceDetectionEnabled && detectionComplete}
					<span class="text-muted text-success">Face detection complete ✓</span>
				{/if}
				{#if detectionError}
					<span class="text-muted text-warning">{detectionError}</span>
				{/if}
			</div>
		{/if}
	</section>

	<section class="card-section">
		<h2>Canvas Settings</h2>
		<div class="settings-grid">
			<div class="setting-group">
				<label for="aspectRatio">Aspect Ratio</label>
				<select id="aspectRatio" bind:value={aspectRatio}>
					{#each aspectRatios as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<div class="setting-group">
				<label for="resolution">Resolution (width px)</label>
				<input id="resolution" type="number" min="600" max="8000" step="10" bind:value={resolution} />
				<span class="text-muted">{canvasWidth} × {canvasHeight}px</span>
			</div>
		</div>
	</section>

	<section class="card-section">
		<h2>Layout</h2>
		<div class="layout-mode-selector">
			<button
				type="button"
				class="btn layout-btn"
				class:active={layoutMode === "grid"}
				onclick={() => {
					layoutMode = "grid";
				}}
			>
				<span class="layout-icon">▦</span>
				<span class="layout-name">Grid</span>
				<span class="layout-desc">Even rows and columns</span>
			</button>
			<button
				type="button"
				class="btn layout-btn"
				class:active={layoutMode === "masonry"}
				onclick={() => {
					layoutMode = "masonry";
				}}
			>
				<span class="layout-icon">▥</span>
				<span class="layout-name">Masonry</span>
				<span class="layout-desc">Stacked with varied heights</span>
			</button>
			<button
				type="button"
				class="btn layout-btn"
				class:active={layoutMode === "scattered"}
				onclick={() => {
					layoutMode = "scattered";
				}}
			>
				<span class="layout-icon">✦</span>
				<span class="layout-name">Scattered</span>
				<span class="layout-desc">Loose, layered collage</span>
			</button>
		</div>
		<div class="settings-grid mt-2">
			<div class="setting-row">
				<div class="setting-group">
					<label for="columns">Columns</label>
					<input id="columns" type="number" min="1" max="8" bind:value={columns} />
					<span class="text-muted">Applies to grid and masonry</span>
				</div>
				<div class="setting-group">
					<label for="gap">Gap (px)</label>
					<input id="gap" type="number" min="0" max="200" step="1" bind:value={gap} />
				</div>
			</div>
			<div class="setting-group">
				<label for="outerMargin">Outer Margin (px)</label>
				<input id="outerMargin" type="number" min="0" max="300" step="1" bind:value={outerMargin} />
				<span class="text-muted">Adds space between the collage and the canvas edge.</span>
			</div>
			{#if layoutMode === "scattered"}
				<div class="setting-group">
					<label for="scatterVariation">Scatter Variation</label>
					<button class="btn btn-secondary" type="button" onclick={randomizeSeed}>Randomize</button>
					<div class="slider-group">
						<input
							id="scatterVariation"
							type="range"
							min="0"
							max="100"
							bind:value={scatterVariation}
						/>
						<span class="slider-value">{scatterVariation}%</span>
					</div>
					<span class="text-muted">Re-shuffles the scattered layout.</span>
				</div>
			{/if}
		</div>
		{#if gridDropCount > 0}
			<p class="alert alert-warning">
				{gridDropCount} image{gridDropCount === 1 ? "" : "s"} dropped to keep the grid even.
			</p>
		{/if}
	</section>

	<section class="card-section">
		<h2>Background</h2>
		<div class="settings-grid">
			<div class="setting-group">
				<label for="backgroundType">Background Type</label>
				<select id="backgroundType" bind:value={backgroundType}>
					<option value="color">Solid Color</option>
					<option value="gradient">Gradient</option>
					<option value="image">Image</option>
				</select>
			</div>
			{#if backgroundType === "color"}
				<div class="color-picker-section">
					<div class="color-preview-large" style="background: {backgroundColor};"></div>
					<div class="color-controls">
						<label class="color-input-row" for="backgroundColor">
							<span>Color</span>
							<input id="backgroundColor" type="color" bind:value={backgroundColor} />
							<input class="color-hex-input" type="text" bind:value={backgroundColor} />
						</label>
					</div>
				</div>
			{:else if backgroundType === "gradient"}
				<div class="gradient-picker-section">
					<div
						class="color-preview-large"
						style="background: linear-gradient({gradientAngle}deg, {gradientColorStart}, {gradientColorEnd});"
					></div>
					<div class="gradient-controls">
						<label class="color-input-row" for="gradientColorStart">
							<span>Start</span>
							<input id="gradientColorStart" type="color" bind:value={gradientColorStart} />
							<input class="color-hex-input" type="text" bind:value={gradientColorStart} />
						</label>
						<label class="color-input-row" for="gradientColorEnd">
							<span>End</span>
							<input id="gradientColorEnd" type="color" bind:value={gradientColorEnd} />
							<input class="color-hex-input" type="text" bind:value={gradientColorEnd} />
						</label>
						<div class="color-input-row">
							<span>Angle</span>
							<input id="gradientAngle" type="number" min="0" max="360" bind:value={gradientAngle} />
						</div>
					</div>
				</div>
			{:else}
				<div class="setting-group">
					<label for="backgroundImage">Background Image</label>
					<div class="bg-upload">
						{#if backgroundUrl}
							<img src={backgroundUrl} alt="Background preview" />
						{/if}
						<div class="bg-upload-actions">
							<label class="btn btn-primary">
								{backgroundFile ? "Replace Image" : "Upload Image"}
								<input id="backgroundImage" type="file" accept="image/*" onchange={handleBackgroundSelect} hidden />
							</label>
							{#if backgroundFile}
								<button class="btn btn-secondary" type="button" onclick={clearBackgroundImage}>Remove</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<section class="card-section">
		<h2>Feather & Overlap</h2>
		<div class="settings-grid">
			<div class="setting-group">
				<label class="switch">
					<input type="checkbox" bind:checked={featherEnabled} />
					<span>Enable Feathering</span>
				</label>
				<span class="text-muted">Softly blend overlaps without affecting the outer edges.</span>
			</div>
			<div class="setting-group">
				<label class="switch">
					<input type="checkbox" bind:checked={roundedCorners} />
					<span>Rounded Corners</span>
				</label>
				<span class="text-muted">Smooth corners on each image.</span>
			</div>
			{#if featherEnabled}
				<div class="setting-group">
					<label for="featherAmount">Feather Strength (px)</label>
					<input id="featherAmount" type="number" min="4" max="120" step="1" bind:value={featherAmount} />
				</div>
			{/if}
			{#if roundedCorners}
				<div class="setting-group">
					<label for="cornerRadius">Corner Radius (px)</label>
					<input id="cornerRadius" type="number" min="0" max="120" step="1" bind:value={cornerRadius} />
				</div>
			{/if}
		</div>
	</section>

	<section class="card-section">
		<h2>Preview</h2>
		<div class="preview-grid">
			<div class="canvas-panel">
				<canvas bind:this={canvasRef} class="collage-canvas"></canvas>
				<div class="export-row">
					<div class="setting-group">
						<label for="exportFormat">Export Format</label>
						<select id="exportFormat" bind:value={exportFormat}>
							<option value="png">PNG</option>
							<option value="jpg">JPEG</option>
						</select>
					</div>
					{#if exportFormat === "jpg"}
						<div class="setting-group">
							<label for="jpgQuality">JPEG Quality</label>
							<input id="jpgQuality" type="number" min="60" max="100" step="1" bind:value={jpgQuality} />
						</div>
					{/if}
				</div>
				<div class="preview-actions">
					<button class="btn btn-primary" type="button" onclick={downloadPng}>
						Download {exportFormat === "png" ? "PNG" : "JPEG"}
					</button>
					<button class="btn btn-secondary" type="button" onclick={queueDraw}>Refresh Preview</button>
				</div>
			</div>
			<div class="preview-info">
				<h3>Quick Tips</h3>
				<ul>
					<li>Grid drops extra images so every row stays even.</li>
					<li>Masonry auto-fills the canvas and crops when needed.</li>
					<li>Scattered uses the seed for repeatable layouts.</li>
				</ul>
			</div>
		</div>
	</section>
</main>

<style>
	.preview-grid {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.canvas-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.collage-canvas {
		width: 100%;
		height: auto;
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: #0f172a;
	}

	.preview-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.drop-zone {
		border: 2px dashed #cbd5e1;
		border-radius: 16px;
		padding: 1.5rem;
		background: #f8fafc;
		transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
	}

	.drop-zone.has-images {
		border-color: #a5b4fc;
		background: #f8fafc;
	}

	.drop-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.bg-upload {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 12px;
		border: 1px solid #e2e8f0;
		background: #f8fafc;
	}

	.bg-upload img {
		width: 100%;
		max-height: 160px;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid #e2e8f0;
	}

	.bg-upload-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.export-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
	}

	.slider-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.slider-value {
		min-width: 48px;
		text-align: right;
		font-weight: 600;
		color: #334155;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.loading-row {
		margin-top: 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 600;
		color: #1f2937;
	}

	.loading-spinner {
		width: 18px;
		height: 18px;
		border-radius: 999px;
		border: 2px solid #e2e8f0;
		border-top-color: #007acc;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.image-grid {
		margin-top: 0.75rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	.image-item {
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		background: #0f172a;
		border: 1px solid #e2e8f0;
		aspect-ratio: 1 / 1;
	}

	.image-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.image-number {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		background: rgba(15, 23, 42, 0.85);
		color: white;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.image-remove {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		border: none;
		background: rgba(15, 23, 42, 0.85);
		color: white;
		font-size: 0.9rem;
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.image-remove:hover {
		background: rgba(239, 68, 68, 0.9);
	}

	.layout-mode-selector {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}

	.layout-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1rem;
		background: white;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.layout-btn:hover {
		border-color: #007acc;
	}

	.layout-btn.active {
		border-color: #007acc;
		background: #f0f7ff;
	}

	.layout-icon {
		font-size: 1.75rem;
	}

	.layout-name {
		font-weight: 600;
		color: #2d3748;
	}

	.layout-desc {
		font-size: 0.8rem;
		color: #718096;
		text-align: center;
	}

	.color-picker-section,
	.gradient-picker-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		grid-column: 1 / -1;
	}

	.color-preview-large {
		width: 100%;
		height: 120px;
		border-radius: 8px;
		border: 1px solid #e2e8f0;
	}

	.color-controls,
	.gradient-controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.color-input-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.color-input-row span {
		min-width: 60px;
		font-weight: 500;
		color: #4a5568;
	}

	.color-input-row input[type="color"] {
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		padding: 0;
		background: none;
	}

	.color-input-row input[type="color"]::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-input-row input[type="color"]::-webkit-color-swatch {
		border: 1px solid #e2e8f0;
		border-radius: 6px;
	}

	.color-hex-input {
		width: 90px;
		padding: 0.5rem;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-family: monospace;
		font-size: 0.9rem;
	}

	.setting-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		grid-column: 1 / -1;
	}

	.mt-2 {
		margin-top: 1.5rem;
	}

	.alert {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-size: 0.95rem;
	}

	.alert-warning {
		background: rgba(251, 191, 36, 0.2);
		color: #92400e;
	}

	.alert-error {
		background: rgba(248, 113, 113, 0.2);
		color: #991b1b;
	}

	.text-warning {
		color: #b45309;
		font-weight: 600;
	}

	.text-success {
		color: #15803d;
		font-weight: 600;
	}

	.progress-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.progress-track {
		flex: 1;
		height: 8px;
		border-radius: 999px;
		background: #e2e8f0;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #38bdf8, #6366f1);
		border-radius: 999px;
		transition: width 0.2s ease;
	}

	.progress-text {
		min-width: 44px;
		text-align: right;
		font-weight: 600;
		color: #475569;
	}

	.preview-info ul {
		padding-left: 1.2rem;
		margin: 0;
		color: #475569;
	}

	.switch {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-weight: 600;
	}

	@media (max-width: 900px) {
		.preview-grid {
			grid-template-columns: 1fr;
		}

		.setting-row {
			grid-template-columns: 1fr;
		}
	}
</style>
