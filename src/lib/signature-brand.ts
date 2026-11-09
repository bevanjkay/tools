export interface SocialLink {
	label: string;
	url: string;
}

export interface SignatureBrand {
	/** Organisation name, used for the logo alt text and plain-text output. */
	name: string;
	/** Absolute https URL; Gmail drops data: URIs and SVG. */
	logoUrl: string;
	/** Displayed size in CSS px; the hosted file should be about twice this. */
	logoWidth: number;
	logoHeight: number;
	/** Name colour and divider; must meet WCAG AA on white. */
	accentColor: string;
	textColor: string;
	mutedColor: string;
	fontStack: string;
	website: string;
	websiteLabel: string;
	addressLine: string;
	socials: SocialLink[];
}

export const SOCIAL_SLOTS = 3;

export function emptyBrand(): SignatureBrand {
	return {
		name: "",
		logoUrl: "",
		logoWidth: 96,
		logoHeight: 96,
		accentColor: "#1d4ed8",
		textColor: "#111827",
		mutedColor: "#4b5563",
		fontStack: "Arial, Helvetica, sans-serif",
		website: "",
		websiteLabel: "",
		addressLine: "",
		socials: Array.from({ length: SOCIAL_SLOTS }, () => ({ label: "", url: "" })),
	};
}
