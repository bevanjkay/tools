<script lang="ts">
	import type QRCodeStyling from "qr-code-styling";
	import { resolve as resolvePath } from "$app/paths";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { Slider } from "$lib/components/ui/slider";
	import { cn } from "$lib/utils";
	import { QrCode } from "@lucide/svelte";
	import { onMount } from "svelte";

	type DotType = "square" | "dots" | "rounded" | "extra-rounded" | "classy" | "classy-rounded";
	type CornerSquareType = "square" | "dot" | "extra-rounded";
	type CornerDotType = "square" | "dot";
	type ErrorLevel = "L" | "M" | "Q" | "H";
	type Extension = "png" | "jpeg" | "svg";

	const dotTypes: { value: DotType; label: string }[] = [
		{ value: "square", label: "Square" },
		{ value: "dots", label: "Dots" },
		{ value: "rounded", label: "Rounded" },
		{ value: "extra-rounded", label: "Extra Rounded" },
		{ value: "classy", label: "Classy" },
		{ value: "classy-rounded", label: "Classy Rounded" },
	];

	const cornerSquareTypes: { value: CornerSquareType; label: string }[] = [
		{ value: "square", label: "Square" },
		{ value: "dot", label: "Dot" },
		{ value: "extra-rounded", label: "Extra Rounded" },
	];

	const cornerDotTypes: { value: CornerDotType; label: string }[] = [
		{ value: "square", label: "Square" },
		{ value: "dot", label: "Dot" },
	];

	const errorLevels: { value: ErrorLevel; label: string }[] = [
		{ value: "L", label: "Low (7%)" },
		{ value: "M", label: "Medium (15%)" },
		{ value: "Q", label: "Quartile (25%)" },
		{ value: "H", label: "High (30%)" },
	];

	let mode = $state<"basic" | "styled">("basic");
	let data = $state("https://bevankay.me");
	let size = $state(320);
	let margin = $state(12);
	let errorLevel = $state<ErrorLevel>("Q");

	let dotType = $state<DotType>("rounded");
	let dotColor = $state("#1a202c");
	let useGradient = $state(false);
	let dotColor2 = $state("#007acc");
	let gradientType = $state<"linear" | "radial">("linear");
	let gradientRotation = $state(0);

	let bgColor = $state("#ffffff");
	let transparentBg = $state(false);

	let cornerSquareType = $state<CornerSquareType>("extra-rounded");
	let cornerSquareColor = $state("#1a202c");
	let cornerDotType = $state<CornerDotType>("dot");
	let cornerDotColor = $state("#007acc");

	let logoDataUrl = $state<string | null>(null);
	let logoName = $state("");
	let logoSize = $state(0.4);
	let logoMargin = $state(6);
	let hideBackgroundDots = $state(true);

	let downloadExtension = $state<Extension>("png");

	let previewEl = $state<HTMLDivElement>();
	let qrCode = $state<QRCodeStyling | null>(null);
	let QrCtor = $state<typeof QRCodeStyling | null>(null);

	function buildOptions() {
		const base = {
			width: size,
			height: size,
			type: "canvas" as const,
			data: data.trim() || " ",
			margin,
			qrOptions: { errorCorrectionLevel: errorLevel },
		};

		if (mode === "basic") {
			return {
				...base,
				image: undefined,
				dotsOptions: { type: "square" as DotType, color: "#000000", gradient: undefined },
				backgroundOptions: { color: "#ffffff" },
				cornersSquareOptions: { type: "square" as CornerSquareType, color: "#000000" },
				cornersDotOptions: { type: "square" as CornerDotType, color: "#000000" },
				imageOptions: { crossOrigin: "anonymous" as const, margin: 0, imageSize: 0.4, hideBackgroundDots: true },
			};
		}

		const gradient = useGradient
			? {
				type: gradientType,
				rotation: (gradientRotation * Math.PI) / 180,
				colorStops: [
					{ offset: 0, color: dotColor },
					{ offset: 1, color: dotColor2 },
				],
			}
			: undefined;

		return {
			...base,
			image: logoDataUrl ?? undefined,
			dotsOptions: {
				type: dotType,
				color: useGradient ? undefined : dotColor,
				gradient,
			},
			backgroundOptions: {
				color: transparentBg ? "transparent" : bgColor,
			},
			cornersSquareOptions: {
				type: cornerSquareType,
				color: cornerSquareColor,
			},
			cornersDotOptions: {
				type: cornerDotType,
				color: cornerDotColor,
			},
			imageOptions: {
				crossOrigin: "anonymous" as const,
				margin: logoMargin,
				imageSize: logoSize,
				hideBackgroundDots,
			},
		};
	}

	onMount(async () => {
		const mod = await import("qr-code-styling");
		QrCtor = mod.default;
		qrCode = new QrCtor(buildOptions());
		if (previewEl)
			qrCode.append(previewEl);
	});

	$effect(() => {
		const options = buildOptions();
		if (qrCode)
			qrCode.update(options);
	});

	function onLogoChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file)
			return;
		logoName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			logoDataUrl = typeof reader.result === "string" ? reader.result : null;
		};
		reader.readAsDataURL(file);
	}

	function removeLogo() {
		logoDataUrl = null;
		logoName = "";
	}

	async function download() {
		if (!QrCtor || !data.trim())
			return;
		const type = downloadExtension === "svg" ? "svg" : "canvas";
		const instance = new QrCtor({ ...buildOptions(), type });
		await instance.download({ name: "qr-code", extension: downloadExtension });
	}

	const colorInputClass = "border-input h-9 w-full cursor-pointer rounded-md border bg-transparent p-1";
	const fieldClass = "grid gap-1.5";
</script>

<svelte:head>
	<title>QR Code Generator</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<a href={resolvePath("/")} class="text-primary mb-6 inline-block text-sm hover:underline">← Back to Tools</a>

	<h1 class="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
		<QrCode class="text-primary size-7" />
		QR Code Generator
	</h1>
	<p class="text-muted-foreground mb-8">Create custom QR codes with your own colors, dot styles, and logo.</p>

	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Content</Card.Title>
		</Card.Header>
		<Card.Content class={fieldClass}>
			<Label for="qr-data">Text or URL to encode</Label>
			<Input id="qr-data" type="text" bind:value={data} placeholder="https://example.com" />
		</Card.Content>
	</Card.Root>

	<div class="grid items-start gap-6 md:grid-cols-[1fr_340px]">
		<Card.Root>
			<Card.Content class="space-y-4">
				<div class="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
					<Button variant={mode === "basic" ? "default" : "ghost"} size="sm" onclick={() => (mode = "basic")}>Basic</Button>
					<Button variant={mode === "styled" ? "default" : "ghost"} size="sm" onclick={() => (mode = "styled")}>Styled</Button>
				</div>
				{#if mode === "basic"}
					<p class="text-muted-foreground text-sm">Plain black-and-white QR code. Switch to Styled to customise colors, shapes, and add a logo.</p>
				{/if}

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<div class={fieldClass}>
						<Label for="qr-size">Size (px)</Label>
						<Input id="qr-size" type="number" min={120} max={1024} step={8} bind:value={size} />
					</div>
					<div class={fieldClass}>
						<Label for="qr-margin">Margin (px)</Label>
						<Input id="qr-margin" type="number" min={0} max={80} step={1} bind:value={margin} />
					</div>
					<div class={fieldClass}>
						<Label for="qr-ec">Error correction</Label>
						<Select id="qr-ec" bind:value={errorLevel}>
							{#each errorLevels as level (level.value)}
								<option value={level.value}>{level.label}</option>
							{/each}
						</Select>
					</div>
				</div>

				{#if mode === "styled"}
					<div>
						<h3 class="text-foreground mb-2 text-sm font-semibold">Dots</h3>
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
							<div class={fieldClass}>
								<Label for="qr-dot-type">Dot style</Label>
								<Select id="qr-dot-type" bind:value={dotType}>
									{#each dotTypes as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</div>
							<div class={fieldClass}>
								<Label for="qr-dot-color">{useGradient ? "Gradient start" : "Dot color"}</Label>
								<input id="qr-dot-color" type="color" bind:value={dotColor} class={colorInputClass} />
							</div>
							{#if useGradient}
								<div class={fieldClass}>
									<Label for="qr-dot-color-2">Gradient end</Label>
									<input id="qr-dot-color-2" type="color" bind:value={dotColor2} class={colorInputClass} />
								</div>
							{/if}
						</div>
					</div>

					<div class="flex items-center gap-2">
						<Checkbox id="use-gradient" bind:checked={useGradient} />
						<Label for="use-gradient">Use gradient fill</Label>
					</div>

					{#if useGradient}
						<div class="grid grid-cols-2 gap-3">
							<div class={fieldClass}>
								<Label for="qr-grad-type">Gradient type</Label>
								<Select id="qr-grad-type" bind:value={gradientType}>
									<option value="linear">Linear</option>
									<option value="radial">Radial</option>
								</Select>
							</div>
							{#if gradientType === "linear"}
								<div class={fieldClass}>
									<Label for="qr-grad-rot">Rotation ({gradientRotation}°)</Label>
									<div class="flex h-9 items-center"><Slider type="single" min={0} max={360} step={5} bind:value={gradientRotation} /></div>
								</div>
							{/if}
						</div>
					{/if}

					<div>
						<h3 class="text-foreground mb-2 text-sm font-semibold">Corners</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class={fieldClass}>
								<Label for="qr-cs-type">Corner frame</Label>
								<Select id="qr-cs-type" bind:value={cornerSquareType}>
									{#each cornerSquareTypes as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</div>
							<div class={fieldClass}>
								<Label for="qr-cs-color">Frame color</Label>
								<input id="qr-cs-color" type="color" bind:value={cornerSquareColor} class={colorInputClass} />
							</div>
							<div class={fieldClass}>
								<Label for="qr-cd-type">Corner dot</Label>
								<Select id="qr-cd-type" bind:value={cornerDotType}>
									{#each cornerDotTypes as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</div>
							<div class={fieldClass}>
								<Label for="qr-cd-color">Corner dot color</Label>
								<input id="qr-cd-color" type="color" bind:value={cornerDotColor} class={colorInputClass} />
							</div>
						</div>
					</div>

					<div>
						<h3 class="text-foreground mb-2 text-sm font-semibold">Background</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class={fieldClass}>
								<Label for="qr-bg-color">Background color</Label>
								<input id="qr-bg-color" type="color" bind:value={bgColor} disabled={transparentBg} class={cn(colorInputClass, "disabled:opacity-50")} />
							</div>
						</div>
						<div class="mt-3 flex items-center gap-2">
							<Checkbox id="transparent-bg" bind:checked={transparentBg} />
							<Label for="transparent-bg">Transparent background</Label>
						</div>
					</div>

					<div>
						<h3 class="text-foreground mb-2 text-sm font-semibold">Logo</h3>
						<label for="qr-logo" class={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
							{logoName ? "Change logo" : "Upload logo"}
							<input id="qr-logo" type="file" accept="image/*" onchange={onLogoChange} hidden />
						</label>
						{#if logoDataUrl}
							<div class="mt-3 flex items-center gap-3">
								<img class="border-input bg-muted size-10 rounded-md border object-contain" src={logoDataUrl} alt="Logo preview" />
								<span class="text-muted-foreground min-w-0 flex-1 truncate text-sm">{logoName}</span>
								<Button variant="destructive" size="sm" onclick={removeLogo}>Remove</Button>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-3">
								<div class={fieldClass}>
									<Label for="qr-logo-size">Logo size ({Math.round(logoSize * 100)}%)</Label>
									<div class="flex h-9 items-center"><Slider type="single" min={0.1} max={0.6} step={0.05} bind:value={logoSize} /></div>
								</div>
								<div class={fieldClass}>
									<Label for="qr-logo-margin">Logo margin (px)</Label>
									<Input id="qr-logo-margin" type="number" min={0} max={40} step={1} bind:value={logoMargin} />
								</div>
							</div>
							<div class="mt-3 flex items-center gap-2">
								<Checkbox id="hide-bg-dots" bind:checked={hideBackgroundDots} />
								<Label for="hide-bg-dots">Hide dots behind logo</Label>
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="md:sticky md:top-4">
			<Card.Header>
				<Card.Title>Preview</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="bg-card grid min-h-[200px] place-items-center rounded-xl border p-4" class:checker={mode === "styled" && transparentBg}>
					<div bind:this={previewEl} class="[&_canvas]:h-auto [&_canvas]:max-w-full [&_svg]:h-auto [&_svg]:max-w-full"></div>
				</div>

				<div class="mt-4 flex gap-2">
					<div class="w-24">
						<Select bind:value={downloadExtension} aria-label="Download format">
							<option value="png">PNG</option>
							<option value="jpeg">JPEG</option>
							<option value="svg">SVG</option>
						</Select>
					</div>
					<Button class="flex-1" onclick={download} disabled={!data.trim()}>Download</Button>
				</div>
				{#if mode === "styled" && transparentBg && downloadExtension === "jpeg"}
					<p class="text-muted-foreground mt-2 text-sm">JPEG has no transparency — the background will be filled.</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</main>

<style>
	.checker {
		background-color: #fff;
		background-image:
			linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
			linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
			linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
		background-size: 20px 20px;
		background-position: 0 0, 0 10px, 10px -10px, -10px 0;
	}
</style>
