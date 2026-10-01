<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";
	import { Upload } from "@lucide/svelte";

	interface Props {
		accept: string;
		label: string;
		multiple?: boolean;
		class?: string;
		onfiles: (files: File[], source: "drop" | "select") => void;
		children?: Snippet;
	}

	const { accept, label, multiple = false, class: className, onfiles, children }: Props = $props();

	function handleChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? [...input.files] : [];
		// Reset so choosing the same file again still fires `change`.
		input.value = "";
		onfiles(files, "select");
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		onfiles(event.dataTransfer?.files ? [...event.dataTransfer.files] : [], "drop");
	}
</script>

<label
	class={cn("border-input hover:border-ring hover:bg-accent bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors", className)}
	ondrop={handleDrop}
	ondragover={event => event.preventDefault()}
>
	<Upload class="text-muted-foreground size-9" />
	<p class="font-medium">{label}</p>
	<p class="text-muted-foreground text-sm">or click to browse</p>
	{@render children?.()}
	<input type="file" {accept} {multiple} onchange={handleChange} hidden />
</label>
